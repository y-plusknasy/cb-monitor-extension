# ADR-014: コンポーネント別バージョニングとCD

## ステータス

**承認済み** — ADR-009 のタグベースデプロイを拡張

## コンテキスト

ADR-009 では `v*` 単一タグでプロジェクト全体をデプロイする方式を採用した。しかし運用を経て以下の課題が顕在化した:

- **不要なデプロイ**: 拡張機能と Functions のみの改修でも、docs-site や mobile の再デプロイが走る
- **バージョンの形骸化**: 変更のないコンポーネントのバージョンが上がり、リリース履歴から変更内容を追いにくい
- **コスト・時間の浪費**: 変更のない APK ビルドやPages デプロイが毎回実行される

### 要件

- コンポーネント（docs-site / extension / functions / mobile）ごとに独立してバージョン管理する
- 各コンポーネントの変更に対応するタグを打ち、そのタグに連動したデプロイのみ実行する
- 旧方式（`v*` 全体タグ）は廃止し、混乱を防ぐ

## 決定

**コンポーネントプレフィックス付きタグによるデプロイを採用する。**

### タグ命名規則

| コンポーネント           | タグパターン | 例              |
| ------------------------ | ------------ | --------------- |
| Chrome 拡張機能          | `ext/v*`     | `ext/v1.0.1`    |
| Firebase Functions       | `fn/v*`      | `fn/v1.0.1`     |
| GitHub Pages (docs-site) | `docs/v*`    | `docs/v1.0.1`   |
| モバイルアプリ           | `mobile/v*`  | `mobile/v1.0.1` |

### デプロイマトリクス

```
ext/v* タグ Push:
├─ extension-ci (Test)
├─ build-extension (Zip 作成)
└─ create-release (GitHub Release + Extension zip)

fn/v* タグ Push:
├─ functions-ci (Build + Lint + Test)
└─ deploy-functions (Firebase Functions deploy)

docs/v* タグ Push:
└─ deploy-pages (GitHub Pages deploy)

mobile/v* タグ Push:
├─ mobile-ci (Type check + Test)
└─ create-release (GitHub Release + APK)
```

### CI パスフィルタリング

push / PR 時の CI も、変更のあるコンポーネントのみテストを実行する:

| ジョブ         | トリガーパス   |
| -------------- | -------------- |
| `functions-ci` | `functions/**` |
| `extension-ci` | `extension/**` |
| `mobile-ci`    | `mobile/**`    |

### GitHub Release の運用

- Release はコンポーネントタグごとに作成: `CB Link Extension v1.0.1`, `CB Link Functions v1.0.1` 等
- Extension zip は Release Asset として添付（Chrome Web Store 手動アップロード用）
- 各コンポーネントの `package.json` / `manifest.json` / `app.json` のバージョンはタグと一致させる

### リリース手順（例: 拡張機能のみ更新する場合）

1. `extension/manifest.json` と `extension/package.json` のバージョンを `1.0.1` に更新
2. コミット & main にマージ
3. `git tag ext/v1.0.1 && git push origin ext/v1.0.1`
4. GitHub Actions が拡張機能のテスト → ビルド → Release 作成のみ実行
5. Chrome Web Store へ手動アップロード

### 理由

1. **最小デプロイ原則**: 変更のあったコンポーネントだけビルド・デプロイし、副作用を最小化
2. **明確なリリース履歴**: タグとReleaseがコンポーネント単位で分離され、変更追跡が容易
3. **CI コスト削減**: パスフィルタリングにより不要なテスト実行も削減
4. **独立したリリースサイクル**: 各コンポーネントが異なるペースでバージョンアップ可能

## 影響

- `.github/workflows/deploy.yml` を分割またはタグパターン分岐に書き換え
- `.github/workflows/ci.yml` にパスフィルタを追加
- 旧 `v*` タグ方式は今後使用しない（既存タグは履歴として保持）
- ADR-009 の単一タグ方式を本 ADR で上書き
