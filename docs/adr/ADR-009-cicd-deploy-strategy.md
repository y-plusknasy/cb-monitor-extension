# ADR-009: CI/CD デプロイ戦略

## ステータス

**承認済み**

## コンテキスト

CB Link は以下の3コンポーネントで構成される:

1. **Firebase Functions** — バックエンド API + スケジュール関数
2. **モバイルアプリ (APK)** — React Native / Expo ビルド
3. **Chrome 拡張機能** — Chrome Web Store で配布

リリース前に、CI/CD パイプラインで自動デプロイを構築し、手動作業を最小限にする必要がある。

### 要件

- Firebase Functions の自動デプロイ（main ブランチへのマージ時）
- APK ビルド + GitHub Releases への自動アップロード
- Chrome 拡張機能は **手動で Chrome Web Store にアップロード** する（Google の審査プロセスがあるため）
- GitHub Pages ドキュメントサイトの自動デプロイ

### 検討した選択肢

#### A. 全自動デプロイ（main マージ = 即デプロイ）

- main へのマージで Functions / APK / Pages すべてを自動デプロイ
- **メリット**: 完全自動化、デプロイ忘れがない
- **デメリット**: Functions の破壊的変更が即座に本番に反映されるリスク

#### B. タグベースデプロイ（リリースタグで本番デプロイ）

- CI（テスト・ビルド）は main マージ時に実行
- 本番デプロイ（Functions / APK Release）は `v*` タグのプッシュ時に実行
- **メリット**: デプロイのタイミングを制御可能、リリース意図の明確化
- **デメリット**: タグ作成が追加手順

#### C. ハイブリッド（CI は自動、デプロイは手動トリガー）

- main マージ時は CI のみ（テスト・ビルド確認）
- デプロイは `workflow_dispatch` で手動トリガー
- **メリット**: 最大限の制御、誤デプロイ防止
- **デメリット**: 手動操作が増える

## 決定

**選択肢 B: タグベースデプロイを採用する。**

### 理由

1. **意図的なリリース**: `v*` タグの作成が「リリース意図」を明確にする。main マージのたびにデプロイされるリスクを回避。
2. **バージョン管理との統合**: タグ = バージョン番号で、APK リリースと Functions デプロイが同期される。
3. **Chrome 拡張機能との整合性**: Chrome Web Store への手動アップロード時にも同じバージョンタグを参照できる。
4. **ロールバック容易性**: 過去のタグから再デプロイ可能。

### CI/CD パイプライン構成

```
┌─────────────────────────────────────────────────┐
│  on: push (main) / pull_request (main)          │
│                                                 │
│  ┌─────────────────────┐                        │
│  │  functions-ci       │  Build + Lint + Test   │
│  └─────────────────────┘                        │
│  ┌─────────────────────┐                        │
│  │  extension-ci       │  Test                  │
│  └─────────────────────┘                        │
│  ┌─────────────────────┐                        │
│  │  mobile-ci          │  Type check + Test     │
│  └─────────────────────┘                        │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  on: push (tags: v*)                            │
│                                                 │
│  ┌─────────────────────┐                        │
│  │  deploy-functions   │  firebase deploy       │
│  │                     │  --only functions      │
│  └─────────────────────┘                        │
│  ┌─────────────────────┐                        │
│  │  build-apk          │  eas build --local     │
│  │  + release-apk      │  → GitHub Release      │
│  └─────────────────────┘                        │
│  ┌─────────────────────┐                        │
│  │  deploy-pages       │  GitHub Pages deploy   │
│  └─────────────────────┘                        │
│  ┌─────────────────────┐                        │
│  │  build-extension-zip│  zip 作成               │
│  │                     │  → Release Asset       │
│  └─────────────────────┘                        │
└─────────────────────────────────────────────────┘
```

### リリース手順

1. バージョン番号を更新（`manifest.json`, `package.json`, `app.json`）
2. `git tag v1.0.0 && git push origin v1.0.0`
3. GitHub Actions が自動実行:
   - Firebase Functions デプロイ
   - APK ビルド + GitHub Release 作成 + APK アップロード
   - Extension zip ビルド + Release Asset として添付
   - GitHub Pages デプロイ
4. Chrome Web Store へ手動アップロード（Release Asset の zip を使用）

### Firebase Functions デプロイの認証

- GitHub Secrets に `FIREBASE_SERVICE_ACCOUNT` を設定（Firebase CI/CD 用サービスアカウント JSON）
- `google-github-actions/auth` アクションで認証

### APK ビルド

- Expo の `eas build --platform android --profile production --local` は CI リソースが不足する可能性があるため、`expo build:android` ではなく EAS Build（クラウド）を利用
- ただし EAS Build 無料枠に制限があるため、初期は `--local` でビルドし、必要に応じてクラウドに移行

## 影響

- `.github/workflows/ci.yml` を拡張（mobile-ci ジョブ追加）
- `.github/workflows/deploy.yml` を新規作成（タグトリガーのデプロイ）
- GitHub Secrets に Firebase サービスアカウント等の設定が必要
- リリース手順ドキュメントの作成

## 今後の検討事項

### Turborepo の導入

コンポーネント数（`functions` / `extension` / `mobile`）が増え、CI パイプラインが APK ビルド・Extension zip ビルド・Functions デプロイを抱えるようになった場合、[Turborepo](https://turbo.build/) の導入を検討する。

**期待される効果:**

- キャッシュによるビルド時間の短縮（変更のないパッケージはスキップ）
- `turbo run build test lint` で全パッケージを並列実行
- CI ワークフローの簡素化（個別ジョブ → 単一 `turbo` コマンド）

**導入タイミング**: ビルドパイプラインが安定し、CI 実行時間が問題になった段階で検討。現時点では優先度低。
