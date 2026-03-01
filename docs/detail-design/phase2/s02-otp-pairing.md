# S02: OTP ペアリングフロー 詳細設計書

> **フェーズ**: Phase 2  
> **スプリント**: S02  
> **作成日**: 2026-03-01  
> **ステータス**: Active  
> **前提**: [S01: コアトラッキングパイプライン](../../detail-design/phase1/s01-core-tracking-pipeline.md)

---

## 1. 概要

本スプリントでは、Chrome Extension と保護者アカウントを OTP (ワンタイムパスコード) で紐付けるペアリングフローを実装する。ペアリング完了後、Extension から送信される利用ログは正しい保護者 UID に紐付けられ、モバイルアプリ（S03）からの閲覧に備える。

### 1.1 スコープ

**含む:**

- Firebase Functions: `generateOtp` — OTP 生成（Firebase Auth 認証付き）
- Firebase Functions: `registerDevice` — デバイス登録（OTP 検証）
- Firebase Functions: `usageLogs` 改修 — deviceId 検証（登録済みデバイスのみ受付）
- Firestore: `users` コレクション（保護者情報）
- Firestore: `oneTimeCodes` コレクション（OTP 管理）
- Firestore: `devices` コレクション（deviceId → parentId 逆引き用、非正規化）
- Extension Options ページ: OTP 入力 + デバイス名入力 + 登録機能
- Extension Popup: ペアリング状態表示
- バリデーションスキーマ（Zod）追加
- ユニットテスト

**含まない（後続スプリント）:**

- モバイルアプリ (S03)
- dailyLogs 日次バッチ集計 (S03 以降)
- appRegistry 初期データ投入 (S03)
- Firestore セキュリティルール (S04)

### 1.2 受け入れ基準

1. `generateOtp` に Firebase Auth トークン付きリクエストを送ると、6桁 OTP が返る
2. OTP の有効期限は 5 分間。期限切れ・使用済み OTP はエラーを返す
3. Extension Options ページで OTP + デバイス名を入力し、`registerDevice` を呼ぶとペアリングが完了する
4. ペアリング完了後、Extension Popup にペアリング済みステータスが表示される
5. ペアリング済みデバイスからの `usageLogs` リクエストは、正しい `parentId` で Firestore に保存される
6. 未登録デバイスからの `usageLogs` リクエストは 401 で拒否される
7. `users` コレクションに保護者情報とデバイス一覧が保存される
8. `devices` コレクションに deviceId → parentId のマッピングが保存される

---

## 2. Firestore データモデル追加

### 2.1 `users` コレクション（新規）

| フィールド                | 型                  | 説明                              |
| ------------------------- | ------------------- | --------------------------------- |
| (ドキュメントID)          | —                   | Firebase Auth UID                 |
| `email`                   | `string`            | メールアドレス                    |
| `displayName`             | `string`            | 表示名                            |
| `childDevices`            | `array<DeviceInfo>` | 登録デバイスリスト                |
| `inactivityThresholdDays` | `number`            | 無操作検知閾値（デフォルト: 6日） |
| `createdAt`               | `Timestamp`         | 作成日時                          |

> **Note**: ドキュメントID が Firebase Auth UID そのものであるため、`parentUid` フィールドは冗長であり設けない。

```typescript
interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  registeredAt: string; // ISO8601
}
```

### 2.2 `oneTimeCodes` コレクション（新規）

| フィールド       | 型          | 説明                                                   |
| ---------------- | ----------- | ------------------------------------------------------ |
| (ドキュメントID) | —           | OTP コード文字列（6桁数字）                            |
| `parentId`       | `string`    | 発行した保護者の UID                                   |
| `expiresAt`      | `Timestamp` | 有効期限（発行 + 5分）                                 |
| `used`           | `boolean`   | 使用済みフラグ                                         |
| `expireAt`       | `Timestamp` | ドキュメント TTL（発行 + 1日）。日次クリーンアップ対象 |

> **TTL ポリシー**: OTP の有効期限は 5 分だが、ドキュメント自体は 1 日間保持する。`cleanupExpiredOtps` Scheduled Function が毎日 03:00 UTC に `expireAt` を過ぎたドキュメントを物理削除する。Firestore のネイティブ TTL 機能が有効な場合はそちらでも自動削除される。

### 2.3 `devices` コレクション（新規 — 非正規化テーブル）

deviceId から parentId への O(1) 逆引きのために、`users.childDevices` とは別に非正規化テーブルを設ける。

| フィールド       | 型                | 説明                                                      |
| ---------------- | ----------------- | --------------------------------------------------------- |
| (ドキュメントID) | —                 | deviceId (UUID)                                           |
| `parentId`       | `string`          | 保護者の UID                                              |
| `deviceName`     | `string`          | デバイス名                                                |
| `registeredAt`   | `string`          | 登録日時 (ISO8601)                                        |
| `lastSeenAt`     | `Timestamp`       | 最終データ受信日時（無操作検知用）                        |
| `syncAvailable`  | `boolean \| null` | chrome.storage.sync の利用可否。登録時に Extension が判定 |

> **設計根拠**: `users.childDevices` は配列フィールドであり、Firestore の `array-contains` は完全一致が必要なため、deviceId 単体での逆引きクエリには適さない。`devices` コレクションを用いることで `usageLogs` 受信時の parentId 取得を O(1) で実現する。
>
> **lastSeenAt**: `usageLogs` 受信時に更新される。Scheduled Function （後続スプリント）で `inactivityThresholdDays` と比較し、閾値超過時に保護者へ通知する。
>
> **syncAvailable**: `false` の場合、保護者アプリに「キャッシュ削除で監視解除の可能性がある」アラートを表示（アプリ側は後続スプリント）。

---

## 3. OTP ペアリング データフローダイアグラム

```
┌─────────────────┐                ┌─────────────────────┐                ┌──────────────────┐
│  モバイルアプリ   │                │  Firebase Functions │                │  Firestore       │
│  (保護者)        │                │                     │                │                  │
└───────┬─────────┘                └──────────┬──────────┘                └────────┬─────────┘
        │                                     │                                   │
  ① POST /generateOtp                        │                                   │
  Authorization: Bearer <JWT>                 │                                   │
        │────────────────────────────────────▶│                                   │
        │                                     │  verifyIdToken(JWT)               │
        │                                     │  → uid 取得                       │
        │                                     │                                   │
        │                                     │  users/{uid} 存在チェック          │
        │                                     │───────────────────────────────────▶│
        │                                     │  　（なければ作成）                │
        │                                     │                                   │
        │                                     │  ② OTP 生成 (6桁)                │
        │                                     │  oneTimeCodes/{otp} 保存          │
        │                                     │  {parentId: uid, expiresAt, ...}  │
        │                                     │───────────────────────────────────▶│
        │                                     │                                   │
        │◀────────────────────────────────────│                                   │
        │  { otp: "123456", expiresIn: 300 }  │                                   │
        │                                     │                                   │
  ③ 保護者が OTP を子供に伝達（口頭等）       │                                   │
        │                                     │                                   │
┌───────┴─────────┐                           │                                   │
│  Chrome Extension│                           │                                   │
│  (子供デバイス)  │                           │                                   │
└───────┬─────────┘                           │                                   │
        │                                     │                                   │
  ④ POST /registerDevice                     │                                   │
  {otp, deviceId, deviceName}                 │                                   │
        │────────────────────────────────────▶│                                   │
        │                                     │  oneTimeCodes/{otp} 取得・検証     │
        │                                     │───────────────────────────────────▶│
        │                                     │  → parentId 取得                  │
        │                                     │                                   │
        │                                     │  ⑤ トランザクション:              │
        │                                     │  - OTP を used: true               │
        │                                     │  - devices/{deviceId} 作成        │
        │                                     │    {parentId, deviceName, ...}     │
        │                                     │  - users/{parentId}.childDevices   │
        │                                     │    に arrayUnion                   │
        │                                     │───────────────────────────────────▶│
        │                                     │                                   │
        │◀────────────────────────────────────│                                   │
        │  { status: "paired" }                │                                   │
        │                                     │                                   │
  ⑥ pairingStatus を                         │                                   │
     chrome.storage.local に保存              │                                   │
        │                                     │                                   │
  ⑦ 以後の usageLogs 送信                    │                                   │
  POST /usageLogs {deviceId, ...}             │                                   │
        │────────────────────────────────────▶│                                   │
        │                                     │  devices/{deviceId} 取得          │
        │                                     │───────────────────────────────────▶│
        │                                     │  → parentId で upsert             │
        │                                     │───────────────────────────────────▶│
        │◀────────────────────────────────────│                                   │
        │  { status: "ok" }                    │                                   │
```

> レビュー指摘のデータフロー理解は正確です。上記の ①〜⑤ が指摘の 1〜6 に対応します。

## 4. API 設計

### 4.1 POST `generateOtp`

**認証**: Firebase Auth ID Token (Bearer)

**処理フロー:**

```
1. Authorization ヘッダーから ID Token を抽出
2. firebase-admin auth.verifyIdToken() で検証
3. users/{uid} ドキュメントが存在しなければ作成
4. 6桁 OTP を cryptographically secure に生成
5. oneTimeCodes/{otp} に保存 (parentId, expiresAt, used: false)
6. OTP + expiresIn を返却
```

**Request:**

```
POST /generateOtp
Authorization: Bearer <Firebase ID Token>
```

**Response (200):**

```json
{
  "otp": "123456",
  "expiresIn": 300
}
```

**Response (401):**

```json
{ "error": "unauthorized" }
```

### 4.2 POST `registerDevice`

**認証**: なし（OTP による検証）

**処理フロー:**

```
1. リクエストボディをバリデーション
2. oneTimeCodes/{otp} を取得
3. OTP が存在しない → 400 invalid_otp
4. OTP が使用済み → 400 otp_already_used
5. OTP が期限切れ → 400 otp_expired
6. OTP を used: true にマーク
7. devices/{deviceId} を作成 (parentId, deviceName, registeredAt, lastSeenAt, syncAvailable)
8. users/{parentId}.childDevices に追加 (arrayUnion)
9. レスポンス返却
```

**Request:**

```json
{
  "otp": "123456",
  "deviceId": "uuid-string",
  "deviceName": "Chromebook (子供)",
  "syncAvailable": true
}
```

**Response (200):**

```json
{ "status": "paired" }
```

**Response (400):**

```json
{ "error": "invalid_otp" | "otp_already_used" | "otp_expired" | "validation_error" }
```

### 4.3 `usageLogs` 改修

S01 では全リクエストを `parentId: "unlinked"` で受け付けていたが、S02 からは deviceId の登録検証を行う。

**変更点:**

```
1. リクエストから deviceId を取得
2. devices/{deviceId} を Firestore から取得
3. 存在しない → 401 unknown_device
4. 存在する → parentId = devices/{deviceId}.parentId
5. devices/{deviceId}.lastSeenAt を現在時刻に更新
6. usageLogs ドキュメントに正しい parentId で upsert
```

---

## 5. Extension 変更

### 5.1 Options ページ拡張

既存の API エンドポイント設定に加え、OTP ペアリングセクションを追加する。

**追加 UI:**

- デバイス名入力フィールド
- OTP 入力フィールド（6桁数字）
- 「登録」ボタン
- ペアリング状態表示

**登録フロー:**

```
1. ユーザーが OTP とデバイス名を入力
2. chrome.storage.local から deviceId と apiEndpoint を取得
3. apiEndpoint から registerDevice の URL を導出
4. POST registerDevice { otp, deviceId, deviceName }
5. 成功 → pairingStatus を chrome.storage.local に保存
6. 成功 → sentDates と lastSentEtag をクリア（バッファを再送可能にする）
7. UI にペアリング成功を表示
```

### 5.2 Popup 拡張

ペアリング状態をステータス行として追加する。

- ペアリング済み: デバイス名とパートナーIDを表示
- 未ペアリング: 「未登録」を表示

### 5.3 API URL 導出

既存の `apiEndpoint`（usageLogs の完全 URL）から、他の Function 名の URL を導出する。

```javascript
// https://region-project.cloudfunctions.net/usageLogs
// → https://region-project.cloudfunctions.net/registerDevice
//
// http://localhost:5001/project/region/usageLogs
// → http://localhost:5001/project/region/registerDevice
function deriveEndpointUrl(baseEndpoint, functionName) {
  const url = new URL(baseEndpoint);
  const parts = url.pathname.split("/");
  parts[parts.length - 1] = functionName;
  url.pathname = parts.join("/");
  return url.toString();
}
```

### 5.4 chrome.storage.local 追加キー

| キー            | 値の型                                           | 説明           |
| --------------- | ------------------------------------------------ | -------------- |
| `pairingStatus` | `{deviceName: string, pairedAt: string} \| null` | ペアリング状態 |

### 5.5 chrome.storage.sync バックアップ（deviceId 復旧用）

`chrome.storage.local` がクリアされた場合に備え、ペアリング成功時に `chrome.storage.sync` へバックアップを保存する（ADR-003 選択肢 B）。

**sync ストレージ構造:**

| キー            | 値の型                             | 説明                                                     |
| --------------- | ---------------------------------- | -------------------------------------------------------- |
| `deviceBackups` | `Record<fingerprint, BackupEntry>` | デバイスフィンガープリントをキーとしたバックアップマップ |

```typescript
interface BackupEntry {
  deviceId: string; // デバイス UUID
  pairingStatus: {
    // ペアリング状態
    deviceName: string;
    pairedAt: string; // ISO8601
  };
  apiEndpoint: string; // API エンドポイント URL
  backedUpAt: string; // ISO8601
}
```

**デバイスフィンガープリント:**

`chrome.storage.sync` はアカウント単位の同期ストレージであるため、同一アカウントで複数デバイスを使用するケースに対応する必要がある。`navigator.userAgent` + `navigator.platform` + `navigator.hardwareConcurrency` + `navigator.language` を結合したハッシュ値をキーとして使用する。

**復元フロー:**

```
1. Service Worker 起動時、chrome.storage.local に deviceId がない場合
2. chrome.storage.sync の deviceBackups を取得
3. 現在のデバイスフィンガープリントを計算
4. フィンガープリントが一致するバックアップがあれば復元
5. deviceId + pairingStatus + apiEndpoint を chrome.storage.local に書き戻す
6. 一致するバックアップがなければ新規 deviceId を生成（再ペアリングが必要）
```

**syncAvailable フラグ:**

ペアリング時に `chrome.storage.sync` への書き込みを試行し、成功すれば `syncAvailable = true`、失敗すれば `false` として `devices` コレクションに記録する。`syncAvailable = false` の場合、保護者アプリにアラートを表示する（アプリ側は後続スプリント）。

### 5.6 利用ログ送信の変更

`flushUsageData()` は、ペアリング済みの場合のみ API 送信を行う。未ペアリング時はローカルバッファへの蓄積のみ行い、ペアリング完了後にバッファ内の全データを送信する。

### 5.7 未ペアリング時のバッファ TTL

未ペアリング時は API 送信を行わないため、バッファが際限なく蓄積する問題がある。これを防ぐため、バッファ保持日数をペアリング状態に応じて使い分ける:

| 状態           | バッファ保持日数   | 定数                             |
| -------------- | ------------------ | -------------------------------- |
| ペアリング済み | 4日間（当日含む）  | `BUFFER_RETENTION_DAYS`          |
| 未ペアリング   | 14日間（当日含む） | `UNLINKED_BUFFER_RETENTION_DAYS` |

未ペアリング時は 14 日分のデータをローカルに保持する。14 日を超過した古いデータはガベージコレクションで自動削除される。

---

## 6. テスト戦略

### 6.1 ユニットテスト

| 対象                         | テスト内容                                 | フレームワーク |
| ---------------------------- | ------------------------------------------ | -------------- |
| `registerDeviceSchema` (Zod) | OTP・deviceId・deviceName のバリデーション | Vitest         |
| `deriveEndpointUrl()`        | production/emulator 両 URL パターンの導出  | Vitest         |

### 6.2 手動テスト

| #   | シナリオ                                                   | 期待結果                                 |
| --- | ---------------------------------------------------------- | ---------------------------------------- |
| 1   | `generateOtp` を Firebase Auth トークン付きで呼び出す      | 6桁 OTP が返る                           |
| 2   | OTP + deviceId + deviceName で `registerDevice` を呼び出す | `{ "status": "paired" }` が返る          |
| 3   | 使用済み OTP で再登録を試みる                              | 400 `otp_already_used`                   |
| 4   | 期限切れ OTP で登録を試みる                                | 400 `otp_expired`                        |
| 5   | Extension Options で OTP を入力して登録                    | ペアリング成功、Popup にステータス表示   |
| 6   | ペアリング後に Chrome を使用                               | usageLogs に正しい parentId で保存される |
| 7   | 未登録 deviceId で usageLogs を送信                        | 401 `unknown_device`                     |

---

## 7. 成果物一覧

```
functions/src/
├── index.ts              # generateOtp, registerDevice, cleanupExpiredOtps をエクスポート
├── usageLogs.ts          # deviceId 検証ロジック追加 + lastSeenAt 更新
├── pairing.ts            # NEW: generateOtp + registerDevice (lastSeenAt, syncAvailable 対応)
├── cleanupOtps.ts        # NEW: 期限切れ OTP 日次クリーンアップ
└── lib/
    ├── constants.ts      # 新コレクション名・OTP 定数・DEFAULT_INACTIVITY_THRESHOLD_DAYS 追加
    ├── validation.ts     # ペアリング用スキーマ追加 (syncAvailable オプショナル)
    └── validation.test.ts # ペアリング用テスト追加

extension/
├── utils/
│   ├── constants.js      # STORAGE_KEY_PAIRING_STATUS, SYNC_KEY_DEVICE_BACKUPS 等追加
│   ├── storage.js        # getSyncStorage, setSyncStorage, isSyncStorageAvailable, computeDeviceFingerprint 追加
│   ├── api.js            # registerDevice() に syncAvailable パラメータ追加, deriveEndpointUrl()
│   └── api.test.js       # NEW: deriveEndpointUrl テスト
├── options/
│   ├── options.html      # OTP 入力セクション追加
│   └── options.js        # OTP 登録ロジック + sync バックアップ + syncAvailable 検知
├── background/
│   └── service-worker.js # sync リストア・ペアリング状態判定・未ペアリング時バッファ TTL
└── popup/
    ├── popup.html        # ペアリング状態行追加
    └── popup.js          # ペアリング状態表示追加

docs/
├── detail-design/phase2/
│   └── s02-otp-pairing.md       # 本ドキュメント
├── mermaid/
│   └── s02-otp-pairing-data-flow.md  # Mermaid データフローダイアグラム
└── adr/
    └── ADR-003-device-id-loss-recovery.md  # deviceId 消失時の復旧方針 (Accepted)
```
