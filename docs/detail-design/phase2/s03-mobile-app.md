# S03: モバイルアプリ基盤（認証 + 利用状況閲覧） 詳細設計書

> **フェーズ**: Phase 2  
> **スプリント**: S03  
> **作成日**: 2026-03-02  
> **ステータス**: Active  
> **前提**: [S01: コアトラッキングパイプライン](../phase1/s01-core-tracking-pipeline.md), [S02: OTP ペアリング](../phase2/s02-otp-pairing.md)

---

## 1. 概要

本スプリントでは、保護者向けの React Native (Expo) モバイルアプリの基盤を構築する。Firebase Auth (Google SSO) による認証、子供のデバイス利用状況のリアルタイム閲覧、デバイス管理（OTP 発行・デバイス一覧）、設定画面を実装し、保護者が子供の Chrome / PWA 利用時間をモバイルアプリ上でリアルタイムに確認できる状態を目指す。

### 1.1 スコープ

**含む:**

- Expo (React Native) プロジェクト初期化
- Firebase Auth (Google SSO) による認証フロー
- Expo Router によるナビゲーション（タブベース）
- ホーム画面:
  - 今日の合計利用時間サマリー
  - デバイス別 → アプリ別内訳（`usageLogs` の `onSnapshot` リアルタイム更新）
  - 利用履歴チャート（7日間バーチャート + タップで日別内訳 + 28日分ページング）
- デバイス管理画面: 登録デバイス一覧（syncAvailable / lastSeenAt 表示）+ OTP 発行
- 設定画面: アカウント情報・ログアウト
- Firebase Functions API との連携（`generateOtp`）
- Firestore `onSnapshot` リスナーによるリアルタイムデータ購読
- AppUsageRow: `displayName` / `iconUrl` プロパティ対応（appRegistry 連携の準備）

**含まない（後続スプリントで対応）:**

- dailyLogs 日次バッチ集計 (S04 以降)
- appRegistry マスタデータ管理・displayName/iconUrl の実際の読み込み (S04 以降)
- プッシュ通知 (FCM) (S04 以降)
- Firestore セキュリティルール (S04)
- 無操作検知アラート (S04 以降)
- デバイス削除機能 (S04 以降)

### 1.2 受け入れ基準

1. Expo アプリが起動し、Google SSO でログインできる
2. ログイン後、ホーム画面に今日の利用時間サマリーがリアルタイムで表示される
3. **デバイス別にグルーピングされた**アプリ別利用時間内訳が表示される（`usageLogs` の `date == today` をクエリ）
4. **利用履歴チャート**（7日分バーチャート）が表示され、バータップで日別内訳が展開される。最大28日分ページング対応
5. デバイス管理画面に登録済みデバイス一覧が表示される（**syncAvailable / lastSeenAt** 付き）
6. デバイス管理画面から OTP を発行でき、6桁コードが表示される
7. 設定画面でアカウント情報が表示され、ログアウトできる
8. 認証ガードにより、未ログイン時はログイン画面にリダイレクトされる
9. Firestore リスナーにより、Extension からのデータ送信がリアルタイムに反映される

---

## 2. 技術スタック

| 項目           | 技術                                                |
| -------------- | --------------------------------------------------- |
| フレームワーク | React Native (Expo SDK 55)                          |
| ナビゲーション | Expo Router v55                                     |
| 認証           | Firebase Auth (Firebase JS SDK `firebase/auth`)     |
| データベース   | Firestore (Firebase JS SDK `firebase/firestore`)    |
| Google SSO     | `expo-auth-session` (Google provider)               |
| Web サポート   | `react-native-web` (Expo Web / DevContainer 確認用) |
| 状態管理       | React hooks (useState, useEffect, useCallback)      |
| 言語           | TypeScript (strict mode)                            |

> **Firebase JS SDK 採用理由**: `@react-native-firebase` はネイティブモジュールを含み EAS Build が必須だが、Firebase JS SDK は Expo Go で即座に動作するため開発効率が高い。Auth + Firestore onSnapshot の全要件を満たせる。
>
> **react-native-web**: DevContainer 環境では実機・エミュレータが利用できないため、`npx expo start --web` で Expo Web としてブラウザ上で動作確認を行う。`react-native-web` はその際に必要となる依存パッケージ。`npx expo install react-native-web` でインストールする（Expo SDK 55 互換バージョンが自動選択される）。

---

## 3. ディレクトリ構成

```
mobile/
├── app/
│   ├── _layout.tsx                # Root Layout（認証ガード）
│   ├── (auth)/
│   │   ├── _layout.tsx            # Auth グループレイアウト
│   │   └── login.tsx              # ログイン画面
│   └── (tabs)/
│       ├── _layout.tsx            # タブナビゲーション
│       ├── index.tsx              # ホーム（今日のサマリー + 利用履歴チャート）
│       ├── devices.tsx            # デバイス一覧・OTP 発行
│       └── settings.tsx           # 設定
├── components/
│   ├── UsageSummaryCard.tsx       # 利用時間サマリーカード
│   ├── AppUsageRow.tsx            # アプリ別利用時間行（displayName/iconUrl 対応）
│   ├── DeviceCard.tsx             # デバイスカード（syncAvailable/lastSeenAt 表示）
│   ├── UsageHistoryChart.tsx      # 利用履歴バーチャート（7日×4ページ）
│   ├── OtpDisplay.tsx             # OTP 表示コンポーネント
│   └── LoadingScreen.tsx          # ローディング画面
├── hooks/
│   ├── useAuth.ts                 # Firebase Auth フック
│   ├── useUsageLogs.ts            # usageLogs リアルタイムリスナー（デバイス別集計付き）
│   ├── useUsageHistory.ts         # 利用履歴取得フック（7日×ページ）
│   └── useDevices.ts              # デバイス一覧フック（syncAvailable/lastSeenAt 付き）
├── lib/
│   ├── firebase.ts                # Firebase 初期化
│   ├── constants.ts               # 定数
│   └── formatters.ts              # 時間・日付フォーマットユーティリティ
├── app.json                       # Expo 設定
├── tsconfig.json
├── package.json
└── .gitignore
```

---

## 4. 画面設計

### 4.1 画面一覧

| 画面         | パス               | 説明                                 | データソース                 |
| ------------ | ------------------ | ------------------------------------ | ---------------------------- |
| ログイン     | `/(auth)/login`    | Google SSO ログイン                  | Firebase Auth                |
| ホーム       | `/(tabs)/`         | 今日の利用時間サマリー・アプリ別内訳 | Firestore `usageLogs`        |
| デバイス管理 | `/(tabs)/devices`  | 登録デバイス一覧・OTP 発行           | Firestore `users`, Functions |
| 設定         | `/(tabs)/settings` | アカウント情報・ログアウト           | Firebase Auth                |

### 4.2 認証フロー

```
アプリ起動
  ↓
Root Layout (_layout.tsx)
  ↓
Firebase Auth 状態を監視 (onAuthStateChanged)
  ↓
├─ 未認証 → (auth)/login にリダイレクト
│     ↓
│   ┌─ Web: 「Google でサインイン」 → signInWithPopup()（COOP 問題を回避）
│   │       Emulator 接続時は Auth Emulator の認証UIが開く
│   ├─ Web (Emulator): 「メール/パスワードでログイン」 → signInWithEmailAndPassword()
│   └─ Native: 「Google でサインイン」 → expo-auth-session → signInWithCredential()
│     ↓
│   認証成功 → (tabs)/ にリダイレクト
│
└─ 認証済み → (tabs)/ を表示
```

### 4.3 ホーム画面（今日のサマリー + 利用履歴）

**データ取得方法:**

- Firestore `usageLogs` コレクションに対して以下のクエリを `onSnapshot` で購読:
  - `where("parentId", "==", currentUser.uid)`
  - `where("date", "==", today)` （`today` = `YYYY-MM-DD` 形式）
- クエリ結果を合計して「今日の合計利用時間」を算出
- `aggregateByDevice()` でデバイス別合計を集計
- デバイスごとにアプリ別 `totalSeconds` を集計して内訳を表示
- 利用履歴チャート: `useUsageHistory` フックで7日間×ページ分のデータを取得

**表示要素:**

- 今日の合計利用時間（時間:分 形式）
- **利用履歴チャート**: 7日間バーチャート（タップで日別内訳展開、28日分ページング）
- **デバイス別セクション**: セクションヘッダーにデバイス名と合計時間
  - 各デバイス内のアプリ別利用時間リスト
  - appName: ドメイン名またはアプリ名（displayName 対応）
  - 利用時間（分 or 時間:分）
  - アイコン（iconUrl → favicon フォールバック）

### 4.4 デバイス管理画面

**データ取得方法:**

- Firestore `users/{uid}` ドキュメントの `childDevices` 配列を `onSnapshot` で購読
- Firestore `devices` コレクションを `onSnapshot` で購読し、`syncAvailable` / `lastSeenAt` を取得
- OTP 発行時: `generateOtp` Firebase Function に POST リクエスト

**表示要素:**

- 登録済みデバイスカード一覧
  - デバイス名
  - 登録日時
  - **syncAvailable**: `false` の場合は ⚠️ アイコン + 「バックアップ不可」警告テキスト
  - **lastSeenAt**: 最終通信日時
- 「デバイス追加」ボタン → OTP 発行 → OTP コード表示（5分タイマー付き）

### 4.5 設定画面

**表示要素:**

- メールアドレス
- 表示名
- ログアウトボタン

**ログアウト処理:**

- ログアウト確認ダイアログ → `signOut()` → `router.replace("/(auth)/login")` で明示的にログイン画面へ遷移
- Web: `window.confirm()` を使用（react-native-web の `Alert.alert` はコールバック不安定のため）
- Native: `Alert.alert()` を使用
- 詳細は [ADR-004](../../adr/ADR-004-expo-web-platform-workarounds.md) を参照

---

## 5. カスタムフック設計

### 5.1 `useAuth`

Firebase Auth の状態を管理するフック。

```typescript
interface AuthState {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isEmulator: boolean;
}

function useAuth(): AuthState;
```

**実装方針:**

- `onAuthStateChanged` リスナーで認証状態を監視
- `signInWithGoogle`:
  - Web: Firebase Auth の `signInWithPopup` を使用（`expo-auth-session` は COOP ヘッダーにより Web で動作しないため）。Emulator 接続時は Auth Emulator の認証UIが開く
  - Native: `expo-auth-session` で Google SSO を実行し、取得した credential で `signInWithCredential` を呼び出す
- `signInWithEmail`: `signInWithEmailAndPassword` で直接ログイン（Emulator テスト用）
- `signOut`: `firebaseSignOut(auth)`
- `isEmulator`: `EXPO_PUBLIC_USE_EMULATOR === "true"` で判定。ログイン画面でメール/パスワードフォームの表示制御に使用

### 5.2 `useUsageLogs`

指定日の利用ログをリアルタイムに取得するフック。デバイス別合計も集計して返す。

```typescript
interface UsageLogEntry {
  deviceId: string;
  appName: string;
  totalSeconds: number;
  date: string;
}

interface DeviceTotalEntry {
  deviceId: string;
  totalSeconds: number;
}

interface UsageLogsState {
  logs: UsageLogEntry[];
  totalSeconds: number; // 全デバイス合計
  deviceTotals: DeviceTotalEntry[]; // デバイス別合計（降順）
  loading: boolean;
  error: Error | null;
}

function useUsageLogs(
  parentId: string | undefined,
  date?: string, // 省略時は今日
): UsageLogsState;
```

**実装方針:**

- `parentId` が存在する場合のみ `onSnapshot` リスナーを開始
- クエリ: `usageLogs` where `parentId == parentId` and `date == targetDate`
- `aggregateByDevice()` でデバイス別合計を算出
- クリーンアップ時にリスナーを解除

### 5.3 `useDevices`

登録デバイス一覧を取得するフック。`users/{uid}` と `devices` コレクションの両方を購読し、メタデータをマージして返す。

```typescript
interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  registeredAt: string;
  syncAvailable: boolean | null; // chrome.storage.sync 利用可否
  lastSeenAt: string | null; // 最終データ受信日時 (ISO8601)
}

interface DevicesState {
  devices: DeviceInfo[];
  loading: boolean;
  error: Error | null;
}

function useDevices(uid: string | undefined): DevicesState;
```

**実装方針:**

- `users/{uid}` ドキュメントを `onSnapshot` で購読 → `childDevices` 配列を取得
- `devices` コレクション（`where documentId in childDeviceIds`）を `onSnapshot` で購読 → `syncAvailable`, `lastSeenAt` を取得
- 両スナップショットの結果をマージして `DeviceInfo[]` を構築
- クリーンアップ時に両リスナーを解除

### 5.4 `useUsageHistory`

指定ページの7日間分の利用ログを日別に集計するフック。

```typescript
interface DailySummary {
  date: string; // YYYY-MM-DD
  totalSeconds: number;
}

interface UsageHistoryState {
  dailySummaries: DailySummary[]; // 古い順
  loading: boolean;
  error: Error | null;
}

function useUsageHistory(
  parentId: string | undefined,
  page: number, // 0〜3（28日 ÷ 7日 = 4ページ）
): UsageHistoryState;
```

**実装方針:**

- ページ番号から日付範囲（7日分）を算出
- `usageLogs` を `date >= startDate` and `date <= endDate` で `onSnapshot` 購読
- 日ごとの `totalSeconds` を集計
- クリーンアップ時にリスナーを解除

---

## 6. コンポーネント設計

### 6.1 `UsageSummaryCard`

今日の合計利用時間を表示するカード。

```typescript
interface UsageSummaryCardProps {
  totalSeconds: number;
}
```

### 6.2 `AppUsageRow`

アプリ別の利用時間を1行で表示。

```typescript
interface AppUsageRowProps {
  appName: string;
  totalSeconds: number;
  displayName?: string; // appRegistry から取得。指定時はこちらを表示名に使用
  iconUrl?: string; // appRegistry から取得。指定時はこちらをアイコンに使用
}
```

- `displayName` が指定されていればそれを表示名に使う。未指定時は `DEFAULT_APP_DISPLAY_NAMES` → `appName` そのままの順でフォールバック
- `iconUrl` が指定されていればそのアイコン画像を使う。未指定時は Google S2 favicon API にフォールバック
- `appName == "chrome"` / `"unknown"` の場合はアイコンプレースホルダー（絵文字）を表示

### 6.3 `DeviceCard`

登録デバイスの情報を表示するカード。syncAvailable / lastSeenAt のメタデータも表示する。

```typescript
interface DeviceCardProps {
  deviceName: string;
  registeredAt: string;
  syncAvailable?: boolean | null; // false の場合に警告を表示
  lastSeenAt?: string | null; // 最終通信日時
}
```

- `syncAvailable === false` の場合: ⚠️ アイコン + 「バックアップ不可」警告テキストを表示
- `lastSeenAt` がある場合: 最終通信日時を表示

### 6.6 `UsageHistoryChart`

7日間分の日別合計利用時間をバーチャートで表示し、バータップで日別内訳を展開するコンポーネント。

```typescript
interface UsageHistoryChartProps {
  parentId: string;
  deviceNameMap?: Map<string, string>; // deviceId → deviceName
}
```

**機能:**

- 7日間分のバーチャート（React Native View ベース、ライブラリ不使用）
- バータップ → その日のデバイス別 → アプリ別内訳をチャート下部に表示
- ◀ 前週 / 次週 ▶ でページング（最大28日分 = 4ページ）
- 各バーの上に利用時間（HH:MM 形式）を表示
- 日付ラベル（M/D）と曜日ラベルを表示

### 6.4 `OtpDisplay`

OTP コードと残り時間を表示。

```typescript
interface OtpDisplayProps {
  otp: string;
  expiresIn: number; // 秒
  onExpired: () => void;
}
```

- カウントダウンタイマーで残り時間を表示
- 期限切れ時に `onExpired` コールバック

### 6.5 `LoadingScreen`

認証状態確認中のローディング画面。

---

## 7. Firebase 連携設計

### 7.1 Firebase 初期化 (`lib/firebase.ts`)

```typescript
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 環境変数 (EXPO_PUBLIC_*) から Firebase 設定を読み込み
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  // ...
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
```

### 7.2 API 呼び出し（OTP 発行）

```typescript
async function generateOtp(
  idToken: string,
  apiBaseUrl: string,
): Promise<{ otp: string; expiresIn: number }> {
  const response = await fetch(`${apiBaseUrl}/generateOtp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!response.ok) throw new Error("OTP generation failed");
  return response.json();
}
```

### 7.3 Firestore クエリ

**今日の利用ログ:**

```typescript
firestore()
  .collection("usageLogs")
  .where("parentId", "==", uid)
  .where("date", "==", todayString)
  .onSnapshot((snapshot) => {
    const logs = snapshot.docs.map((doc) => doc.data());
    // 集計処理
  });
```

**ユーザー情報:**

```typescript
firestore()
  .collection("users")
  .doc(uid)
  .onSnapshot((doc) => {
    const userData = doc.data();
    // childDevices 取得
  });
```

---

## 8. 環境設定・ビルド設定

### 8.1 Expo 設定 (app.json)

- `expo.plugins` に `@react-native-firebase/app`, `@react-native-google-signin/google-signin` を追加
- Android: `google-services.json` を配置
- iOS: `GoogleService-Info.plist` を配置
- Expo Development Build を使用（Expo Go では Firebase Native SDK が使えないため）

### 8.2 環境変数

| 変数名                      | 説明                                |
| --------------------------- | ----------------------------------- |
| `EXPO_PUBLIC_API_BASE_URL`  | Firebase Functions のベース URL     |
| `EXPO_PUBLIC_WEB_CLIENT_ID` | Google SSO 用 OAuth クライアント ID |

---

## 9. テスト戦略

### 9.1 ユニットテスト

| 対象               | テスト内容                   | フレームワーク |
| ------------------ | ---------------------------- | -------------- |
| `useUsageLogs`     | ログ集計ロジック             | Jest           |
| `UsageSummaryCard` | 秒→時間:分のフォーマット     | Jest           |
| `OtpDisplay`       | カウントダウンタイマー動作   | Jest           |
| ユーティリティ関数 | 日付フォーマット・時間変換等 | Jest           |

### 9.2 手動テスト

| #   | シナリオ                                           | 期待結果                             |
| --- | -------------------------------------------------- | ------------------------------------ |
| 1   | アプリ起動 → Google SSO でログイン                 | ホーム画面に遷移                     |
| 2   | ホーム画面で今日の利用時間が表示される             | usageLogs から集計した利用時間が表示 |
| 3   | Extension からデータ送信後、ホーム画面に即座に反映 | onSnapshot でリアルタイム更新        |
| 4   | デバイス管理画面でデバイス一覧が表示               | users.childDevices の内容が表示      |
| 5   | デバイス管理画面で OTP 発行                        | 6桁コードが表示、5分タイマー開始     |
| 6   | 設定画面でログアウト                               | ログイン画面に遷移                   |
| 7   | 未ログイン状態でタブ画面に遷移しようとする         | ログイン画面にリダイレクト           |

---

## 10. 成果物一覧

```
mobile/
├── app/
│   ├── _layout.tsx
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   └── (tabs)/
│       ├── _layout.tsx
│       ├── index.tsx
│       ├── devices.tsx
│       └── settings.tsx
├── components/
│   ├── UsageSummaryCard.tsx
│   ├── AppUsageRow.tsx
│   ├── DeviceCard.tsx
│   ├── UsageHistoryChart.tsx
│   ├── OtpDisplay.tsx
│   └── LoadingScreen.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useUsageLogs.ts
│   ├── useUsageHistory.ts
│   ├── useDevices.ts
│   └── __tests__/
│       └── useUsageLogs.test.ts
├── lib/
│   ├── firebase.ts
│   ├── constants.ts
│   └── formatters.ts
├── __tests__/
│   └── formatters.test.ts
├── app.json
├── tsconfig.json
├── package.json
└── .gitignore

docs/
├── detail-design/phase2/
│   └── s03-mobile-app.md            # 本ドキュメント
├── owner-tasks/
│   └── s03-firebase-setup.md        # オーナー向けセットアップ手順
└── mermaid/
    └── s03-mobile-data-flow.md      # モバイルアプリデータフロー図
```

---

## 11. 実装に関する注意事項

### 11.1 Firebase JS SDK + Expo Go

Firebase JS SDK (`firebase` npm パッケージ) を使用しているため、ネイティブモジュール不要で **Expo Go** で即座に動作確認が可能。

- 開発時: `npx expo start` で Expo Go アプリから接続
- 本番ビルド: EAS Build でスタンドアロン APK/IPA を生成

### 11.2 Emulator 接続

`EXPO_PUBLIC_USE_EMULATOR=true` を設定すると、`lib/firebase.ts` で `connectAuthEmulator` / `connectFirestoreEmulator` が自動適用される。詳細は `mobile/.env` を参照。

### 11.5 Expo Web (react-native-web) での動作確認

DevContainer 内では `npx expo start --web` で Web ブラウザ上での動作確認が可能。ただし、react-native-web には以下の互換性問題があり、プラットフォーム固有のワークアラウンドを適用している。詳細は [ADR-004](../../adr/ADR-004-expo-web-platform-workarounds.md) を参照。

- 認証: `expo-auth-session` → Web では `signInWithPopup` に切替（COOP 問題回避）
- ログアウト確認: `Alert.alert` → Web では `window.confirm` に切替
- signOut 後のリダイレクト: 明示的に `router.replace` を呼び出し

### 11.3 今日のサマリーのデータソース

基本設計書の方針に従い、「今日」の利用時間は `usageLogs` コレクション（`date == today`）からオンデマンドで集計する。`dailyLogs` は日次バッチ集計のため当日分は未反映。

### 11.4 DevContainer 制約

DevContainer 内ではネイティブビルドツール（Android SDK、Xcode）は利用できない。モバイルアプリのコード作成・テスト（Jest）は DevContainer 内で行い、ビルド・実機テストは EAS Build またはローカルマシンで行う。
