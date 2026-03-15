# S04: 本番運用準備 — 詳細設計書

## 1. 概要

フェーズ 3 (本番運用準備) として、Firestore セキュリティルール・Firestore インデックス・dailyLogs 日次バッチ集計・GitHub Actions CI/CD を実装し、本番環境で安全に運用できる状態にする。

## 2. 機能要件・受け入れ基準

### 2.1 Firestore Security Rules

**要件**: 各コレクションへのアクセスを最小権限で制御する。

| コレクション   | Read                                          | Write                                           |
| -------------- | --------------------------------------------- | ----------------------------------------------- |
| `users/{uid}`  | `request.auth.uid == uid`                     | `request.auth.uid == uid`（フィールド制限あり） |
| `usageLogs`    | `request.auth.uid in resource.data.parentIds` | Admin SDK のみ                                  |
| `dailyLogs`    | `request.auth.uid in resource.data.parentIds` | Admin SDK のみ                                  |
| `devices`      | `request.auth.uid in resource.data.parentIds` | Admin SDK のみ                                  |
| `oneTimeCodes` | 拒否                                          | 拒否                                            |
| `appRegistry`  | 認証済みユーザー全員                          | Admin SDK のみ                                  |

**受け入れ基準**:

- 未認証ユーザーはすべてのコレクションへのアクセスが拒否される
- 認証済みユーザーは自分の UID が `parentIds` に含まれるドキュメントのみ読み取れる
- クライアントからの直接書き込みは `users` の一部フィールドを除き禁止

#### Extension → Cloud Functions API セキュリティ

Write 側は Admin SDK（Cloud Functions）のみとしているが、そのAPIエンドポイントを叩くのは Chrome Extension（子供デバイスのブラウザに配信される）であるため、Extension に API 認証情報（秘密鍵等）を埋め込むことは**絶対に行わない**。

現行の実装では以下の方式でセキュリティを確保している:

| エンドポイント   | 認証方式                   | 概要                                                                                                                                                                                                                                         |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `usageLogs`      | `deviceId` による登録検証  | Extension は OTP ペアリング完了後に取得した `deviceId` のみを送信。Cloud Functions 側で `devices` コレクションの登録有無を検証し、未登録の `deviceId` は **401 で拒否**する。`deviceId` はクライアント生成の UUID であり、秘密情報ではない。 |
| `registerDevice` | OTP (ワンタイムパスコード) | 保護者がモバイルアプリで発行した 6 桁 OTP を Extension 設定画面で入力。OTP は 5 分間有効・1 回限り使用可能。Cloud Functions がトランザクションで検証する。                                                                                   |
| `generateOtp`    | Firebase Auth ID Token     | モバイルアプリからのみ呼び出し。`Authorization: Bearer <idToken>` ヘッダーを Admin SDK で検証する。Extension からは呼び出さない。                                                                                                            |

**設計方針**: Extension には一切の認証情報（API キー、サービスアカウント鍵、Firebase 秘密情報等）を含めない。Extension が送信するのは `deviceId`（UUID）とアプリ利用データのみであり、`deviceId` が `devices` コレクションに登録されていなければ API はリクエストを拒否する。

#### Cloud Functions API セキュリティガード

`deviceId` は Extension ユーザーが DevTools 等から取得可能であるため、悪意あるユーザーが自身の `deviceId` を利用して API に DoS 攻撃を仕掛けるリスクがある。このリスクに対し、Cloud Functions 側で以下のガードを設ける。

**レート制限（デバイス単位・分間ウィンドウ）** — ADR-005 参照

- `devices` ドキュメントに `rateLimitWindowStart` / `rateLimitRequestCount` を保持
- 60 秒ウィンドウ内に 30 リクエストを超えた場合、**429 Too Many Requests** で拒否
- 正常な Extension の送信パターン（60 秒ごとに 3〜5 アプリ分のバースト送信）は十分に許容
- ウィンドウ期限切れ時にカウンターをリセット

**日付バリデーション**

- `date` フィールドが未来日（翌日以降）の場合は **400** で拒否
- `date` フィールドが 31 日以上前の場合は **400** で拒否
- 不正な過去・未来データの書き込みを防止

### 2.2 Firestore Composite Indexes

**要件**: モバイルアプリの Firestore クエリが正常に動作するための複合インデックスを定義。

| コレクション | フィールド                     | 用途                          |
| ------------ | ------------------------------ | ----------------------------- |
| `usageLogs`  | `parentIds` Arrays, `date` ASC | useUsageLogs, useUsageHistory |
| `devices`    | `parentIds` Arrays             | useDevices                    |
| `dailyLogs`  | `parentIds` Arrays, `date` ASC | 将来の履歴グラフ              |

### 2.3 dailyLogs 日次バッチ集計

**要件**: 前日分の `usageLogs` を集計し、`dailyLogs` コレクションに書き込む Scheduled Function。

- **スケジュール**: 毎日 15:00 (UTC) = JST 0:00
- **集計ロジック**:
  1. 前日 (JST 基準で `YYYY-MM-DD`) の `usageLogs` を全件取得
  2. `deviceId` × `appName` ごとに `totalSeconds` を合計
  3. 分に変換し `dailyLogs` に upsert
- **ドキュメントID**: `{deviceId}_{appName}_{YYYY-MM-DD}`
- **TTL**: 作成日から 84 日後（`expireAt` フィールド）— アプリ側の履歴表示が 28 日の約3倍
- **スキーマ**:
  ```
  {
    parentIds: string[],
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

#### dailyLogs の利用箇所

モバイルアプリ側での利用方針:

| ユースケース               | データソース                                     | 理由                                                           |
| -------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| 当日のリアルタイム利用時間 | `usageLogs` (`useUsageLogs` フック)              | Extension からのデータを即座に反映する必要がある               |
| 履歴チャート（前日以前）   | `dailyLogs` (`useUsageHistory` フック)           | 集計済みデータを使うことでドキュメント数が削減され通信量を抑制 |
| バータップ時の内訳         | `dailyLogs` (`UsageHistoryChart` コンポーネント) | 同上                                                           |

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

| ファイル                         | 変更内容                                                           |
| -------------------------------- | ------------------------------------------------------------------ |
| `firebase.json`                  | `firestore.rules`, `firestore.indexes` 参照追加                    |
| `functions/src/index.ts`         | `aggregateDailyLogs` のエクスポート追加                            |
| `functions/src/lib/constants.ts` | `COLLECTION_DAILY_LOGS`, `DAILY_LOGS_TTL_DAYS`, レート制限定数追加 |
| `functions/src/usageLogs.ts`     | レート制限・日付バリデーション追加                                 |

## 4. テスト戦略

- `functions/src/aggregateDailyLogs.test.ts`: 集計ロジックのユニットテスト
  - 正常系: 複数デバイス・複数アプリの集計
  - 境界値: 集計対象 0 件
  - TTL: expireAt が 84 日後に設定されること
