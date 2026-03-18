# ADR-010: Google 認証ライブラリの切り替え

## ステータス

承認済み

## 日付

2026-03-17

## 背景

モバイルアプリ（Expo / React Native）の Google SSO 認証に `expo-auth-session` を採用していたが、Android 実機（Pixel 7a / Android 16）でのテストにおいて以下の問題が繰り返し発生した。

1. **"Missing required parameter: client_id"** — 環境変数の伝搬問題（EAS Env 設定で解消）
2. **"Custom URI scheme is not enabled for your Android client"** — `expo-auth-session` がブラウザベースの OAuth フローを使用し、カスタム URI スキーム (`cb-monitor://`) でのリダイレクトを要求するが、GCP の Web Client ID はカスタム URI スキームを許可しない
3. `useAuthRequest` → `useIdTokenAuthRequest` への変更、`clientId` / `androidClientId` の組み合わせ変更等を複数回試行したが、根本的にブラウザ経由リダイレクトというアーキテクチャに起因するため解決に至らず

## 選択肢

### A. `@react-native-google-signin/google-signin` に切り替え（採用）

- Google Play Services の Sign-In API をネイティブで呼び出す
- Expo Config Plugin 公式サポートあり（EAS Build 対応済み）
- Firebase + Expo での利用実績が最も多い
- `idToken` を取得 → `signInWithCredential` で Firebase Auth に連携（既存パターンを維持）
- リダイレクト URI 不要（ネイティブ API 直接呼び出し）
- ドメイン認証（`assetlinks.json`）不要

### B. `react-native-credentials-manager` に切り替え

- Android Credential Manager API（Google 推奨の最新 API）を使用
- One Tap UI で最良の UX
- ただし `assetlinks.json` のドメイン認証セットアップが別途必要
- ライブラリとしてまだ新しく、Expo + Firebase での事例が少ない
- セットアップコストが方針 A より高い

### C. `expo-auth-session` の設定修正を継続

- GCP Console で redirect URI を正しく設定できれば理論上動作する
- 過去数回の試行で解決しておらず、同種の問題が繰り返されるリスクが高い
- ブラウザが開く UX は変わらない

## 決定

**方針 A: `@react-native-google-signin/google-signin` に切り替える。**

## 根拠

1. **実績**: Firebase + Expo での利用実績が圧倒的に多く、ドキュメント・事例が豊富
2. **セットアップ最小**: Expo Config Plugin によりネイティブ設定が自動化され、ドメイン認証も不要
3. **既存コード互換**: `idToken` → `GoogleAuthProvider.credential()` → `signInWithCredential()` のパターンがそのまま使える
4. **問題の根本解決**: ブラウザ経由リダイレクトを完全に排除し、リダイレクト URI 関連のエラーが構造的に発生しない
5. **UX 向上**: ブラウザ遷移なしでネイティブの Google Sign-In UI が表示される

## 影響

### 追加される依存

- `@react-native-google-signin/google-signin` (v16.x)

### 削除される依存

- `expo-auth-session`
- `expo-web-browser`

### 変更されるファイル

- `mobile/hooks/useAuth.ts` — 認証ロジック全面書き換え
- `mobile/package.json` — 依存パッケージ変更
- `mobile/app.json` — Expo Config Plugin 追加
- `mobile/lib/constants.ts` — `ANDROID_CLIENT_ID` 削除（ネイティブ SDK が自動解決するため不要）

### GCP Console 設定

- Android Client ID の SHA-1 フィンガープリントが EAS Build Keystore のものと一致していること（既に設定済み）
- Web Client ID はコード内で `webClientId` として使用（変更なし）

### 保持される動作

- Web プラットフォーム: 引き続き `signInWithPopup` を使用（変更なし）
- Emulator テスト用 `signInWithEmail`: 変更なし
