# ADR-004: Expo Web (react-native-web) プラットフォーム固有のワークアラウンド

> **ステータス**: Accepted  
> **作成日**: 2026-03-11  
> **決定日**: 2026-03-11  
> **スプリント**: S03

---

## 背景 (Context)

S03 モバイルアプリは React Native (Expo) で構築し、DevContainer 内では `expo start --web`（react-native-web ベース）で動作確認を行う。開発中、react-native-web 環境では以下の互換性問題が発覚した:

1. **COOP (Cross-Origin-Opener-Policy) による SSO 失敗**: `expo-auth-session` は内部で `window.closed` を監視してポップアップ完了を検知する。しかし、Firebase Auth Emulator は `Cross-Origin-Opener-Policy` ヘッダーを返すため、`window.closed` へのアクセスがブロックされ、認証フローが完了しない。
2. **`Alert.alert` のコールバック不安定**: `react-native-web` の `Alert.alert` 実装は、コールバック関数の呼び出しが不安定であり、ログアウト確認ダイアログの「ログアウト」ボタンを押しても `onPress` ハンドラが発火しないケースが発生した。
3. **認証状態変更後のリダイレクト遅延**: `signOut()` 後、`_layout.tsx` の `onAuthStateChanged` リスナーによる `user` 状態更新 → `useEffect` → `router.replace` のチェーンでリダイレクトが発生しない場合があった。

---

## 検討した選択肢

### 選択肢 A: Web 専用のワークアラウンドを各所に追加

- 問題ごとに `Platform.OS === "web"` で分岐し、Web では代替実装を使用
- 利点: 影響範囲が局所的。Native 側の動作に影響しない
- 欠点: プラットフォーム分岐がコード内に散在する

### 選択肢 B: Web での動作確認を断念し、Native のみサポート

- DevContainer での手動テストを諦め、実機 / エミュレータのみで確認
- 利点: プラットフォーム分岐不要
- 欠点: DevContainer 完結の開発方針に反する。開発効率が大幅に低下

### 選択肢 C: react-native-web の互換レイヤーを自作

- `Alert` 等のモジュールをラップして Web 対応を統一
- 利点: 集約された抽象化
- 欠点: 過剰なエンジニアリング。問題箇所が限定的であるため不要な複雑性

---

## 決定 (Decision)

**選択肢 A を採用** — 問題ごとに最小限のプラットフォーム分岐を追加する。

### 適用箇所と対応内容

| 問題                             | ファイル                         | 対応                                                                                                   |
| -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| COOP による SSO 失敗             | `mobile/hooks/useAuth.ts`        | Web: `signInWithPopup()` を使用。Native: `expo-auth-session` を維持                                    |
| `Alert.alert` コールバック不発火 | `mobile/app/(tabs)/settings.tsx` | Web: `window.confirm()` を使用。Native: `Alert.alert()` を維持                                         |
| signOut 後のリダイレクト遅延     | `mobile/app/(tabs)/settings.tsx` | `signOut()` 成功後に `router.replace("/(auth)/login")` を明示的に呼び出し（auth guard のバックアップ） |

---

## 根拠 (Rationale)

- 問題箇所が3点に限定されており、抽象化レイヤーを構築するほどの規模ではない
- `Platform.OS` による分岐は React Native 開発では一般的なパターンであり、保守性を大きく損なわない
- DevContainer 内での `expo start --web` による即座の動作確認は開発効率上不可欠であり、Web 対応を放棄するコストの方が高い
- Native 側のコードパスは変更していないため、実機での動作に影響しない

---

## 影響 (Consequences)

- Web と Native で認証フロー・ログアウト確認のUIが微妙に異なる（ネイティブダイアログ vs ブラウザ標準ダイアログ）
- 今後 react-native-web の `Alert.alert` 実装が改善された場合、`window.confirm` 分岐を統合可能
- 将来 Expo Web をプロダクション環境で使う場合は、より統一的な対応を検討する必要がある
