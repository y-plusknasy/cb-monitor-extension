# S01: コアトラッキングパイプライン 詳細設計書

> **フェーズ**: Phase 1  
> **スプリント**: S01  
> **作成日**: 2026-02-28  
> **最終更新**: 2026-03-01  
> **ステータス**: Active  
> **関連ADR**: [ADR-001 日次利用バッファ設計](../../adr/ADR-001-daily-usage-buffer-design.md), [ADR-002 Unknown appName 収集ポリシーと etag 送信最適化](../../adr/ADR-002-unknown-appname-and-etag-optimization.md)

---

## 1. 概要

本スプリントでは、システムの最小限の End-to-End フローを構築する。Chrome Extension がブラウザの利用時間を計測し、Backend API 経由で Firestore に保存できる状態を目指す。

### 1.1 スコープ

**含む:**

- Chrome Extension (Service Worker) — PWA/ブラウザ検知・日次利用時間集計・バッチ送信
- Firebase Functions — `usageLogs` 受信エンドポイント（日次サマリー形式）
- Firestore — `usageLogs` コレクションへの upsert 書き込み
- deviceId の自動生成・永続保存
- chrome.storage.local を用いた状態永続化（Service Worker ライフサイクル対応）
- 種別不明ウィンドウの `"unknown"` としての利用時間計測（ADR-002）
- etag による送信差分検出・不要API送信の抑止（ADR-002）

**含まない（後続スプリントで対応）:**

- OTP ペアリングフロー (S02)
- モバイルアプリ (S03)
- dailyLogs 日次バッチ集計 (S02以降)
- appRegistry コレクションの初期データ投入 (S03)
- Firestore セキュリティルール・TTL設定 (S04)
- Firebase Auth 連携 (S02以降)

### 1.2 受け入れ基準

1. Extension をインストールし、Chrome ブラウザを使用すると appName=`"chrome"` として利用時間が日次集計される
2. PWA（YouTube 等）を開くと、そのドメイン名（例: `"youtube.com"`）が appName として独立して集計される
3. 1分ごとのアラームで計測中のセッションが日次バッファに加算される
4. ウィンドウフォーカス喪失時に未送信の過去日付データが即座に送信される
5. API が受信した日次サマリーを Firestore `usageLogs` コレクションに upsert 保存する
6. deviceId が初回起動時に自動生成され、以後永続的に使用される
7. Extension popup にステータス（現在の計測対象、本日の合計利用時間）が表示される
8. Service Worker が停止・再起動しても、日次バッファデータが失われない

---

## 2. Chrome Extension 詳細設計

### 2.1 manifest.json

```json
{
  "manifest_version": 3,
  "name": "Web Usage Tracker",
  "version": "0.1.0",
  "description": "ブラウザ利用時間を監視・記録する拡張機能",
  "permissions": ["tabs", "storage", "alarms"],
  "host_permissions": ["http://localhost/*", "https://*.cloudfunctions.net/*"],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
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

### 2.2 状態管理アーキテクチャ

> **ADR-001** で決定した設計方針に基づく。

Manifest V3 の Service Worker はアイドル状態で Chrome にいつでも停止される可能性があるため、**chrome.storage.local をプライマリストアとし、インメモリ状態は現在の計測セッション情報のみ**に限定する。

#### chrome.storage.local のキー構成

| キー              | 値の型                                                               | 説明                                |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------- |
| `deviceId`        | `string`                                                             | UUID v4。初回起動時に生成、以後永続 |
| `apiEndpoint`     | `string`                                                             | API のベース URL                    |
| `trackingSession` | `{appName, startTime} \| null`                                       | 現在計測中のセッション情報          |
| `dailyUsage`      | `{[date: string]: {[appName: string]: {totalSeconds, lastUpdated}}}` | 日次利用バッファ                    |
| `sentDates`       | `string[]`                                                           | 送信済み日付のリスト                |
| `lastSentEtag`    | `string`                                                             | 前回送信時の etag（差分検出用）     |

#### インメモリ状態（Service Worker 起動中のみ）

```javascript
const state = {
  currentAppName: null, // 現在計測中のアプリ名
  trackingStartTime: null, // 計測開始時刻 (ms)
  deviceId: null, // chrome.storage からロード
};
```

### 2.3 Service Worker (background/service-worker.js)

#### 主要関数

| 関数名                               | 責務                                                                                              | トリガー                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| `initialize()`                       | deviceId 取得/生成、前回セッション復元/破棄、ガベージコレクション、未送信データ送信、アラーム登録 | Service Worker 起動時           |
| `handleWindowFocusChanged(windowId)` | ウィンドウフォーカス変更時の処理                                                                  | `chrome.windows.onFocusChanged` |
| `startTracking(appName)`             | 利用時間計測開始、trackingSession 永続化                                                          | `handleWindowFocusChanged` 内   |
| `stopTracking()`                     | 計測停止・日次バッファへ加算・chrome.storage 永続化                                               | フォーカス変更時 / アラーム     |
| `flushUsageData()`                   | dailyUsage バッファを API に送信（当日分は毎回、過去日付は未送信のみ）                            | アラーム / フォーカス喪失時     |
| `flushOnAlarm()`                     | 定期アラームのフラッシュ処理                                                                      | chrome.alarms                   |
| `handleMessage()`                    | Popup からのステータス問い合わせに応答                                                            | `chrome.runtime.onMessage`      |

#### 処理フロー詳細

**初期化 (`initialize`)**

```
1. chrome.storage.local から deviceId を取得
2. deviceId が存在しない場合:
   a. crypto.randomUUID() で生成
   b. chrome.storage.local に保存
3. 前回の trackingSession を確認:
   a. 残っていれば破棄（Service Worker 停止中の時間は計測不能のため）
4. dailyUsage に対してガベージコレクション実行 (4日分保持)
5. sentDates の古いエントリも削除
6. 未送信データを送信（当日分含む）(flushUsageData)
7. chrome.alarms.create("flushLogs", { periodInMinutes: 1 })
```

**ウィンドウフォーカス変更時 (`handleWindowFocusChanged`)**

```
1. 現在計測中なら stopTracking()
2. windowId == WINDOW_ID_NONE の場合:
   a. Chrome が非アクティブ。flushUsageData() で当日分含む未送信データ送信
3. chrome.windows.get(windowId) でウィンドウ情報を取得
4. determineAppName(window, tabs) で appName を決定:
   a. window.type == "app" or "popup" → アクティブタブの URL からドメイン抽出 = appName（取得不可の場合は "unknown"）
   b. window.type == "normal" → appName = "chrome"
   c. それ以外のウィンドウタイプ → appName = "unknown"（利用時間として計測対象に含める）
5. startTracking(appName)
```

**計測停止 (`stopTracking`)**

```
1. 経過時間 = (Date.now() - state.trackingStartTime) / 1000
2. 経過時間が MIN_DURATION_SECONDS 未満なら無視
3. 日付跨ぎ判定:
   a. 同日: addUsageToDailyBuffer() でそのまま加算
   b. 日付跨ぎ: 各日に秒数を分割して加算
4. dailyUsage を chrome.storage.local に保存
5. trackingSession を null にリセット
```

**データ送信 (`flushUsageData`)**

```
1. API エンドポイント未設定なら何もしない
2. dailyUsage の中から送信対象を抽出:
   - 当日分: 毎回送信（最新の累積値で upsert）
   - 過去日付: sentDates に含まれない場合のみ
3. 送信対象データの etag（djb2 ハッシュ）を計算
4. chrome.storage.local の lastSentEtag と比較 → 一致すれば送信スキップ（ADR-002）
5. 各日付のアプリごとに日次サマリーを API に送信:
   { deviceId, date, appName, totalSeconds, lastUpdated }
6. 過去日付のみ送信成功で sentDates に追加（当日分は記録しない — 毎回再送するため）
7. 送信成功後、新しい etag を lastSentEtag に保存
8. 1件でも失敗したら残りも中断（次回アラームでリトライ）
```

#### リトライポリシー

- 送信失敗時は sentDates に記録しない → 次回アラームで自動リトライ
- 当日分は 60秒ごとにサーバーに送信（ただし etag が前回と同一の場合はスキップ。ADR-002）
- 日付データのバッファ保持期間: 4日間（当日含む）
- 保持期間超過分はガベージコレクションで自動削除
- ネットワークエラー時はコンソールログに記録（ユーザー通知なし）

### 2.4 Popup (popup/)

ステータス表示のみ。監視の開始/停止などの操作UIは設けない（子供が任意に監視を無効化できない設計）。

```html
<!-- popup/popup.html -->
<div id="status">
  <p>現在の計測対象: <span id="current-app">-</span></p>
  <p>デバイスID: <span id="device-id">-</span></p>
  <p>本日の合計: <span id="today-total">0 分</span></p>
</div>
```

**popup.js の処理:**

1. Service Worker にメッセージを送り、以下を取得して表示:
   - `currentAppName` — 現在の計測対象アプリ名
   - `deviceId` — デバイスID
   - `todayTotalSeconds` — 本日の累積利用秒数（「◯時間◯分」形式で表示）

### 2.5 Options (options/) — S01 最小版

S01 では OTP 入力は実装しない。API エンドポイントの設定のみ。

```html
<!-- options/options.html -->
<form id="settings-form">
  <label>API エンドポイント</label>
  <input type="url" id="api-endpoint" />

  <button type="submit">保存</button>
</form>
```

### 2.6 ユーティリティ (utils/)

**constants.js**

```javascript
/** chrome.storage のキー */
export const STORAGE_KEY_DEVICE_ID = "deviceId";
export const STORAGE_KEY_API_ENDPOINT = "apiEndpoint";
export const STORAGE_KEY_TRACKING_SESSION = "trackingSession";
export const STORAGE_KEY_DAILY_USAGE = "dailyUsage";
export const STORAGE_KEY_SENT_DATES = "sentDates";

/** Chrome ブラウザ全体の appName */
export const APP_NAME_CHROME_BROWSER = "chrome";

/** 種別不明のウィンドウに対する appName（ADR-002） */
export const APP_NAME_UNKNOWN = "unknown";

/** chrome.storage のキー: 前回送信時の etag（差分検出用、ADR-002） */
export const STORAGE_KEY_LAST_SENT_ETAG = "lastSentEtag";

/** アラーム名 */
export const ALARM_NAME_FLUSH = "flushLogs";

/** 計測の最小秒数 (これ未満は無視) */
export const MIN_DURATION_SECONDS = 1;

/** バッファ保持期間 (日数、当日含む) */
export const BUFFER_RETENTION_DAYS = 4;
```

**storage.js**

```javascript
/**
 * chrome.storage.local の Promise ラッパー
 */
export async function getStorage(key) { ... }
export async function setStorage(key, value) { ... }
```

**tracking.js** — 純粋関数（Chrome API 非依存、テスト容易）

```javascript
export function extractDomain(url) { ... }
export function determineAppName(win, tabs) { ... }  // null の代わりに "unknown" を返す（ADR-002）
export function getToday(now?) { ... }           // → "YYYY-MM-DD"
export function addUsageToDailyBuffer(dailyUsage, date, appName, seconds) { ... }
export function pruneOldDates(dailyUsage, retentionDays, now?) { ... }
export function computeDailyUsageEtag(dailyUsage) { ... }  // djb2 ハッシュによる差分検出（ADR-002）
```

**api.js**

```javascript
/**
 * 日次サマリーログを API に送信する
 * @param {string} endpoint
 * @param {Array<{deviceId, date, appName, totalSeconds, lastUpdated}>} logs
 * @returns {Promise<boolean>}
 */
export async function sendUsageLogs(endpoint, logs) { ... }
```

---

## 3. Firebase Functions 詳細設計

### 3.1 プロジェクトセットアップ

DevContainer に Firebase CLI がプリインストール済みであるため、以下を実行するだけでよい。

```bash
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
  "date": "2026-02-28",
  "appName": "youtube.com",
  "totalSeconds": 3600,
  "lastUpdated": "2026-02-28T23:59:00.000Z"
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

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const usageLogSchema = z.object({
  deviceId: z.string().uuid(),
  date: dateString,
  appName: z.string().min(1).max(253),
  totalSeconds: z.number().int().positive().max(86400),
  lastUpdated: z.string().datetime(),
});
```

#### ハンドラ実装方針

```typescript
// src/usageLogs.ts
import { onRequest } from "firebase-functions/v2/https";

export const usageLogs = onRequest(async (req, res) => {
  // 1. POST メソッド以外は 405 を返す
  // 2. Zod でバリデーション
  // 3. ドキュメントID = "${deviceId}_${date}_${appName}" で一意管理
  // 4. Firestore usageLogs コレクションに upsert (set + merge)
  //    - parentId = "unlinked" (S01)
  //    - expireAt = date + 30日
  // 5. レスポンス返却
});
```

> **注意**: S01 では deviceId 検証（ペアリング済みかどうか）は行わない。全てのリクエストを受け付け、`parentId: "unlinked"` として保存する。S02 のペアリング実装後に検証ロジックを追加する。
>
> **dailyLogs について**: S01 では dailyLogs の集計は行わない。dailyLogs の日次バッチ集計は後続スプリントで Scheduled Function として実装する。
>
> **upsert**: 同一 `{deviceId, date, appName}` の組み合わせの場合、totalSeconds を上書きする。Extension 側で累積加算済みのため、サーバー側は最新値をそのまま保存する。

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

| 変数名                           | 必須         | 説明                                                        |
| -------------------------------- | ------------ | ----------------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS` | ローカルのみ | サービスアカウントキーの JSON パス（Emulator 使用時は不要） |

Firebase Functions 環境ではデフォルトサービスアカウントが自動的に使用される。DevContainer + Firebase Emulator での開発時は、サービスアカウントキーは不要。

---

## 4. Firestore 設計 (S01 スコープ)

### 4.1 `usageLogs` コレクション

S01 で Firestore に保存するドキュメント構造:

ドキュメントID: `${deviceId}_${date}_${appName}`（upsert による冪等書き込み）

```typescript
interface UsageLogDocument {
  parentId: string; // S01 では "unlinked" 固定
  deviceId: string; // UUID
  date: string; // "YYYY-MM-DD"
  appName: string; // PWA: ドメイン名 / ブラウザ: "chrome" / 判別不能: "unknown"
  totalSeconds: number; // その日のアプリ累積利用秒数
  lastUpdated: Timestamp; // Extension 側の最終更新日時
  expireAt: Timestamp; // date + 30日 (TTL 用)
  updatedAt: Timestamp; // サーバー書き込み時のタイムスタンプ
}
```

> **注**: `dailyLogs` コレクションの集計は S01 のスコープ外。後続スプリントで Scheduled Function による日次バッチ集計として実装する。

---

## 5. ローカル開発環境

### 5.1 前提条件

- DevContainer が起動済みであること（Node.js 20、Firebase CLI、Java 21 はコンテナ内にプリインストール済み）
- GCP プロジェクト作成済み
- Firebase プロジェクト作成済み（Firestore 有効化済み）

> **注意**: すべての開発は DevContainer 内で完結させる。ホストマシンに Node.js 等をインストールする必要はない。

### 5.2 セットアップ手順

```bash
# DevContainer を起動（VS Code で「Reopen in Container」を選択）

# Firebase Functions
cd functions
npm install

# Firebase Emulators 起動
firebase emulators:start --only functions,firestore
# Emulator Suite UI: http://localhost:4000
# Functions emulator: http://localhost:5001
# Firestore emulator: http://localhost:8080
# → ポートは devcontainer.json で自動転送される

# Extension
# Chrome で chrome://extensions を開く
# 「パッケージ化されていない拡張機能を読み込む」→ extension/ フォルダを指定
# Options ページで API エンドポイントを emulator URL に設定
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

| 対象                          | テスト内容                                       | フレームワーク |
| ----------------------------- | ------------------------------------------------ | -------------- |
| `extractDomain(url)`          | URL からドメインを正しく抽出できる (7テスト)     | Vitest         |
| `determineAppName(win, tabs)` | PWA/ブラウザの判定と appName 決定 (7テスト)      | Vitest         |
| `getToday(now?)`              | YYYY-MM-DD 形式の日付文字列を返す (3テスト)      | Vitest         |
| `addUsageToDailyBuffer()`     | 日次バッファへの加算・イミュータブル性 (4テスト) | Vitest         |
| `pruneOldDates()`             | ガベージコレクション (3テスト)                   | Vitest         |
| `computeDailyUsageEtag()`     | etag 計算・差分検出の正確性 (4テスト)            | Vitest         |
| `usageLogSchema` (Zod)        | 正常/異常リクエストのバリデーション (12テスト)   | Vitest         |

### 6.2 手動テスト

| #   | シナリオ                                                                 | 期待結果                                           |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| 1   | Extension インストール後、popup でデバイスIDと「本日の合計」が表示される | UUID 形式のIDと利用時間が表示                      |
| 2   | Chrome ブラウザを使用して 60秒待つ                                       | dailyUsage に appName=`"chrome"` の秒数が加算      |
| 3   | YouTube PWA を開いて 60秒待つ                                            | dailyUsage に appName=`"youtube.com"` の秒数が加算 |
| 4   | Chrome ブラウザから他のアプリにフォーカスを切り替える                    | 過去日付の未送信データが送信される                 |
| 5   | PWA から Chrome ブラウザにフォーカスを切り替える                         | PWA の計測が停止し Chrome 計測が開始               |
| 6   | API 停止中に Chrome を利用し、その後 API を再起動                        | 次回アラームで過去日付データが送信される           |
| 7   | Chrome を完全に閉じて再起動する                                          | dailyUsage が chrome.storage から復元される        |

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
│   ├── api.js
│   ├── tracking.js
│   └── tracking.test.js
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
│       ├── validation.test.ts
│       └── constants.ts
├── package.json
└── tsconfig.json

docs/
├── adr/
│   ├── ADR-001-daily-usage-buffer-design.md
│   └── ADR-002-unknown-appname-and-etag-optimization.md
└── detail-design/
    └── phase1/
        └── s01-core-tracking-pipeline.md
```
