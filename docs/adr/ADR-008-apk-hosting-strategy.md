# ADR-008: APK ファイルのホスティング戦略

## ステータス

**承認済み**

## コンテキスト

CB Link モバイルアプリ（React Native / Expo）の APK ファイルを保護者に配布する必要がある。Chrome 拡張機能の Popup および Options ページから、APK ダウンロードリンク（URL + QR コード）を提供する設計のため、安定した公開 URL が必要。

### 要件

1. APK ファイルへの安定した公開 URL が必要
2. CI/CD から自動的に APK ファイルを差し替え可能
3. QR コード生成に使用する URL が固定であること（APK 更新時に QR コードが変わらない）
4. 追加コストが発生しないこと（個人プロジェクト規模）

### 検討した選択肢

#### A. GitHub Releases

- GitHub リポジトリの Releases 機能で APK をアセットとして添付
- URL: `https://github.com/{owner}/{repo}/releases/latest/download/cb-link.apk`
- CI/CD: `gh release create` / `gh release upload` で自動化可能
- **メリット**: Git リポジトリと一体管理、バージョン管理が容易、ダウンロード統計あり、`latest` URL で常に最新を指せる
- **デメリット**: リポジトリが public である必要がある（private の場合は認証が必要）

#### B. Firebase Hosting

- Firebase Hosting の静的ファイルとして APK を配置
- URL: `https://{project}.web.app/downloads/cb-link.apk`
- CI/CD: `firebase deploy --only hosting` で自動化
- **メリット**: 既存の Firebase プロジェクト内で完結、CDN 配信
- **デメリット**: Firebase Hosting の無料枠（10GB/月）に APK ダウンロードが含まれる、GitHub Pages と併用する場合に管理が分散

#### C. GitHub Pages

- GitHub Pages のリポジトリ内に APK を配置
- URL: `https://{owner}.github.io/{repo}/downloads/cb-link.apk`
- CI/CD: GitHub Actions から Pages デプロイで自動化
- **メリット**: ドキュメントサイトと同一基盤で管理、追加コスト不要
- **デメリット**: リポジトリサイズ増大（APK は通常 30-80MB）、Git 履歴が肥大化する、GitHub Pages のサイズ制限（1GB）

## 決定

**選択肢 A: GitHub Releases を採用する。**

### 理由

1. **URL の安定性**: `https://github.com/{owner}/{repo}/releases/latest/download/cb-link.apk` で常に最新版を指せる。QR コード用 URL が固定。
2. **CI/CD 連携の容易さ**: GitHub Actions から `gh release` コマンドで直接操作可能。APK ビルド → リリースアップロードのパイプラインが自然。
3. **リポジトリサイズへの影響なし**: Release Assets は Git リポジトリのサイズには含まれない。
4. **バージョン管理**: リリースタグと APK が紐付き、過去バージョンの APK も保持される。
5. **ダウンロード統計**: GitHub が自動的にダウンロード数を追跡。

### ダウンロード URL

```
https://github.com/{owner}/{repo}/releases/latest/download/cb-link.apk
```

> **Note**: リポジトリが private の場合、このURLは認証なしではアクセスできない。  
> その場合は GitHub Pages のドキュメントサイトにリダイレクトページを設け、  
> 認証付きダウンロードリンクを提供するか、リポジトリを public にする。

### QR コード

- ダウンロード URL を QR コードに変換し、拡張機能の Popup / Options ページに埋め込む
- QR コードは静的画像として生成し、拡張機能パッケージに含める
- URL が固定のため、APK 更新時に QR コード画像の再生成は不要

## 影響

- CI/CD パイプラインに APK ビルド + Release アップロードステップを追加
- 拡張機能の Popup / Options ページに QR コードセクションを追加
- GitHub Pages ドキュメントサイトにも APK ダウンロードリンクを掲載
