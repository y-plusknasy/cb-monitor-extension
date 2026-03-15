# ADR-006: デバイスへの複数保護者（parentId）紐付け設計

## ステータス

承認済み (Accepted)

## 背景

現在の `devices/{deviceId}` ドキュメントは `parentId` を単一の文字列フィールドとして保持している。

```
devices/{deviceId}: {
  parentId: string,     // ← 1つの保護者のみ
  deviceName: string,
  registeredAt: string,
  lastSeenAt: Timestamp,
  syncAvailable: boolean | null,
  rateLimitWindowStart: Timestamp,
  rateLimitRequestCount: number
}
```

S05 の要件として、1つのデバイス（deviceId）に対して複数の保護者（parentId）を紐付けられるようにする必要がある。例えば、父親・母親の両方がそれぞれのモバイルアプリから同一デバイスの利用状況を閲覧できるようにするユースケースである。

### 現在の parentId 依存箇所

| ファイル                                  | 使用方法                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `functions/src/usageLogs.ts`              | `deviceDoc.data().parentId` で単一 parentId を取得し、usageLogs ドキュメントに保存 |
| `functions/src/pairing.ts`                | `registerDevice` で `parentId` を devices ドキュメントに設定                       |
| `functions/src/aggregateDailyLogs.ts`     | usageLogs から `parentId` をそのまま dailyLogs に転記                              |
| `mobile/hooks/useDevices.ts`              | `where('parentId', '==', uid)` でデバイス一覧を取得                                |
| `mobile/components/UsageHistoryChart.tsx` | `where('parentId', '==', parentId)` で usageLogs/dailyLogs を取得                  |
| `firestore.rules`                         | `resource.data.parentId == request.auth.uid` でアクセス制御                        |
| `firestore.indexes.json`                  | usageLogs, dailyLogs に `parentId` ASC のインデックス                              |

## 選択肢

### 案A: devices の parentId を配列に変更（parentIds）

`devices` ドキュメントの `parentId` を `parentIds: string[]` に変更する。

**変更内容:**

- `devices/{deviceId}.parentIds`: `string[]`（配列）
- `usageLogs` / `dailyLogs` の `parentId` も `parentIds: string[]` に変更
- Firestore クエリを `where('parentIds', 'array-contains', uid)` に変更
- Firestore ルールを `request.auth.uid in resource.data.parentIds` に変更
- `registerDevice` の2回目以降のペアリングで `FieldValue.arrayUnion` を使用

**メリット:**

- シンプルなスキーマ変更で済む
- Firestore の `array-contains` クエリは効率的（自動インデックスあり）
- devices 1ドキュメントで完結し、マッピングテーブル不要

**デメリット:**

- 既存の usageLogs / dailyLogs データのマイグレーションが必要
- `parentId`（単一）→ `parentIds`（配列）への全ドキュメント更新が必要
- 破壊的変更になるため、段階的なロールアウトが複雑

### 案B: devices の parentId を配列に変更 + usageLogs/dailyLogs は parentId のまま複数ドキュメント書き込み

`devices` ドキュメントの `parentId` を `parentIds: string[]` に変更し、usageLogs / dailyLogs は各 parentId ごとに個別ドキュメントを作成する。

**変更内容:**

- `devices/{deviceId}.parentIds`: `string[]`（配列）
- usageLogs の書き込み時、parentIds の各要素に対してドキュメントを作成（docId に parentId を含める）
- dailyLogs も同様に各 parentId ごとにドキュメントを作成
- モバイル側のクエリは `where('parentId', '==', uid)` のまま変更不要

**メリット:**

- モバイルアプリ側のクエリ変更が不要（parentId 単一のまま）
- Firestore ルールも既存のまま動作
- 既存のインデックスがそのまま使える
- 既存の usageLogs / dailyLogs データは影響を受けない

**デメリット:**

- ドキュメント数が parentIds の数に比例して増加（書き込みコスト増）
- usageLogs の docId 体系変更が必要（parentId を含める）
- aggregateDailyLogs で重複集計を避けるロジックが複雑化

### 案C: 別の parentDeviceMapping コレクションを新設

`devices` コレクションは変更せず、`parentDeviceMapping/{parentId}_{deviceId}` という新しいコレクションを追加する。

**変更内容:**

- 新規コレクション `parentDeviceMapping` を作成
- `registerDevice` で devices + parentDeviceMapping の両方に書き込み
- モバイル側で `parentDeviceMapping` を参照してデバイス一覧を取得

**メリット:**

- 既存の devices / usageLogs / dailyLogs スキーマに変更不要
- 段階的な移行が可能

**デメリット:**

- 追加のコレクションによる複雑性増加
- usageLogs/dailyLogs のクエリは依然として parentId 単一前提のまま
- 結局 usageLogs/dailyLogs のアクセス制御問題は残る

## 決定

**案A を採用する。**

当初は案B（usageLogs/dailyLogs は parentId 単一のまま複数ドキュメント書き込み）を推奨していたが、レビューにより案Aに変更。

### 案B を不採用とした理由

- **ストレージコストの爆発**: usageLogs/dailyLogs のドキュメント数が `parentIds.length` に比例して増加する。極端なケース（6人の保護者 × 兄弟3人分のデバイス × 84日分）では、1家族だけで膨大なドキュメント数になる
- **書き込みコストの増加**: Extension からの毎分の送信時にも保護者の数だけ Firestore 書き込みが発生する
- **集計ロジックの複雑化**: `aggregateDailyLogs` で同一デバイスの重複カウントを排除するロジックが必要になる
- **新規保護者追加時のバックフィル問題**: 既に大量の usageLogs/dailyLogs が溜まっているデバイスに新しい保護者を追加した場合、既存データのコピーが必要

### 案A を採用する理由

1. **ドキュメント数 = デバイス数で一定**: 保護者が何人紐づいても usageLogs / dailyLogs は各1ドキュメント。ストレージ・書き込みコストが保護者数に依存しない
2. **シンプルな書き込みロジック**: usageLogs.ts は現状通り1ドキュメントを upsert するだけ。`parentIds` 配列をそのまま書き込む
3. **aggregateDailyLogs もシンプル**: usageLogs の `parentIds` をそのまま dailyLogs に転記するだけ。重複排除不要
4. **リリース前のため破壊的変更が許容される**: 既存ユーザーへの影響がないため、マイグレーションコストを気にする必要がない
5. **`array-contains` は Firestore が自動インデックスを生成**: 複合インデックスの変更も機械的な差し替えで済む

### 実装方針

#### devices コレクション

```typescript
// Before
{ parentId: "uid_A", deviceName: "...", ... }

// After
{ parentIds: ["uid_A", "uid_B"], deviceName: "...", ... }
```

#### usageLogs / dailyLogs

```typescript
// Before
{ parentId: "uid_A", deviceId: "...", ... }

// After
{ parentIds: ["uid_A", "uid_B"], deviceId: "...", ... }
```

1ドキュメントに `parentIds` 配列を保持。ドキュメント数は変わらない。

#### Firestore クエリ

```typescript
// Before
where("parentId", "==", uid);

// After
where("parentIds", "array-contains", uid);
```

#### Firestore ルール

```
match /usageLogs/{logId} {
  allow read: if request.auth != null
              && request.auth.uid in resource.data.parentIds;
}
match /dailyLogs/{logId} {
  allow read: if request.auth != null
              && request.auth.uid in resource.data.parentIds;
}
match /devices/{deviceId} {
  allow read: if request.auth != null
              && request.auth.uid in resource.data.parentIds;
}
```

#### Firestore インデックス

`parentId` ASC → 削除（`array-contains` は自動インデックスで対応される。ただし `array-contains` と `date` の複合クエリが必要なため `parentIds Arrays + date ASC` の複合インデックスに差し替え）

#### 影響を受けるファイル一覧

| ファイル                                  | 変更内容                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `functions/src/pairing.ts`                | `registerDevice`: `parentId` → `parentIds` (`FieldValue.arrayUnion`)。再ペアリング時は配列に追加 |
| `functions/src/usageLogs.ts`              | `parentId` → `parentIds` で配列を保存。docId 体系は変更なし                                      |
| `functions/src/aggregateDailyLogs.ts`     | `parentId` → `parentIds` で配列を転記                                                            |
| `mobile/hooks/useDevices.ts`              | `where('parentId', '==', uid)` → `where('parentIds', 'array-contains', uid)`                     |
| `mobile/hooks/useUsageLogs.ts`            | `where('parentId', '==', parentId)` → `where('parentIds', 'array-contains', parentId)`           |
| `mobile/hooks/useUsageHistory.ts`         | `where('parentId', '==', parentId)` → `where('parentIds', 'array-contains', parentId)`           |
| `mobile/components/UsageHistoryChart.tsx` | `where('parentId', '==', parentId)` → `where('parentIds', 'array-contains', parentId)`           |
| `firestore.rules`                         | 全コレクションの `parentId ==` → `in resource.data.parentIds` に変更                             |
| `firestore.indexes.json`                  | `parentId` ASC → `parentIds Arrays` + `date` ASC の複合インデックスに差し替え                    |

## 参照

- S05 詳細設計書: `docs/detail-design/phase4/s05-rebranding-extension-ui.md`
- 機能要件書: `docs/functional-requirements.md`（セクション5: Firestore データ構造案）
