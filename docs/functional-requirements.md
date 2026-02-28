# 要求仕様書: Web利用時間トラッカー (Functional Requirements Document)

## 1. システム概要 (System Overview)

本システムは、Chromebook、Windows、Mac等のChromeブラウザおよびPWA（Progressive Web Apps）の利用時間を詳細に監視・集計するツールである。GoogleファミリーリンクはAndroidアプリの利用時間を集計できるが、Chrome OSのシステムアプリとして組み込まれているChromeブラウザとそのPWA（YouTube, Duolingo等）の利用時間は集計対象外である。本システムはこのギャップを補完し、保護者へリアルタイムな利用状況を提供する。

Chromeブラウザに拡張機能をインストールし、利用中にビーコン（利用ログ）をFirebaseに送信することで、利用ログを集計する。

システムは以下の3コンポーネントで構成される:
**監視対象:**

- Chrome ブラウザ全体の利用時間（個別タブの切り替えは追跡しない）
- PWA として動作するアプリ（YouTube, Duolingo 等）の利用時間（ドメインでアプリを識別し、独立して集計）

**監視対象外:**

- Chrome OS 上の Android アプリ（ファミリーリンクで集計可能。Chrome 拡張機能のスコープ外）

1. **Chrome Extension** — 子供デバイス側で Chrome ブラウザおよび PWA の利用時間を計測・送信
2. **Firebase Functions (2nd gen)** — イベント駆動でデバイス認証・ログ保存を担当
3. **React Native (Expo) モバイルアプリ** — 保護者がリアルタイムに利用状況を閲覧

---

## 2. 技術スタック (Technology Stack)

- **フロントエンド (監視)**: Chrome Extension (JavaScript / WebExtensions API)
- **バックエンド (API)**: **Firebase Functions (2nd gen, Node.js)**
- **データベース**: **Firebase Firestore**
- **モバイルアプリ (閲覧)**: **React Native (Expo)**
- **認証**: Firebase Auth (Google SSO)
- **ホスティング/インフラ**: Google Cloud Platform (GCP)

---

## 2.1 プロジェクト構成 (Project Structure)

```
cb-monitor-extension/
├── .devcontainer/          # DevContainer 設定 (Dockerfile, devcontainer.json)
├── .github/
│   └── copilot-instructions.md
├── docs/
│   ├── adr/                # Architecture Decision Records
│   ├── functional-requirements.md
│   ├── basic-design/       # 基本設計書
│   └── detail-design/      # 詳細設計書
├── extension/              # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── background/         # Service Worker (tracking logic)
│   ├── popup/              # Extension popup UI
│   ├── options/            # Options/settings page (OTP input etc.)
│   └── utils/              # Shared utilities
├── functions/              # Firebase Functions (2nd gen)
│   ├── src/
│   │   ├── index.ts        # Function exports
│   │   ├── handlers/       # Request handlers
│   │   └── lib/            # Shared utilities (Firestore client, etc.)
│   ├── tsconfig.json
│   └── package.json
├── mobile/                 # React Native (Expo) app
│   ├── app/                # Expo Router screens
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Firebase client, utilities
│   └── package.json
└── README.md
```

> **開発環境**: すべての開発は DevContainer 内で完結させる。DevContainer には Node.js 20、Firebase CLI、Java 21（Emulator 用）が事前インストールされている。詳細は `.devcontainer/` を参照。

---

## 3. 主要機能要求 (Functional Requirements)

### 3.1 ペアリング機能 (Initial Setup)

1.  **OTP発行**: 保護者がアプリで「デバイス追加」をリクエスト。バックエンドは一時的なワンタイムパスコード (OTP) を生成しFirestoreに保存する。
2.  **デバイス登録**: 拡張機能設定画面でOTPを入力。拡張機能は自身の `deviceId` (UUID) とOTPを送信。
3.  **マッピング**: APIはOTPを検証し、`deviceId` を親のUIDに紐付けてFirestoreへ保存する。

### 3.2 利用監視・データ送信 (Tracking & Transmission)

1.  **PWA / ブラウザ検知**: `chrome.windows.onFocusChanged` でウィンドウフォーカスを監視。ウィンドウ種別（`type`）で PWA (`app`) か Chrome ブラウザ (`normal`) かを判嬥する。
2.  **appName 決定**: PWA の場合はウィンドウの URL ドメインを appName とする（例: `youtube.com`）。Chrome ブラウザの場合は appName = `"chrome"`（個別タブは追跡しない）。
3.  **データ送信**:
    - **頻度**: 60秒ごとのパッチ送信。
    - **割り込み送信**: ウィンドウのフォーカスが外れた際やタブが閉じられた際、即座に未送信分を送信。
4.  **送信項目**:
    ```json
    {
      "deviceId": "string",
      "appName": "string",
      "durationSeconds": "number",
      "timestamp": "ISO8601"
    }
    ```
    > `appName` は PWA の場合ドメイン名（例: `"youtube.com"`）、Chrome ブラウザの場合 `"chrome"`。

### 3.3 データ保存・ライフサイクル (Data Retention)

- **Firestore保存**: Firebase Functions が `deviceId` から親UIDを逆引きし、`parentId` を付与してログを保存。
- **データ保持期間**:
  - **30日間**: モバイルアプリでの可視化用に保持。
  - **自動削除**: FirestoreのTTL (Time To Live) 機能を使用し、作成から30日経過したドキュメントを自動削除。

---

## 4. 非機能要求 (Non-Functional Requirements)

- **リアルタイム性**: モバイルアプリ側はFirestoreのリスナー (`onSnapshot`) を活用し、子供の利用状況を即座に反映する。
- **セキュリティ**:
  - API側での `deviceId` 検証。
  - 拡張機能側での個人情報（メールアドレス等）の直接送信回避。
- **コスト最適化**: Firebase Functions のイベント駆動 (idle = ゼロコスト) を活かし、リクエストがない時のコストを最小化する。

---

## 5. Firestore データ構造案 (Schema)

- **`users` (Collection)**
  - `{parentUid}`: { parentUid, email, displayName, childDevices: [{deviceId, deviceName, registeredAt}], createdAt }
- **`usageLogs` (Collection)** — TTL: 30日
  - `{logId}`: { parentId, deviceId, appName, durationSeconds, timestamp, expireAt }
- **`dailyLogs` (Collection)** — TTL: 6ヶ月
  - `{deviceId}_{appName}_{YYYY-MM-DD}`: { parentId, deviceId, appName, date, totalMinutes, updatedAt, expireAt }
  - 1レコード = deviceId-appName の組み合わせの1日の利用時間合計（分）
- **`appRegistry` (Collection)** — グローバル（ユーザー非依存）
  - `{domain}`: { domain, displayName, iconUrl, category, updatedAt }
  - ドメイン → 表示名・アイコンのマッピングテーブル（例: `youtube.com` → "YouTube"）
- **`oneTimeCodes` (Collection)**
  - `{otpCode}`: { parentId, expiresAt, used }
