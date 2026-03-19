# ADR-011: OTP スクリーンキャプチャ防止

## ステータス

却下（Rejected）

## 背景

OtpDisplay コンポーネントが表示されている状態でデバイスのホーム画面に戻り、アプリ一覧（Recent Apps / App Switcher）を表示すると、OTP コードがキャプチャ画像として表示され、第三者に見られるリスクがある。

OTP 有効期限が切れた後も、アプリ一覧のキャプチャ画像が OS によって更新されるまで OTP が残り続ける。

## 選択肢

### 選択肢 A: `expo-screen-capture` を使用（FLAG_SECURE）

Android の `FLAG_SECURE` を利用して、アプリ画面のスクリーンショット・アプリスイッチャーのキャプチャを OS レベルで防止する。

- **メリット**: OS レベルで確実にキャプチャを防止できる
- **デメリット**:
  - アプリ全体のスクリーンショットが不可になる（OTP 画面以外も影響）
  - OTP 表示時のみ有効化/無効化する制御が必要
  - `expo-screen-capture` パッケージの追加が必要
  - EAS Build が必要（Expo Go では動作しない）

```tsx
// OTP 表示時のみ FLAG_SECURE を有効化
import * as ScreenCapture from "expo-screen-capture";

useEffect(() => {
  ScreenCapture.preventScreenCaptureAsync();
  return () => {
    ScreenCapture.allowScreenCaptureAsync();
  };
}, []);
```

### 選択肢 B: AppState でコンテンツをマスクする

React Native の `AppState` でバックグラウンド遷移を検知し、OTP テキストを `***` に置換する。

- **メリット**: 追加パッケージ不要、軽量
- **デメリット**:
  - OS がキャプチャを取るタイミングは AppState コールバックより前の場合があり、確実ではない
  - Android / iOS でタイミングが異なる可能性
  - 効果が保証されない

### 選択肢 C: 対応しない

- **メリット**: 実装コストゼロ、エラーリスクなし
- **デメリット**: OTP が 5 分間アプリスイッチャーに残るリスクがある（ただし OTP 自体は 5 分で期限切れとなり、再利用不可）

## 判断材料

- OTP は 5 分間のみ有効で、1 回のペアリングにしか使えない。リスクは限定的。
- 初回リリース後にユーザーフィードバックを見て追加対応する選択もある。
- 選択肢 A は確実だが、OTP 表示画面以外にも影響が出る可能性がある。

## 決定

**選択肢 C: 対応しない**

OTP は 5 分間のみ有効かつ 1 回限りの使い捨てであり、リスクは限定的と判断。初回リリース時点では対応しない。今後ユーザーフィードバックやセキュリティ要件の変化に応じて、選択肢 A の導入を検討する。

## 推奨

選択肢 A（`expo-screen-capture`）を推奨する。OTP 表示時のみ `preventScreenCaptureAsync()` / `allowScreenCaptureAsync()` を呼び出すことで影響範囲を限定できる。実装量は OtpDisplay.tsx に `useEffect` を 1 つ追加する程度で、修正コストは小さい。
