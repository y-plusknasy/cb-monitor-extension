# S01: コアトラッキングパイプライン 詳細設計書

> **フェーズ**: Phase 1  
> **スプリント**: S01  
> **作成日**: 2026-02-28  
> **ステータス**: Draft  

---

## 1. 概要

本スプリントでは、システムの最小限の End-to-End フローを構築する。Chrome Extension がブラウザの利用時間を計測し、Backend API 経由で Firestore に保存できる状態を目指す。

### 1.1 スコープ

**含む:**
- Chrome Extension (Service Worker) — PWA/ブラウザ検知・利用時間計測・バッチ送信
- Firebase Functions — `usageLogs` 受信エンドポイント
- Firestore — `usageLogs` コレクションへの書き込み
- deviceId の自動生成・永続保存

**含まない（後続スプリントで対応）:**
- OTP ペアリングフロー (S02)
- モバイルアプリ (S03)
- dailyLogs 日次バッチ集計 (S02以降)
- appRegistry コレクションの初期データ投入 (S03)
- Firestore セキュリティルール・TTL設定 (S04)
- Firebase Auth 連携 (S02以降)

### 1.2 受け入れ基準

1. Extension をインストールし、Chrome ブラウザを使用すると appName=`"chrome"` として利用時間が計測される
2. PWA（YouTube 等）を開くと、そのドメイン名（例: `"youtube.com"`）が appName として独立して計測される
3. 60秒ごとに蓄積された利用ログが API に送信される
4. ウィンドウフォーカス喪失時に未送信ログが即座に送信される
5. API が受信したログを Firestore `usageLogs` コレクションに保存する
6. deviceId が初回起動時に自動生成され、以後永続的に使用される
7. Extension popup にステータスが表示される（監視の開始/停止ボタンはない）

---

## 2. Chrome Extension 詳細設計

### 2.1 manifest.json

```json
{
  "manifest_version": 3,
  "name": "Web Usage Tracker",
  "version": "0.1.0",
  "description": "ブラウザ利用時間を監視・記録する拡張機能",
  "permissions": [
    "tabs",
    "storage",
    "alarms"
  ],
  "host_permissions": [
    "https://*.googleapis.com/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "options_page": "options/options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 2.2 Service Worker (background/service-worker.js)

#### 状態管理

```javascript
/**
 * Service Worker が管理する状態
 */
const state = {
  /** @type {string|null} 現在計測中のアプリ名 (PWA: ドメイン名 / Browser: "chrome" / null: 非アクティブ) */
  currentAppName: null,
  /** @type {number|null} 現在のアプリの計測開始時刻 (ms) */
  trackingStartTime: null,
  /** @type {Array<UsageLogEntry>} 未送信のログバッファ */
  logBuffer: [],
  /** @type {string|null} デバイスID */
  deviceId: null,
};

/**
 * @typedef {Object} UsageLogEntry
 * @property {string} deviceId
 * @property {string} appName - PWA: ドメイン名 / ブラウザ: "chrome"
 * @property {number} durationSeconds
 * @property {string} timestamp - ISO8601
 */
```

#### 主要関数

| 関数名 | 責務 | トリガー |
|--------|------|---------|
| `initialize()` | deviceId 取得/生成、アラーム登録、リスナー登録 | Service Worker 起動時 |
| `handleWindowFocusChanged(windowId)` | ウィンドウフォーカス変更時の処理 | `chrome.windows.onFocusChanged` |
| `determineAppName(window)` | ウィンドウ種別を判定し appName を決定 | `handleWindowFocusChanged` 内 |
| `extractDomain(url)` | URL からドメインを抽出 | PWA ウィンドウ検出時 |
| `startTracking(appName)` | 利用時間計測開始 | `handleWindowFocusChanged` 内 |
| `stopTracking()` | 計測停止・ログバッファへ追加 | フォーカス変更時 |
| `flushLogs()` | バッファ内のログを Functions に送信 | アラーム or 割り込みイベント |
| `sendToApi(logs)` | API 通信の実行 | `flushLogs` 内 |

#### 処理フロー詳細

**初期化 (`initialize`)**
```
1. chrome.storage.local.get("deviceId")
2. deviceId が存在しない場合:
   a. crypto.randomUUID() で生成
   b. chrome.storage.local.set({ deviceId }) で保存
3. chrome.alarms.create("flushLogs", { periodInMinutes: 1 })
4. イベントリスナーを登録
```

**ウィンドウフォーカス変更時 (`handleWindowFocusChanged`)**
```
1. 現在計測中なら stopTracking()
2. windowId == WINDOW_ID_NONE の場合:
   a. Chrome が非アクティブ。割り込み送信を検討
3. chrome.windows.get(windowId) でウィンドウ情報を取得
4. determineAppName(window) で appName を決定:
   a. window.type == "app" or "popup" → アクティブタブの URL からドメイン抽出 = appName
   b. window.type == "normal" → appName = "chrome"
5. startTracking(appName)
```

**計測停止 (`stopTracking`)**
```
1. 経過時間 = (Date.now() - state.trackingStartTime) / 1000
2. 経過時間が 1秒未満なら無視
3. logBuffer に UsageLogEntry を追加
4. state.currentAppName = null, state.trackingStartTime = null
```

**ログ送信 (`flushLogs`)**
```
1. logBuffer が空なら何もしない
2. 送信対象ログを取り出し、logBuffer をクリア
3. sendToApi(logs) を実行
4. 送信失敗時は logs を logBuffer に戻す（リトライ）
```

#### 送信リトライポリシー

- 送信失敗時はログをバッファに戻し、次回アラームで再送
- 最大バッファサイズ: 1000件（超過分は古いものから破棄）
- ネットワークエラー時はコンソールログに記録（ユーザー通知なし）

### 2.3 Popup (popup/)

ステータス表示のみ。監視の開始/停止などの操作UIは設けない（子供が任意に監視を無効化できない設計）。

```html
<!-- popup/popup.html -->
<div id="status">
  <p>現在の計測対象: <span id="current-app">-</span></p>
  <p>デバイスID: <span id="device-id">-</span></p>
  <p>未送信ログ: <span id="buffer-count">0</span> 件</p>
</div>
```

**popup.js の処理:**
1. `chrome.storage.local.get("deviceId")` でデバイスID表示
2. Service Worker にメッセージを送り、現在の計測対象アプリ名 (`currentAppName`) ・バッファ件数を取得して表示

### 2.4 Options (options/) — S01 最小版

S01 では OTP 入力は実装しない。API エンドポイントの設定のみ。

```html
<!-- options/options.html -->
<form id="settings-form">
  <label>API エンドポイント</label>
  <input type="url" id="api-endpoint" />

  <button type="submit">保存</button>
</form>
```

### 2.5 ユーティリティ (utils/)

**constants.js**
```javascript
/** バッチ送信間隔 (ms) */
export const SEND_INTERVAL_MS = 60_000;

/** chrome.storage のキー */
export const STORAGE_KEY_DEVICE_ID = "deviceId";
export const STORAGE_KEY_API_ENDPOINT = "apiEndpoint";

/** Chrome ブラウザ全体の appName */
export const APP_NAME_CHROME_BROWSER = "chrome";

/** 最大バッファサイズ */
export const MAX_BUFFER_SIZE = 1000;

/** アラーム名 */
export const ALARM_NAME_FLUSH = "flushLogs";
```

**storage.js**
```javascript
/**
 * chrome.storage.local の Promise ラッパー
 */
export async function getStorage(key) { ... }
export async function setStorage(key, value) { ... }
```

**api.js**
```javascript
/**
 * 利用ログを API に送信する
 * @param {string} endpoint - API のベース URL
 * @param {UsageLogEntry[]} logs - 送信するログ
 * @returns {Promise<boolean>} 送信成功/失敗
 */
export async function sendUsageLogs(endpoint, logs) { ... }
```

---

## 3. Firebase Functions 詳細設計

### 3.1 プロジェクトセットアップ

```bash
npm install -g firebase-tools
firebase init functions  # TypeScript を選択
```

依存パッケージ:
- `firebase-admin` — Firestore アクセス
- `firebase-functions` — Cloud Functions
- `zod` — リクエストバリデーション

### 3.2 `usageLogs` 関数 (src/usageLogs.ts)

#### リクエスト/レスポンス仕様

**Request:**
```
POST https://<region>-<project>.cloudfunctions.net/usageLogs
Content-Type: application/json

{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "appName": "youtube.com",
  "durationSeconds": 45,
  "timestamp": "2026-02-28T10:30:00.000Z"
}
```

**Response (200):**
```json
{ "status": "ok" }
```

**Response (400):**
```json
{ "error": "validation_error", "details": [...] }
```

**Response (401) — S02以降で実装:**
```json
{ "error": "unknown_device" }
```

#### バリデーションスキーマ (Zod)

```typescript
import { z } from "zod";

export const usageLogSchema = z.object({
  deviceId: z.string().uuid(),
  appName: z.string().min(1).max(253),  // PWA: ドメイン名 / ブラウザ: "chrome"
  durationSeconds: z.number().int().positive().max(86400),
  timestamp: z.string().datetime(),
});
```

#### ハンドラ実装方針

```typescript
// src/usageLogs.ts
import { onRequest } from "firebase-functions/v2/https";

export const usageLogs = onRequest(async (req, res) => {
  // 1. リクエストボディの JSON パース
  // 2. Zod でバリデーション
  // 3. (S01では省略) deviceId → parentId の逆引き
  //    - S01 では parentId = "unlinked" として保存
  // 4. Firestore usageLogs コレクションに保存
  //    - expireAt = timestamp + 30日
  // 5. レスポンス返却
});
```

> **注意**: S01 では deviceId 検証（ペアリング済みかどうか）は行わない。全てのリクエストを受け付け、`parentId: "unlinked"` として保存する。S02 のペアリング実装後に検証ロジックを追加する。
>
> **dailyLogs について**: S01 では dailyLogs の集計は行わない。dailyLogs の日次バッチ集計は後続スプリントで Scheduled Function として実装する。

### 3.3 Firestore クライアント (src/lib/firestore.ts)

```typescript
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK を初期化し、Firestore インスタンスを返す。
 * Firebase Functions 環境ではデフォルト認証情報を使用。
 */
export function getDb(): FirebaseFirestore.Firestore {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}
```

### 3.4 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `GOOGLE_APPLICATION_CREDENTIALS` | ローカルのみ | サービスアカウントキーの JSON パス |

Firebase Functions 環境ではデフォルトサービスアカウントが自動的に使用される。

---

## 4. Firestore 設計 (S01 スコープ)

### 4.1 `usageLogs` コレクション

S01 で Firestore に保存するドキュメント構造:

```typescript
interface UsageLogDocument {
  parentId: string;       // S01 では "unlinked" 固定
  deviceId: string;       // UUID
  appName: string;        // PWA: ドメイン名 / ブラウザ: "chrome"
  durationSeconds: number;
  timestamp: Timestamp;   // Firestore Timestamp
  expireAt: Timestamp;    // timestamp + 30日 (TTL 用)
  createdAt: Timestamp;   // サーバー書き込み時のタイムスタンプ
}
```

> **注**: `dailyLogs` コレクションの集計は S01 のスコープ外。後続スプリントで Scheduled Function による日次バッチ集計として実装する。

---

## 5. ローカル開発環境

### 5.1 前提条件

- Node.js 20+
- GCP プロジェクト作成済み
- Firebase プロジェクト作成済み（Firestore 有効化済み）
- Firebase サービスアカウントキー取得済み

### 5.2 セットアップ手順

```bash
# Firebase Functions
cd functions
npm install
firebase emulators:start --only functions,firestore
# Functions emulator: http://localhost:5001
# Firestore emulator: http://localhost:8080

# Extension
# Chrome で chrome://extensions を開く
# 「パッケージ化されていない拡張機能を読み込む」→ extension/ フォルダを指定
# Options ページで API エンドポイントを http://localhost:5001/<project>/us-central1/usageLogs に設定
```

### 5.3 動作確認手順

1. Firebase emulators を起動
2. Extension を Chrome にロード
3. Options ページで API エンドポイント = emulator URL を設定
4. YouTube PWA を開き、60秒以上利用
5. Firestore emulator UI で `usageLogs` コレクションに appName=`"youtube.com"` のドキュメントが追加されていることを確認
6. Chrome ブラウザでウィンドウを切り替えて、フォーカス喪失時に即座にログが送信されることを確認

---

## 6. テスト戦略

### 6.1 ユニットテスト

| 対象 | テスト内容 | フレームワーク |
|------|-----------|--------------|
| `extractDomain(url)` | URL からドメインを正しく抽出できる | Jest |
| `determineAppName(window)` | PWA/ブラウザの判定と appName 決定 | Jest |
| `stopTracking()` | 経過時間の計算・バッファ追加 | Jest |
| `usageLogSchema` (Zod) | 正常/異常リクエストのバリデーション | Vitest |
| `POST /api/usage-logs` | 正常保存・バリデーションエラー | Vitest |

### 6.2 手動テスト

| # | シナリオ | 期待結果 |
|---|---------|----------|
| 1 | Extension インストール後、popup でデバイスIDが表示される | UUID 形式のIDが表示 |
| 2 | Chrome ブラウザを使用して〠60秒待つ | appName=`"chrome"` で Firestore にログ保存 |
| 3 | YouTube PWA を開いだ60秒待つ | appName=`"youtube.com"` で Firestore にログ保存 |
| 4 | Chrome ブラウザから他のアプリにフォーカスを切り替える | 即座にログが送信される |
| 5 | PWA から Chrome ブラウザにフォーカスを切り替える | PWA のログが送信され、Chrome 計測が開始 |
| 6 | API 停止中に Chrome を利用し、その後 API を再起動 | 次回アラームでバッファされたログが送信される |

---

## 7. 成果物一覧

```
extension/
├── manifest.json
├── background/
│   └── service-worker.js
├── popup/
│   ├── popup.html
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
├── utils/
│   ├── constants.js
│   ├── storage.js
│   └── api.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png

functions/
├── src/
│   ├── index.ts
│   ├── usageLogs.ts
│   └── lib/
│       ├── firestore.ts
│       ├── validation.ts
│       └── constants.ts
├── package.json
└── tsconfig.json
```
