# ADR-001: Extension 状態管理の永続化と日付ベースバッファ設計

> **ステータス**: Accepted  
> **作成日**: 2026-03-01  
> **決定者**: Owner + AI

---

## 背景 (Context)

S01 初版の Chrome Extension Service Worker は、利用時間データを **インメモリの `state` オブジェクト** で管理していた。これには以下の根本的な問題がある。

### 問題 1: Service Worker ライフサイクルによるデータ消失

Chrome Manifest V3 の Service Worker は、Chrome のイベントドリブンモデルに従い **アイドル状態が約 30 秒続くと自動的に停止** される（Chrome 110 以降、一部条件で延長されるが保証なし）。再起動時にインメモリ状態はすべて失われる。

つまり、現状の設計では:

- ユーザーが Chrome を一時的に非アクティブにしただけで `logBuffer` が消失し、未送信ログが失われる
- `currentAppName` / `trackingStartTime` も消失し、計測が途切れる
- `deviceId` は `chrome.storage.local` に保存しているため問題ないが、それ以外の状態が脆弱

### 問題 2: バッファ構造が利用目的と不一致

現状のバッファは「イベント発生時の断片的なログ」の配列であり、本来集計したい「**1日あたりのアプリ別合計利用時間**」とは構造が異なる。

- API に送信するたびに細切れのログが大量に発生する（60 秒ごとの断片）
- サーバー側で再集計する前提となっており、ネットワーク効率が悪い
- 日付の境界（0:00 リセット）が考慮されていない

---

## 検討した選択肢

### 選択肢 A: インメモリ + 定期的に chrome.storage に同期

- Service Worker 停止に備え、タイマーやイベントハンドラ内で `chrome.storage.local` に state を書き込む
- 起動時に `chrome.storage.local` から復元
- **問題**: イベントハンドラの完了前に Service Worker が停止する edge case あり。バッファ構造の問題は未解決

### 選択肢 B: chrome.storage.local をプライマリストアとする（日付×アプリの累積モデル）

- `chrome.storage.local` 上に **日付をキーとしたアプリ別累積使用時間** をプライマリデータとして保持
- Service Worker のインメモリ状態は「現在の計測セッション情報」のみに限定
- `stopTracking()` 時に即座に `chrome.storage.local` の該当日付・アプリのカウンターに加算
- API 送信は `chrome.storage.local` から日付ベースのサマリーを読み出して送信
- 送信成功後にフラグを立て、同日の再送を防止

### 選択肢 C: IndexedDB を使用

- より複雑なクエリやトランザクションが可能
- **問題**: Service Worker からの IndexedDB アクセスは可能だが、API が `chrome.storage` に比べて冗長。今回の用途（日付×アプリの累積秒数）は単純な key-value で十分であり、複雑さに見合うメリットがない

---

## 決定 (Decision)

**選択肢 B** を採用する。

### データ構造

`chrome.storage.local` に以下のキーで永続化する:

```javascript
/**
 * chrome.storage.local のデータ構造
 */
{
  // デバイスID（既存。変更なし）
  "deviceId": "uuid-string",

  // API エンドポイント（既存。変更なし）
  "apiEndpoint": "https://...",

  // 現在の計測セッション情報
  // Service Worker 再起動時に復元
  "trackingSession": {
    "appName": "youtube.com",   // 現在計測中のアプリ名
    "startTime": 1709280000000  // 計測開始時刻 (ms since epoch)
  },

  // 日付ベースの利用時間バッファ
  // キー: "dailyUsage"
  // 値: 日付 → アプリ → 累積秒数 のマップ
  "dailyUsage": {
    "2026-03-01": {
      "chrome": { "totalSeconds": 1200, "lastUpdated": "2026-03-01T10:30:00Z" },
      "youtube.com": { "totalSeconds": 600, "lastUpdated": "2026-03-01T10:25:00Z" }
    },
    "2026-02-28": {
      "chrome": { "totalSeconds": 3600, "lastUpdated": "2026-02-28T23:50:00Z" }
    }
  },

  // 送信済みフラグ（日付ごと）
  "sentDates": ["2026-02-27", "2026-02-26"]
}
```

### 日付をトップレベルの管理単位とする理由

「appName の下に日付を持つ」構造（`{ "chrome": { "2026-03-01": 1200, "2026-02-28": 3600 } }`）ではなく、**日付をトップレベル** にした理由:

1. **データのライフサイクルが日付単位**: 古い日付はまるごと削除（ガベージコレクション）したい。日付がトップレベルならキーの走査で一括削除が容易
2. **API 送信の単位が日付**: 「2026-03-01 の全アプリ分」を一括送信する。送信済みフラグも日付単位
3. **日をまたいだ計測の分割**: 23:59 → 0:00 を跨ぐ場合、日付がトップレベルなら両方の日付エントリに自然に加算できる
4. **基本設計書の `dailyLogs` と整合**: サーバー側の `dailyLogs` コレクションも `{deviceId}_{appName}_{YYYY-MM-DD}` というドキュメント ID で日付が最上位単位

### バッファのライフサイクル

| 状態                     | 説明                                                                | 保持期間                             |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------ |
| 当日分                   | 計測対象。`stopTracking()` で加算。60秒ごとにサーバーに upsert 送信 | 0:00〜23:59 の間、継続的に更新・送信 |
| 前日〜3日前              | 未送信バックアップ or 送信失敗時のリトライ対象                      | 最大3日保持                          |
| 4日以上前                | 不要。ガベージコレクション対象                                      | `initialize()` 時に削除              |
| 送信済み（過去日付のみ） | `sentDates` に日付を記録。当日分は対象外                            | 送信成功でエントリ追加               |

### API 送信データの変更

Extension から API への送信単位を「イベント断片」から「日付別アプリ別サマリー」に変更する:

```json
{
  "deviceId": "uuid-string",
  "date": "2026-03-01",
  "appName": "youtube.com",
  "totalSeconds": 1200,
  "lastUpdated": "2026-03-01T10:30:00.000Z"
}
```

### 送信タイミングの設計

| 対象         | 送信タイミング                      | 送信条件                          |
| ------------ | ----------------------------------- | --------------------------------- |
| **当日分**   | 60秒アラームごと / フォーカス喪失時 | 毎回送信（最新の累積値で upsert） |
| **過去日付** | 60秒アラームごと / フォーカス喪失時 | `sentDates` に含まれない場合のみ  |

**当日分を毎アラームで送信する理由:**

- モバイルアプリが Firestore の `onSnapshot` で当日の利用状況をリアルタイム参照できる
- 最大60秒の遅延で、保護者は子供の当日利用時間を確認可能
- サーバー側が upsert (`set({ merge: true })`) のため、同一ドキュメントへの繰り返し書き込みは冪等で安全
- `sentDates` は過去日付の完了管理にのみ使用し、当日分は常に対象外とする

これにより:

- サーバー側の集計処理が簡素化（受け取ったデータでそのまま `dailyLogs` を upsert 可能）
- 基本設計書の `dailyLogs` の `totalMinutes` フィールドに直変換できる（`totalSeconds / 60`）

### Service Worker ライフサイクルへの対応

```
Service Worker 起動（initialize）
  │
  ├─ chrome.storage.local から復元:
  │   ├─ deviceId
  │   ├─ trackingSession（前回停止時の計測中セッション）
  │   └─ dailyUsage（日付別バッファ）
  │
  ├─ 古い日付データのガベージコレクション（4日以上前を削除）
  │
  ├─ trackingSession が存在する場合:
  │   ├─ 前回の停止時刻（startTime）から現在までの経過時間を計算
  │   ├─ ※ Service Worker が停止していた期間を「非アクティブ」として扱い、
  │   │   startTime〜Service Worker 停止時点の時間は計測しない（推定不可能なため破棄）
  │   └─ trackingSession をクリア
  │
  └─ 未送信の過去日付データがあれば送信を試みる
```

### Options ページの位置づけ

Options ページの API エンドポイント設定は S01 スコープとして維持する（Emulator への接続先設定として必要）。OTP 入力やペアリング UI は S02 で追加する。

---

## 根拠 (Rationale)

1. **Chrome 公式ドキュメントの推奨**: [Manifest V3 migration guide](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers) は、Service Worker が任意のタイミングで停止されることを前提に、永続化が必要なデータは `chrome.storage` API を使用することを推奨している

2. **`chrome.storage.local` の特性**: 拡張機能に 10MB のストレージが割り当てられ（`unlimitedStorage` パーミッションで拡張可能）、日付×アプリの累積データには十分。read/write は非同期だが数 ms で完了する

3. **日付ベース設計と `dailyLogs` の整合**: サーバー側の Firestore `dailyLogs` コレクション（基本設計書 §3）が `{deviceId}_{appName}_{YYYY-MM-DD}` 単位で設計されており、Extension 側も同じ粒度でデータを管理することで、変換ロジックが不要になる

4. **バッファサイズの自然な制約**: 日付ベースなら「最大アプリ数 × 保持日数」でバッファサイズが決まり、件数ベースの `MAX_BUFFER_SIZE` よりも予測しやすい

---

## 影響範囲 (Consequences)

### Extension 側

- `service-worker.js`: インメモリ state → `chrome.storage.local` ベースに全面リファクタ
- `constants.js`: バッファ関連定数を日付ベースに変更
- `api.js`: 送信データ形式を日付別サマリーに変更
- `popup.js`: ステータス表示を新構造に合わせて更新
- `tracking.js`: `getToday()` ユーティリティ関数を追加

### Functions 側

- `validation.ts`: バリデーションスキーマを新送信形式に対応
- `usageLogs.ts`: 受信データの Firestore 保存ロジックを更新（upsert パターンの導入は S02 以降で検討）
- `validation.test.ts`: テストケースを新スキーマに対応

### ドキュメント

- `docs/detail-design/phase1/s01-core-tracking-pipeline.md`: 状態管理・バッファ設計・API 仕様を更新
