# 基本設計書: Web利用時間トラッカー (Basic Design Document)

> 本ドキュメントは `docs/functional-requirements.md` の要求仕様に基づく基本設計である。

---

## 0. 本システムの目的

Google ファミリーリンクは、子供の Android アプリの利用時間を集計できるが、Chrome OS のシステムアプリとして組み込まれている **Chrome ブラウザ** および **PWA（YouTube, Duolingo 等）** の利用時間は集計対象外である。

本システムは、Chrome ブラウザに拡張機能をインストールし、利用中にビーコン（利用ログ）を Firebase に送信することで、ファミリーリンクでは取得できない利用時間を補完的に集計する。

**監視対象:**
- Chrome ブラウザ全体の利用時間（個別タブの切り替えは追跡しない）
- PWA として動作するアプリ（YouTube, Duolingo 等）の利用時間（ドメインでアプリを識別）

**監視対象外:**
- Chrome OS 上の Android アプリ（ファミリーリンクで集計可能。Chrome 拡張機能のスコープ外）

---

## 1. システムアーキテクチャ

### 1.1 全体構成図

```
┌─────────────────────┐       HTTPS POST        ┌─────────────────────┐
│  Chrome Extension   │ ───────────────────────▶ │  Firebase Functions │
│  (Service Worker)   │   usageLogs              │                     │
│                     │                          │  - deviceId検証     │
│  - PWA/Browser検知  │   registerDevice         │  - parentId逆引き   │
│  - 利用時間計測     │ ───────────────────────▶ │  - Firestoreへ保存  │
│  - バッチ送信       │                          │                     │
└─────────────────────┘                          │  [Scheduled]        │
                                                 │  - dailyLogs集計    │
                                                 └────────┬────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────────┐
                                                 │  Firebase Firestore │
                                                 │                     │
                                                 │  - users            │
                                                 │  - usageLogs (30日) │
                                                 │  - dailyLogs (6ヶ月)│
                                                 │  - appRegistry      │
                                                 │  - oneTimeCodes     │
                                                 └────────┬────────────┘
                                                          │
                                                          │ onSnapshot
                                                          ▼
                                                 ┌─────────────────────┐
                                                 │  React Native App   │
                                                 │  (Expo)             │
                                                 │                     │
                                                 │  - リアルタイム表示   │
                                                 │  - デバイス管理      │
                                                 │  - OTP発行          │
                                                 └─────────────────────┘
```

### 1.2 通信フロー

| # | フロー | プロトコル | 説明 |
|---|--------|-----------|------|
| 1 | Extension → Functions | HTTPS POST | 利用ログ送信（60秒バッチ + 割り込み） |
| 2 | Extension → Functions | HTTPS POST | ペアリング登録（OTP + deviceId） |
| 3 | Mobile → Functions | HTTPS POST | OTP発行リクエスト |
| 4 | Mobile → Firestore | WebSocket | `onSnapshot` リアルタイムリスナー |
| 5 | Functions → Firestore | gRPC | ドキュメント読み書き |
| 6 | Functions (Scheduled) | — | dailyLogs 日次バッチ集計 |

---

## 2. コンポーネント設計

### 2.1 Chrome Extension

Manifest V3 の Service Worker ベースで実装する。

#### ディレクトリ構成

```
extension/
├── manifest.json
├── background/
│   └── service-worker.js      # メインの Service Worker
├── popup/
│   ├── popup.html
│   └── popup.js               # ステータス表示のみ（操作UI無し）
├── options/
│   ├── options.html
│   └── options.js             # OTP入力・設定（保護者向け）
└── utils/
    ├── constants.js            # 定数定義
    ├── storage.js              # chrome.storage ラッパー
    └── api.js                  # API通信ユーティリティ
```

> **重要**: Popup UI には監視の開始/停止ボタンを設けない。拡張機能がインストールされている限り常時監視を行い、子供が任意に監視を無効化できない設計とする。

#### トラッキング方針

Chromebook 上では以下の2種類の Chrome 利用形態がある:

| 形態 | 説明 | appName の決定方法 |
|------|------|------------------|
| **PWA** | YouTube, Duolingo 等。独立したウィンドウで動作するが実態は Chrome | ウィンドウの URL ドメイン = アプリ名 (例: `youtube.com`) |
| **Chrome ブラウザ** | 通常のブラウザウィンドウ。複数タブを持つ | `chrome` 固定（個別タブは追跡しない） |

Chrome 拡張機能は PWA ウィンドウ内でも動作するため、`chrome.windows` API でウィンドウの種類（`normal` / `app` / `popup`）を判別し、PWA かブラウザかを検知する。

#### Service Worker の主要処理

```
                    ┌──────────────┐
                    │  初期化       │
                    │  - deviceId   │
                    │    生成/取得  │
                    └──────┬───────┘
                           ▼
              ┌────────────────────────┐
              │  イベントリスナー登録    │
              │  - windows.onFocused   │
              └────────┬───────────────┘
                       ▼
              ┌─────────────────────────┐
              │  ウィンドウフォーカス検知  │◀─────────────┐
              └────────┬────────────────┘              │
                       ▼                               │
              ┌─────────────────────────┐              │
              │  ウィンドウ種別を判定     │              │
              │  - type=="app"           │              │
              │    → PWA (ドメイン取得)  │              │
              │  - type=="normal"        │              │
              │    → Chrome ブラウザ     │              │
              │  - WINDOW_ID_NONE       │              │
              │    → フォーカス喪失      │              │
              └────┬────────────────────┘              │
                   ▼                                   │
          ┌──────────────────┐                         │
          │  前回計測を停止    │                         │
          │  → バッファに蓄積 │                         │
          └──────┬───────────┘                         │
                 ▼                                     │
          ┌──────────────────┐                         │
          │  新規計測を開始    │                         │
          │  (appName を記録) │                         │
          └──────┬───────────┘                         │
                 ▼                                     │
      ┌──────────────────────────┐                     │
      │  送信判定                 │                     │
      │  - 60秒経過? → バッチ送信 │                     │
      │  - フォーカス喪失?        │                     │
      │    → 割り込み送信         │                     │
      └──────────┬───────────────┘                     │
                 ▼                                     │
          ┌──────────────┐                             │
          │  API送信      │─────────────────────────────┘
          │  POST /api/   │
          │  usage-logs   │
          └──────────────┘
```

#### appName 決定ロジック

```
window.type == "app" または "popup"
  → アクティブタブの URL からドメインを抽出 → appName = ドメイン名
     (例: "youtube.com", "www.duolingo.com")

window.type == "normal"
  → appName = "chrome" (ブラウザ全体として集計)

window.id == chrome.windows.WINDOW_ID_NONE
  → Chrome が非アクティブ。計測停止
```

#### アプリ表示名マッピング (`appRegistry`)

Extension が記録する `appName`（ドメイン名）を、モバイルアプリ上での表示名・アイコンにマッピングするためのテーブルを Firestore に保持する。

**Firestore コレクション: `appRegistry`**

| フィールド | 型 | 説明 |
|-----------|------|------|
| (ドキュメントID) | — | ドメイン名 (例: `youtube.com`) |
| `domain` | `string` | ドメイン名（ドキュメントIDと同値。クエリ用） |
| `displayName` | `string` | アプリ表示名 (例: `"YouTube"`) |
| `iconUrl` | `string` | アプリアイコンの URL |
| `category` | `string` | カテゴリ (例: `"video"`, `"education"`, `"browser"`) |

**初期データ例:**

| domain | displayName | category |
|--------|------------|----------|
| `youtube.com` | YouTube | video |
| `www.duolingo.com` | Duolingo | education |
| `chrome` | Chrome ブラウザ | browser |

**運用方針:**
- 未登録ドメインの場合、モバイルアプリではドメイン名をそのまま表示し、`favicon` (`https://{domain}/favicon.ico`) をアイコンとして使用する
- 保護者がモバイルアプリから表示名・アイコンを編集できる機能は Phase 2 以降で検討
- `appRegistry` コレクションは全ユーザー共通（グローバル）。初期データは手動登録。将来的に管理画面を検討

#### 主要定数

| 定数名 | 値 | 説明 |
|--------|-----|------|
| `SEND_INTERVAL_MS` | `60000` | バッチ送信間隔（60秒） |
| `STORAGE_KEY_DEVICE_ID` | `"deviceId"` | deviceId の storage キー |
| `STORAGE_KEY_API_ENDPOINT` | `"apiEndpoint"` | API URL の storage キー |
| `APP_NAME_CHROME_BROWSER` | `"chrome"` | Chrome ブラウザ全体の appName |

#### deviceId 管理

- 初回起動時に `crypto.randomUUID()` で UUID v4 を生成
- `chrome.storage.local` に永続保存
- 以後は保存済み ID を使用（再生成しない）

### 2.2 Backend API

#### API 配置方針: Cloud Run vs Firebase Functions

拡張機能から60秒ごとに送信されるビーコン API は、呼び出し頻度が高くリクエスト単位で完結する軽量処理であるため、**Cloud Run（常時起動型）** と **Firebase Functions（イベント駆動型）** のどちらが適切かを検討する。

| 観点 | Cloud Run (Next.js) | Firebase Functions (2nd gen) |
|------|--------------------|--------------------------|
| **課金モデル** | vCPU・メモリ × 稼働時間。最小インスタンス1台で常時課金 | 呼び出し回数 + CPU時間。アイドル時は課金なし |
| **コールドスタート** | 最小インスタンス=1 なら無し（常時課金） | 数百ms〜数秒（ただし min_instances=1 設定可） |
| **60秒間隔ビーコンの場合** | 監視中はほぼ常時起動 → 24時間課金 | リクエスト時のみ課金。1デバイス=1440回/日 |
| **月額目安 (1デバイス)** | ~$5〜10 (最小構成) | 無料枠内 (200万回/月) or ~$0.40 |
| **適したワークロード** | 常時接続・SSR・複雑なルーティング | 短時間で完結するAPI・イベントトリガー |

**結論**: 拡張機能からの通信（`usage-logs`, `pairing/register`）は **Firebase Functions** に配置する。保護者向け API（`pairing/generate-otp` 等、Firebase Auth 連携が必要なもの）も Firebase Functions に統一する。Cloud Run は将来的な管理画面・ダッシュボード等が必要になった場合に検討する。

#### ディレクトリ構成

```
functions/
├── src/
│   ├── index.ts                   # Cloud Functions エントリポイント
│   ├── usageLogs.ts               # POST: 利用ログ受信
│   ├── pairing.ts                 # POST: OTP発行・デバイス登録
│   ├── dailyLogsBatch.ts          # Scheduled: dailyLogs 日次集計
│   └── lib/
│       ├── firestore.ts           # Firestore クライアント初期化
│       ├── validation.ts          # リクエストバリデーション
│       └── constants.ts           # サーバー側定数
├── package.json
└── tsconfig.json
```

#### API エンドポイント一覧

| メソッド | 関数名 | 認証 | 説明 |
|---------|--------|------|------|
| POST | `usageLogs` | deviceId検証 | 利用ログ受信・Firestore保存 |
| POST | `generateOtp` | Firebase Auth | OTP生成（保護者用） |
| POST | `registerDevice` | なし (OTP検証) | デバイス登録 |
| Scheduled | `aggregateDailyLogs` | — | dailyLogs 日次バッチ集計 |

#### API 詳細

**POST `/api/usage-logs`**

```typescript
// Request Body
interface UsageLogRequest {
  deviceId: string;       // UUID
  appName: string;        // PWA: ドメイン名 / ブラウザ: "chrome"
  durationSeconds: number; // 滞在秒数
  timestamp: string;      // ISO8601
}

// Response: 200 OK
{ "status": "ok" }

// Response: 401 Unauthorized (deviceId 未登録)
{ "error": "unknown_device" }
```

**POST `/api/pairing/generate-otp`**

```typescript
// Headers: Authorization: Bearer <Firebase ID Token>

// Response: 200 OK
{
  "otp": "123456",        // 6桁数字
  "expiresIn": 300        // 有効期限（秒）
}
```

**POST `/api/pairing/register`**

```typescript
// Request Body
{
  "otp": "123456",
  "deviceId": "uuid-string",
  "deviceName": "Chromebook (子供)"  // 任意のデバイス名
}

// Response: 200 OK
{ "status": "paired" }

// Response: 400 Bad Request
{ "error": "invalid_otp" }
```

### 2.3 モバイルアプリ (React Native / Expo)

Expo Router でナビゲーションを管理し、Firebase Auth (Google SSO) で認証する。

#### ディレクトリ構成

```
mobile/
├── app/
│   ├── _layout.tsx                # Root Layout (認証ガード)
│   ├── (auth)/
│   │   └── login.tsx              # ログイン画面
│   └── (tabs)/
│       ├── _layout.tsx            # タブナビゲーション
│       ├── index.tsx              # ホーム (今日のサマリー)
│       ├── devices.tsx            # デバイス一覧・追加
│       └── settings.tsx           # 設定
├── components/
│   ├── UsageSummary.tsx           # 利用時間サマリーカード
│   ├── UsageChart.tsx             # 利用時間グラフ
│   ├── DeviceCard.tsx             # デバイスカード
│   └── OtpDisplay.tsx            # OTP表示コンポーネント
├── hooks/
│   ├── useAuth.ts                 # Firebase Auth フック
│   ├── useUsageLogs.ts            # usageLogs リスナー
│   └── useDevices.ts              # デバイス一覧フック
├── lib/
│   ├── firebase.ts                # Firebase 初期化
│   └── constants.ts               # 定数
└── package.json
```

#### 画面一覧

| 画面 | パス | 説明 |
|------|------|------|
| ログイン | `/(auth)/login` | Google SSO ログイン |
| ホーム | `/(tabs)/` | 今日の利用時間サマリー・アプリ別内訳 |
| デバイス管理 | `/(tabs)/devices` | 登録デバイス一覧・OTP発行 |
| 設定 | `/(tabs)/settings` | アカウント情報・ログアウト |

---

## 3. データモデル設計

### 3.1 Firestore コレクション詳細

#### `users` コレクション

| フィールド | 型 | 説明 |
|-----------|------|------|
| (ドキュメントID) | — | Firebase Auth の UID (`parentUid`) |
| `parentUid` | `string` | 保護者の Firebase Auth UID（ドキュメントIDと同値。クエリ用） |
| `email` | `string` | 保護者のメールアドレス |
| `displayName` | `string` | 表示名 |
| `childDevices` | `array<DeviceInfo>` | 登録デバイスリスト |
| `createdAt` | `Timestamp` | 作成日時 |

```typescript
interface DeviceInfo {
  deviceId: string;     // UUID
  deviceName: string;   // ユーザーが設定したデバイス名
  registeredAt: string; // ISO8601 登録日時
}
```

#### `usageLogs` コレクション

| フィールド | 型 | 説明 |
|-----------|------|------|
| (ドキュメントID) | — | 自動生成 |
| `parentId` | `string` | 保護者の UID |
| `deviceId` | `string` | デバイス UUID |
| `appName` | `string` | アプリ識別名（PWA: ドメイン名、ブラウザ: `"chrome"`） |
| `durationSeconds` | `number` | 滞在秒数 |
| `timestamp` | `Timestamp` | 利用開始日時 |
| `expireAt` | `Timestamp` | TTL 自動削除用 (timestamp + 30日) |

**TTL**: 30日。分単位の詳細ログとして利用。

**インデックス:**
- `parentId` + `timestamp` DESC — 保護者ごとの時系列クエリ
- `parentId` + `deviceId` + `timestamp` DESC — デバイス別フィルタ

#### `dailyLogs` コレクション

`usageLogs` を日単位・アプリ単位に集計したサマリーコレクション。

| フィールド | 型 | 説明 |
|-----------|------|------|
| (ドキュメントID) | — | `{deviceId}_{appName}_{YYYY-MM-DD}` |
| `parentId` | `string` | 保護者の UID |
| `deviceId` | `string` | デバイス UUID |
| `appName` | `string` | アプリ識別名 |
| `date` | `string` | 日付 (`YYYY-MM-DD`) |
| `totalMinutes` | `number` | その日の合計利用時間（分） |
| `updatedAt` | `Timestamp` | 最終更新日時 |
| `expireAt` | `Timestamp` | TTL 自動削除用 (date + 6ヶ月) |

**TTL**: 6ヶ月。日単位のサマリーとして長期保持。

**集計タイミング**: Firebase Functions の Scheduled Function で **毎日1回（深夜）バッチ集計** する。前日分の `usageLogs` を集計し、`dailyLogs` を upsert する。リアルタイム集計は行わない。

**ドキュメントID 設計**: `{deviceId}_{appName}_{YYYY-MM-DD}` とすることで、同一デバイス・同一アプリ・同一日のログが1ドキュメントに集約される。

**インデックス:**
- `parentId` + `date` DESC — 保護者ごとの日別クエリ
- `parentId` + `deviceId` + `date` DESC — デバイス別日別フィルタ

**モバイルアプリでの使い分け:**

| 画面 | データソース | 遡れる期間 | 粒度 | 備考 |
|------|------------|-----------|------|------|
| 利用時間サマリーカード（過去日） | `dailyLogs` | 6ヶ月 | 日単位 | バッチ集計済みデータ |
| 利用時間サマリーカード（今日） | `usageLogs` | 当日 | — | 当日分を `usageLogs` からオンデマンド集計 |
| 利用時間グラフ（詳細） | `usageLogs` | 30日 | 分単位 | |

> **今日のサマリー**: `dailyLogs` はバッチ集計のため当日分は未反映。モバイルアプリで「今日」の利用時間を表示する場合は、`usageLogs` の `date == today` をクエリし、アプリ側で集計する。

#### `oneTimeCodes` コレクション

| フィールド | 型 | 説明 |
|-----------|------|------|
| (ドキュメントID) | — | OTPコード文字列（6桁数字） |
| `parentId` | `string` | 発行した保護者の UID |
| `expiresAt` | `Timestamp` | 有効期限 (発行時刻 + 5分) |
| `used` | `boolean` | 使用済みフラグ |

### 3.2 Firestore セキュリティルール方針

| コレクション | 読み取り | 書き込み | 備考 |
|-------------|---------|---------|------|
| `users` | 本人のみ | API経由のみ | モバイルは本人ドキュメントのみ read 許可 |
| `usageLogs` | 本人のみ | API経由のみ | `parentId == auth.uid` で制限 |
| `dailyLogs` | 本人のみ | API経由のみ | `parentId == auth.uid` で制限 |
| `appRegistry` | 全ユーザー | 管理者のみ | グローバルマスタデータ。読み取りのみ全ユーザー許可 |
| `oneTimeCodes` | なし | API経由のみ | クライアント直接アクセス不可 |

---

## 4. セキュリティ設計

### 4.1 認証・認可

| コンポーネント | 認証方式 | 詳細 |
|--------------|---------|------|
| Chrome Extension → Functions | deviceId 検証 | Firestore `users.childDevices` に登録済みか確認 |
| Mobile → Functions | Firebase Auth (Bearer Token) | Google SSO で取得した ID Token を検証 |
| Mobile → Firestore | Firebase Auth | セキュリティルールで `auth.uid` に基づきアクセス制御 |

### 4.2 セキュリティ上の考慮事項

- **個人情報の最小化**: Extension は `deviceId` と `appName`（ドメイン名）のみ送信。ユーザーのメールアドレス・閲覧URL全体・ページタイトル等は送信しない
- **OTP の有効期限**: 5分間。使用後は `used: true` にマークし再利用不可
- **deviceId の秘匿**: deviceId は Extension 内の `chrome.storage.local` に保存され、外部からアクセス不可
- **HTTPS 通信**: Firebase Functions は HTTPS をデフォルト提供

---

## 5. 開発フェーズ計画

### フェーズ 1: コアトラッキングパイプライン

最小限の End-to-End フローを構築する。

| スプリント | 内容 | 成果物 |
|-----------|------|--------|
| S01 | プロジェクトセットアップ + Extension トラッキング + Backend API | Extension が利用ログを API 経由で Firestore に保存できる |

### フェーズ 2: ペアリング・モバイル閲覧

デバイス管理と保護者向け閲覧機能を追加する。

| スプリント | 内容 | 成果物 |
|-----------|------|--------|
| S02 | OTP ペアリングフロー (API + Extension Options) | Extension と保護者アカウントを OTP で紐付けできる |
| S03 | モバイルアプリ基盤 (認証 + 利用状況閲覧) | 保護者がアプリで利用状況をリアルタイムに確認できる |

### フェーズ 3: 本番運用準備

データライフサイクル管理・セキュリティ強化・デプロイ自動化を行う。

| スプリント | 内容 | 成果物 |
|-----------|------|--------|
| S04 | Firestore TTL・セキュリティルール・Cloud Run デプロイ | 本番環境で安全に運用できる状態 |

---

## 6. 非機能要件への対応方針

| 要件 | 方針 |
|------|------|
| リアルタイム性 | Firestore `onSnapshot` でモバイルアプリに即座反映。Extension → Functions は最大60秒遅延 |
| コスト最適化 | Firebase Functions のイベント駆動課金（アイドル時ゼロコスト）。Firestore TTL で `usageLogs` 30日 / `dailyLogs` 6ヶ月で自動削除。dailyLogs は日次バッチ集計で Firestore 書き込み回数を削減 |
| スケーラビリティ | Firebase Functions のオートスケール。Firestore のネイティブスケーリング |
| 可用性 | GCP マネージドサービスの SLA に依存。Extension 側はオフライン時のローカルバッファリングを検討（Phase 3） |
