# S07 詳細設計: APK ビルド・配布 + Chrome Store 公開準備

## 1. 概要

本スプリントでは、CB Link の全コンポーネントをエンドユーザーに配布可能な状態にする。

### スコープ

| #   | タスク                             | 成果物                                                |
| --- | ---------------------------------- | ----------------------------------------------------- |
| 1   | GitHub Pages ドキュメントサイト    | プロジェクト紹介 + プライバシーポリシーページ         |
| 2   | プライバシーポリシー               | Chrome Web Store 申請に必要な公開ページ               |
| 3   | APK ダウンロードリンク + QR コード | 拡張機能 Popup / Options に QR コード表示             |
| 4   | Extension ビルドスクリプト         | DEV ONLY セクション除去 + zip 生成                    |
| 5   | CI/CD パイプライン拡張             | Functions 自動デプロイ + APK Release + Pages デプロイ |

### 参照 ADR

- [ADR-008: APK ホスティング戦略](../adr/ADR-008-apk-hosting-strategy.md)
- [ADR-009: CI/CD デプロイ戦略](../adr/ADR-009-cicd-deploy-strategy.md)

---

## 2. GitHub Pages ドキュメントサイト

### 2.1 構成

```
docs-site/
├── index.html              # LP（プロジェクト紹介 + ダウンロードリンク）
├── privacy-policy.html     # プライバシーポリシー
└── assets/
    └── style.css           # 共通スタイル
```

GitHub Pages は `docs-site/` ディレクトリをソースに設定する（GitHub Actions でデプロイ）。

### 2.2 ランディングページ (`index.html`)

- CB Link の概要紹介
- 主要機能の箇条書き
- APK ダウンロードリンク（GitHub Releases `latest` URL）
- Chrome Web Store リンク（公開後に追加）
- プライバシーポリシーへのリンク

### 2.3 プライバシーポリシー (`privacy-policy.html`)

Chrome Web Store 申請に必要。以下の内容を記載:

- **収集するデータ**: デバイスID（UUID）、アプリ名（ドメイン名）、利用時間（秒数）
- **収集しないデータ**: メールアドレス、閲覧URL全体、ページタイトル、個人を特定する情報
- **データの使用目的**: 保護者による子供のデバイス利用状況の把握
- **データの保存期間**: usageLogs 30日、dailyLogs 84日で自動削除
- **第三者提供**: 行わない
- **Firebase の利用**: Google Firebase を使用したデータ保存・処理を明示

---

## 3. 拡張機能 UI 変更

### 3.1 Popup への QR コード追加

フッターの上に「保護者アプリ」セクションを追加:

```html
<!-- 保護者アプリ -->
<div class="app-download-section">
  <div class="download-label">保護者アプリ</div>
  <div class="download-content">
    <img
      src="icons/qr-apk.png"
      alt="APK ダウンロード QR"
      width="64"
      height="64"
    />
    <a href="{DOWNLOAD_URL}" target="_blank" class="download-link"
      >ダウンロード</a
    >
  </div>
</div>
```

### 3.2 Options への QR コード追加

ペアリングセクションの下に「保護者アプリ」セクションを追加:

```html
<div class="section">
  <div class="section-title">
    <span class="section-icon">📱</span>
    保護者アプリ
  </div>
  <div class="download-card">
    <img
      src="icons/qr-apk.png"
      alt="APK ダウンロード QR"
      width="120"
      height="120"
    />
    <p>保護者用アプリをダウンロードしてください</p>
    <a href="{DOWNLOAD_URL}" target="_blank" class="download-url"
      >{DOWNLOAD_URL}</a
    >
  </div>
</div>
```

### 3.3 QR コード画像

- `extension/icons/qr-apk.png` として配置
- GitHub Releases の `latest` ダウンロード URL を QR コード化
- ビルドスクリプトで `qrcode` npm パッケージを使用して生成

---

## 4. Extension ビルドスクリプト

### 4.1 目的

Chrome Web Store にアップロードする zip ファイルを生成する。DEV ONLY セクション（API エンドポイント設定）を除去する。

### 4.2 処理フロー

```
extension/
  ├── scripts/
  │   └── build.js          # ビルドスクリプト
```

1. `dist/` ディレクトリを作成
2. Extension ファイルを `dist/` にコピー
3. `options.html` から `DEV ONLY` セクション（HTML コメントで囲まれた範囲）を除去
4. `options.js` から `DEV ONLY` セクション（コメントで囲まれた範囲）を除去
5. `manifest.json` の `host_permissions` から `http://localhost/*` を除去
6. `dist/` を zip 圧縮 → `cb-link-extension-v{version}.zip`

### 4.3 DEV ONLY マーカー

既存のコード内に配置済み:

**options.html:**

```html
<!-- ========== DEV ONLY: 開発環境エミュレーター接続用 START ========== -->
...
<!-- ========== DEV ONLY: 開発環境エミュレーター接続用 END ========== -->
```

**options.js:**

```javascript
// ===== DEV ONLY: 開発環境エミュレーター接続用 START =====
...
// ===== DEV ONLY: 開発環境エミュレーター接続用 END =====
```

ビルドスクリプトは正規表現でこれらのマーカー間のコンテンツを除去する。

---

## 5. CI/CD パイプライン

### 5.1 既存 CI (`ci.yml`) への追加

- `mobile-ci` ジョブ追加（TypeScript 型チェック + Jest テスト）

### 5.2 デプロイワークフロー (`deploy.yml`)

`v*` タグプッシュ時に実行:

1. **deploy-functions**: `firebase deploy --only functions`
2. **build-extension**: DEV ONLY 除去 + zip 生成 → Release Asset
3. **deploy-pages**: `docs-site/` を GitHub Pages にデプロイ

> **Note**: APK ビルド（EAS Build）は初期段階ではローカルまたは手動トリガーとし、  
> CI の安定性が確認でき次第、自動化を拡張する。

---

## 6. テスト戦略

| 対象             | テスト方法                                    |
| ---------------- | --------------------------------------------- |
| ビルドスクリプト | DEV ONLY 除去の正確性を検証するユニットテスト |
| zip 生成         | 生成された zip の内容物を検証                 |
| GitHub Pages     | ローカルサーブで表示確認                      |
| CI/CD            | ドライランで動作確認                          |
