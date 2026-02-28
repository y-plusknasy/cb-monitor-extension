# 要求仕様書: Web利用時間トラッカー (Functional Requirements Document)

## 1. システム概要 (System Overview)
本システムは、Chromebook、Windows、Mac等のChromeブラウザおよびPWA（Progressive Web Apps）の利用時間を詳細に監視・集計するツールである。Googleファミリーリンクがカバーしきれない「ブラウザ内アクティビティ」を補完し、保護者へリアルタイムな利用状況を提供する。

システムは以下の3コンポーネントで構成される:
1. **Chrome Extension** — 子供デバイス側で監視対象ドメインの滞在時間を計測・送信
2. **Next.js API (Backend)** — Cloud Run上で稼働し、デバイス認証・ログ保存を担当
3. **React Native (Expo) モバイルアプリ** — 保護者がリアルタイムに利用状況を閲覧

---

## 2. 技術スタック (Technology Stack)
* **フロントエンド (監視)**: Chrome Extension (JavaScript / WebExtensions API)
* **バックエンド (API)**: Next.js (App Router) on **Google Cloud Run**
* **データベース**: **Firebase Firestore**
* **モバイルアプリ (閲覧)**: **React Native (Expo)**
* **認証**: Firebase Auth (Google SSO)
* **ホスティング/インフラ**: Google Cloud Platform (GCP)

---

## 2.1 プロジェクト構成 (Project Structure)

```
cb-monitor-extension/
├── .github/
│   └── copilot-instructions.md
├── docs/
│   ├── adr/                # Architecture Decision Records
│   ├── FunctionalRequirements.md
│   └── copilot-instructions.md.example
├── extension/              # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── background/         # Service Worker (tracking logic)
│   ├── popup/              # Extension popup UI
│   ├── options/            # Options/settings page (OTP input etc.)
│   └── utils/              # Shared utilities
├── backend/                # Next.js App Router API
│   ├── app/
│   │   └── api/            # API Routes
│   ├── lib/                # Shared server utilities (Firestore client, etc.)
│   └── package.json
├── mobile/                 # React Native (Expo) app
│   ├── app/                # Expo Router screens
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Firebase client, utilities
│   └── package.json
└── README.md
```

---

## 3. 主要機能要求 (Functional Requirements)

### 3.1 ペアリング機能 (Initial Setup)


1.  **OTP発行**: 保護者がアプリで「デバイス追加」をリクエスト。バックエンドは一時的なワンタイムパスコード (OTP) を生成しFirestoreに保存する。
2.  **デバイス登録**: 拡張機能設定画面でOTPを入力。拡張機能は自身の `deviceId` (UUID) とOTPを送信。
3.  **マッピング**: APIはOTPを検証し、`deviceId` を親のUIDに紐付けてFirestoreへ保存する。

### 3.2 利用監視・データ送信 (Tracking & Transmission)
1.  **アクティブ判定**: `chrome.tabs.onActivated` および `chrome.windows.onFocusChanged` を監視。
2.  **フィルタリング**: 設定された特定のドメイン (例: youtube.com, gemini.google.com) の滞在時間を計測。
3.  **データ送信**:
    * **頻度**: 60秒ごとのパッチ送信。
    * **割り込み送信**: ウィンドウのフォーカスが外れた際やタブが閉じられた際、即座に未送信分を送信。
4.  **送信項目**:
    ```json
    {
      "deviceId": "string",
      "appName": "string",
      "durationSeconds": number,
      "timestamp": "ISO8601"
    }
    ```

### 3.3 データ保存・ライフサイクル (Data Retention)
* **Firestore保存**: Cloud Run APIが `deviceId` から親UIDを逆引きし、`parentId` を付与してログを保存。
* **データ保持期間**: 
    * **30日間**: モバイルアプリでの可視化用に保持。
    * **自動削除**: FirestoreのTTL (Time To Live) 機能を使用し、作成から30日経過したドキュメントを自動削除。

---

## 4. 非機能要求 (Non-Functional Requirements)
* **リアルタイム性**: モバイルアプリ側はFirestoreのリスナー (`onSnapshot`) を活用し、子供の利用状況を即座に反映する。
* **セキュリティ**: 
    * API側での `deviceId` 検証。
    * 拡張機能側での個人情報（メールアドレス等）の直接送信回避。
* **コスト最適化**: Cloud Runのサーバーレス特性を活かし、リクエストがない時のコストを最小化する。

---

## 5. Firestore データ構造案 (Schema)

* **`users` (Collection)**
    * `parentUid`: { email, childDevices: [{deviceId, deviceName}] }
* **`usageLogs` (Collection)**
    * `logId`: { parentId, deviceId, appName, durationSeconds, timestamp, expireAt }
* **`oneTimeCodes` (Collection)**
    * `otpCode`: { parentId, expires }
