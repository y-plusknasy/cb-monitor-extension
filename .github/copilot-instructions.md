# Copilot Instructions for cb-monitor-extension

## Project Overview

Web利用時間トラッカー — Chromebook・Windows・Mac等のChromeブラウザおよびPWAの利用時間を詳細に監視・集計するツール。システム構成・技術スタック・プロジェクト構造の詳細は `docs/FunctionalRequirements.md` を参照。

## Coding Conventions

### Language and Encoding
- All files MUST be UTF-8 encoded
- All directory and file names MUST use ASCII alphanumeric characters only
- Code comments and documentation content may use Japanese
- Commit messages: English, following Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`)

### JavaScript / TypeScript
- TypeScript strict mode enabled (backend, mobile)
- Chrome Extension は Manifest V3 の Service Worker ベースで実装
- 関数・コンポーネントには JSDoc / TSDoc コメントを付与
- マジックナンバーを避け、定数化する
- 関数は小さく、単一責任に保つ

### Chrome Extension
- Manifest V3 を使用（Service Worker ベース）
- `chrome.tabs.onActivated` / `chrome.windows.onFocusChanged` でアクティブタブを監視
- 対象ドメインのフィルタリングは設定画面から管理可能にする
- データ送信は 60秒ごとのバッチ送信 + フォーカス喪失・タブクローズ時の割り込み送信
- `deviceId` は UUID で生成し、`chrome.storage.local` に永続保存

### React Native (Expo)
- Functional components only
- Expo Router でナビゲーション管理
- Firestore の `onSnapshot` リスナーでリアルタイム更新

### Naming
- Components: PascalCase (`UsageSummary.tsx`)
- Hooks: camelCase with `use` prefix (`useUsageLogs.ts`)
- API Routes: kebab-case (`/api/usage-logs`)
- Constants: UPPER_SNAKE_CASE (`SEND_INTERVAL_MS`)
- Files: camelCase for utilities, PascalCase for components

### Testing
- Unit tests: Jest or Vitest
- テストファイルはソースと同階層に `*.test.ts` / `*.test.tsx` で配置

## Specifications & ADR

- **仕様は `docs/` 配下のドキュメントで一元管理する**。このインストラクションファイルには仕様の詳細を記載しない。
  - 機能要件: `docs/FunctionalRequirements.md`
  - データスキーマ・API仕様等も `docs/` 配下に配置
- **設計方針に関する議論を行った際は `docs/adr/` に ADR (Architecture Decision Record) を作成する**。
  - ファイル名: `docs/adr/ADR-NNN-short-title.md` (例: `docs/adr/ADR-001-otp-pairing.md`)
  - ADR には背景・選択肢・決定内容・根拠を記録し、設計方針の変遷を追跡可能にする

## Development Workflow

### Design-First Process

**開発着手前の準備（必須）:**

1. **`docs/` 配下の仕様ドキュメントを確認** — 最新の機能要件・データスキーマ・API仕様を把握する
2. **`docs/adr/` の ADR を確認** — これまでの設計方針の変遷を理解した上で開発に臨む

**開発サイクル:**

3. **詳細設計ドキュメントの作成** — 実装前に必ず設計書を作成
   - 機能要件・受け入れ基準
   - データモデル変更（ある場合）
   - APIエンドポイント（該当する場合）
   - コンポーネント構成・主要関数
   - テスト戦略

4. **実装** — 設計承認後に着手

5. **テスト・検証** — ユニットテスト＋手動検証

6. **レビュー・議論の反映** — レビュー中に発生した議論およびその結果は `docs/` 配下のドキュメントに反映する（既存ドキュメントの編集または新規追加）。設計方針に関する決定が行われた場合は ADR を作成する

7. **スプリント終了時のドキュメント最終確認** — スプリント完了時点で、全ての仕様書がそのスプリントでの開発過程と結果を反映した最新の状態になっていることを確認する
