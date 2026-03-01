# ADR-002: Unknown appName の収集ポリシーと etag による送信最適化

> **ステータス**: Accepted  
> **作成日**: 2026-03-01  
> **決定者**: Owner + AI  
> **関連**: ADR-001（日付ベースバッファ設計）

---

## 背景 (Context)

S01 スプリントの実機テスト（Mac + Firebase Emulator 環境）で、以下の2つの問題が発見された。

### 問題 1: appName が "null" として Firestore に保存される

`determineAppName()` は、以下のケースで `null` を返していた:

- PWA ウィンドウ（`type === "app"` / `"popup"`）でタブ情報が取得できない場合
- PWA ウィンドウでタブの URL が空の場合
- devtools 等の未知のウィンドウタイプ（`type !== "normal"` かつ `type !== "app"` / `"popup"`）

`null` を返した場合、API 送信時に JSON シリアライズで文字列 `"null"` に変換され、Firestore に `appName: "null"` として保存されていた。

**オーナーの指摘**: この「特定できないウィンドウ」の利用時間データは **捨ててはならない**。Chromebook の利用時間を監視・集計するという本来の目的を考えると、アプリ名が特定できなくてもデバイスが使用されていた事実は記録すべきである。

### 問題 2: dailyUsage に変更がなくても60秒ごとに API を送信し続ける

60秒アラームの `flushUsageData()` は、送信対象データが存在する限り毎回 API リクエストを行っていた。計測対象のウィンドウが非アクティブ（例: 開発中に VSCode を使用している間）であっても、前回送信と同一のデータでリクエストが発行され続ける。

これは以下の2点で問題である:

1. **Chromebook の性能**: 貧弱な端末での無駄なネットワーク処理はユーザビリティを低下させる
2. **Firebase Functions のコスト**: 同一データに対する冗長な Function 呼び出しは無駄なコスト

---

## 検討した選択肢

### 問題 1: appName が null のケース

#### 選択肢 A: null を返さず `"unknown"` として計測対象に含める

- `determineAppName()` のフォールバックを `null` → `"unknown"` に変更
- サーバー側では `"unknown"` を通常の appName として受け入れ・保存
- モバイルアプリ UI で「その他」としてグルーピング表示する

#### 選択肢 B: null のまま保持し、API 送信前にフィルタリング

- `null` の利用時間は計測はするがサーバーに送信しない
- **問題**: 本来の目的（デバイスの利用時間把握）に反する。特定できないウィンドウの利用時間が消失する

#### 選択肢 C: null を API レイヤーで `"unknown"` に変換

- `determineAppName()` は `null` を返す現状のまま
- API 送信直前に `null` → `"unknown"` に変換
- **問題**: 変換ロジックが分散し、バッファ内のデータと送信データで appName が異なる不整合が生じる

### 問題 2: 不要な API 送信

#### 選択肢 D: dailyUsage の深い比較（deep equality）

- 前回送信時の dailyUsage を丸ごと保存し、`JSON.stringify` で比較
- **問題**: dailyUsage のサイズが大きくなるとストレージ使用量が倍増し、比較のシリアライズコストも増加する

#### 選択肢 E: lastUpdated のタイムスタンプベース比較

- 各エントリの `lastUpdated` が前回送信時と同一かどうかを個別に確認
- **問題**: 日付やアプリが増減した場合の差分検出が煩雑

#### 選択肢 F: etag（軽量ハッシュ）による差分検出

- 送信対象データの日付・アプリ名・`totalSeconds`・`lastUpdated` をソート済みで連結し、djb2 ハッシュを計算
- 前回送信成功時のハッシュ値（etag）を `chrome.storage.local` に保存し、次回送信時に比較
- ハッシュが一致すれば API 送信をスキップ

---

## 決定 (Decision)

### 問題 1: **選択肢 A** — `"unknown"` として計測対象に含める

`determineAppName()` の全フォールバックパスで `null` ではなく `APP_NAME_UNKNOWN`（`"unknown"`）を返す。

**変更対象:**

| ケース                                  | 変更前        | 変更後                    |
| --------------------------------------- | ------------- | ------------------------- |
| PWA ウィンドウでタブ情報なし            | `return null` | `return APP_NAME_UNKNOWN` |
| PWA ウィンドウでタブの URL なし         | `return null` | `return APP_NAME_UNKNOWN` |
| PWA で `extractDomain()` が null を返す | `return null` | `return APP_NAME_UNKNOWN` |
| 未知のウィンドウタイプ                  | `return null` | `return APP_NAME_UNKNOWN` |

**`null` を返す唯一のケース:** 引数 `win` 自体が `null` の場合のみ。これはウィンドウが存在しない（閉じられた等の）ケースであり、計測対象外とするのが正しい。

**UI 表示方針（S02 以降）:**

- モバイルアプリでは `appName === "unknown"` のエントリを「その他」としてグルーピング表示
- 1日の利用時間の内訳として、特定できたアプリと合わせて表示することで、デバイスの総利用時間を正確に把握できる

### 問題 2: **選択肢 F** — etag（djb2 ハッシュ）による差分検出

`computeDailyUsageEtag()` 関数で送信対象データのハッシュを計算し、前回送信時の etag と比較する。

**ハッシュ計算のアルゴリズム:**

```javascript
// 1. 送信対象データの日付・アプリ名をソートして連結文字列を生成
// 例: "2026-03-01:chrome:1200:2026-03-01T10:30:00Z|2026-03-01:youtube.com:600:..."
const parts = [];
for (const date of Object.keys(dailyUsage).sort()) {
  const apps = dailyUsage[date];
  for (const appName of Object.keys(apps).sort()) {
    parts.push(
      `${date}:${appName}:${apps[appName].totalSeconds}:${apps[appName].lastUpdated}`,
    );
  }
}
const str = parts.join("|");

// 2. djb2 ハッシュを計算（軽量・高速）
let hash = 5381;
for (let i = 0; i < str.length; i++) {
  hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
}
return hash.toString(16);
```

**`flushUsageData()` のフロー:**

```
flushUsageData()
  │
  ├─ 送信対象データを抽出（当日分 + 未送信の過去日付）
  │
  ├─ 送信対象データの etag を計算
  │
  ├─ chrome.storage.local から前回の etag (lastSentEtag) を読み込み
  │
  ├─ etag が一致 → 送信スキップ（return）
  │
  ├─ etag が不一致 → API 送信を実行
  │
  └─ 送信成功後 → 新しい etag を chrome.storage.local に保存
```

**djb2 を選択した理由:**

- 暗号学的なハッシュ（SHA-256 等）は不要。衝突攻撃への耐性は求めておらず、「前回と同じデータか否か」の判定のみ
- djb2 は数行で実装でき、外部ライブラリ不要。Service Worker のバンドルサイズに影響しない
- 計算コストは O(n) で、日付×アプリ数の規模（数十エントリ程度）では無視できる

**ストレージ:**

| キー           | 値                | 用途                  |
| -------------- | ----------------- | --------------------- |
| `lastSentEtag` | `string` (16進数) | 前回送信成功時の etag |

---

## 根拠 (Rationale)

1. **appName null の収集**: 利用時間監視の本来目的は「デバイスの使用時間を正確に把握し、保護者に提供する」こと。アプリを特定できなくても使用時間自体は有効なデータであり、破棄は目的に反する

2. **`"unknown"` の定数化**: `APP_NAME_UNKNOWN` として `constants.js` で一元管理。将来的にモバイルアプリ UI でのフィルタリング・グルーピングにも文字列の一貫性が担保される

3. **`determineAppName()` での変換**: API レイヤーではなくドメインロジック層で `"unknown"` を生成することで、`dailyUsage` バッファ内のデータと送信データの一貫性を維持。`null` が JSON で `"null"` に変換される事故を防止

4. **etag 方式**: オーナーの提案（lastUpdated のハッシュ比較）を拡張し、`totalSeconds` も含めた完全なスナップショットハッシュとした。これにより、同一 `lastUpdated` でも `totalSeconds` が変化した場合（理論上は起こりにくいが）も検出できる

5. **コスト削減効果**: Chromebook でブラウザが非アクティブな時間帯（授業中等）は、60秒ごとのアラームが発火しても API 送信はスキップされる。Firebase Functions の課金対象リクエストを大幅に削減

---

## 影響範囲 (Consequences)

### Extension 側の変更

| ファイル            | 変更内容                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `constants.js`      | `APP_NAME_UNKNOWN = "unknown"` と `STORAGE_KEY_LAST_SENT_ETAG = "lastSentEtag"` を追加                       |
| `tracking.js`       | `determineAppName()` のフォールバックを `APP_NAME_UNKNOWN` に統一。`computeDailyUsageEtag()` 関数を追加      |
| `service-worker.js` | `flushUsageData()` に etag 比較ロジックを追加                                                                |
| `tracking.test.js`  | `determineAppName()` のテスト期待値を `null` → `"unknown"` に修正。`computeDailyUsageEtag()` のテスト4件追加 |

### Functions 側の変更

- **変更なし**: `"unknown"` は既存の Zod スキーマ（`appName: z.string().min(1)`）に適合する有効な文字列値であり、サーバー側の変更は不要

### 今後の対応（S02 以降）

- モバイルアプリ UI: `appName === "unknown"` を「その他」として集計・表示するロジックの実装
