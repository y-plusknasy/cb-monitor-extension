# S04: 本番運用準備 — 詳細設計書

## 1. 概要

フェーズ 3 (本番運用準備) として、Firestore セキュリティルール・Firestore インデックス・dailyLogs 日次バッチ集計・GitHub Actions CI/CD を実装し、本番環境で安全に運用できる状態にする。

## 2. 機能要件・受け入れ基準

### 2.1 Firestore Security Rules

**要件**: 各コレクションへのアクセスを最小権限で制御する。

| コレクション   | Read                                         | Write                                           |
| -------------- | -------------------------------------------- | ----------------------------------------------- |
| `users/{uid}`  | `request.auth.uid == uid`                    | `request.auth.uid == uid`（フィールド制限あり） |
| `usageLogs`    | `request.auth.uid == resource.data.parentId` | Admin SDK のみ                                  |
| `dailyLogs`    | `request.auth.uid == resource.data.parentId` | Admin SDK のみ                                  |
| `devices`      | `request.auth.uid == resource.data.parentId` | Admin SDK のみ                                  |
| `oneTimeCodes` | 拒否                                         | 拒否                                            |
| `appRegistry`  | 認証済みユーザー全員                         | Admin SDK のみ                                  |

**受け入れ基準**:

- 未認証ユーザーはすべてのコレクションへのアクセスが拒否される
- 認証済みユーザーは自分の `parentId` に紐づくドキュメントのみ読み取れる
- クライアントからの直接書き込みは `users` の一部フィールドを除き禁止

### 2.2 Firestore Composite Indexes

**要件**: モバイルアプリの Firestore クエリが正常に動作するための複合インデックスを定義。

| コレクション | フィールド                 | 用途                          |
| ------------ | -------------------------- | ----------------------------- |
| `usageLogs`  | `parentId` ASC, `date` ASC | useUsageLogs, useUsageHistory |
| `devices`    | `parentId` ASC             | useDevices                    |
| `dailyLogs`  | `parentId` ASC, `date` ASC | 将来の履歴グラフ              |

### 2.3 dailyLogs 日次バッチ集計

**要件**: 前日分の `usageLogs` を集計し、`dailyLogs` コレクションに書き込む Scheduled Function。

- **スケジュール**: 毎日 04:00 (UTC)
- **集計ロジック**:
  1. 前日 (JST 基準で `YYYY-MM-DD`) の `usageLogs` を全件取得
  2. `deviceId` × `appName` ごとに `totalSeconds` を合計
  3. 分に変換し `dailyLogs` に upsert
- **ドキュメントID**: `{deviceId}_{appName}_{YYYY-MM-DD}`
- **TTL**: 作成日から 180 日後（`expireAt` フィールド）
- **スキーマ**:
  ```
  {
    parentId: string,
    deviceId: string,
    appName: string,
    date: string,           // YYYY-MM-DD
    totalMinutes: number,   // 切り捨て
    totalSeconds: number,   // 元の秒数（精度保持）
    updatedAt: Timestamp,
    expireAt: Timestamp      // TTL 用
  }
  ```

**受け入れ基準**:

- 前日分の usageLogs の全レコードが dailyLogs に集計される
- 同一キーの dailyLogs が既に存在する場合は上書き (set with merge)
- 集計対象の usageLogs が 0 件でもエラーにならない

### 2.4 GitHub Actions CI/CD

**要件**: プルリクエスト・push 時に自動テスト・lint を実行する。

**ワークフロー構成**:

- **トリガー**: `push` (main), `pull_request` (main)
- **ジョブ**:
  1. `functions-ci`: functions/ のビルド・lint・テスト
  2. `extension-ci`: extension/ の lint・テスト

**受け入れ基準**:

- main ブランチへの push / PR で CI が自動実行される
- ビルドエラー・lint エラー・テスト失敗時にジョブが失敗する

## 3. コンポーネント構成

### 3.1 新規ファイル

| ファイル                              | 内容                              |
| ------------------------------------- | --------------------------------- |
| `firestore.rules`                     | Firestore セキュリティルール      |
| `firestore.indexes.json`              | 複合インデックス定義              |
| `functions/src/aggregateDailyLogs.ts` | dailyLogs 集計 Scheduled Function |
| `.github/workflows/ci.yml`            | GitHub Actions CI ワークフロー    |

### 3.2 変更ファイル

| ファイル                         | 変更内容                                            |
| -------------------------------- | --------------------------------------------------- |
| `firebase.json`                  | `firestore.rules`, `firestore.indexes` 参照追加     |
| `functions/src/index.ts`         | `aggregateDailyLogs` のエクスポート追加             |
| `functions/src/lib/constants.ts` | `COLLECTION_DAILY_LOGS`, `DAILY_LOGS_TTL_DAYS` 追加 |

## 4. テスト戦略

- `functions/src/aggregateDailyLogs.test.ts`: 集計ロジックのユニットテスト
  - 正常系: 複数デバイス・複数アプリの集計
  - 境界値: 集計対象 0 件
  - TTL: expireAt が 180 日後に設定されること
