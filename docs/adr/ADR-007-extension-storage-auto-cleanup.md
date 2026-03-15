# ADR-007: Extension ローカルストレージの自動クリーンアップ設計

## ステータス

承認済み (Accepted)

## 背景

Chrome Extension は `chrome.storage.local` に以下のデータを保持している:

- **`dailyUsage`**: 日付別のアプリ利用時間バッファ（`{ "2026-03-15": { "chrome": { totalSeconds, lastUpdated } } }`）
- **`sentDates`**: API への送信が完了した日付のリスト（`["2026-03-13", "2026-03-14"]`）

### 現行のクリーンアップ

`pruneOldDates()` が Service Worker の `initialize()` 内で呼ばれ、古い日付を削除している:

- ペアリング済み: `BUFFER_RETENTION_DAYS` = 4日
- 未ペアリング: `UNLINKED_BUFFER_RETENTION_DAYS` = 14日

### 問題点

1. **保持期間の整合性**: Firebase 側の dailyLogs TTL は 84日だが、Extension 側のバッファ保持は最大14日。Extension のローカルストレージは API 送信用のバッファであり、送信完了後のデータは Firebase に保存されている。用途が異なるため、保持期間が異なること自体は正しい設計。ただし、レビュー指摘では Firebase TTL (84日) への統一が言及されている。

2. **クリーンアップのタイミング**: `initialize()` は Service Worker 起動時のみ実行される。Manifest V3 の Service Worker は Chrome によって非アクティブ時（約30秒〜5分）に停止されるため、再起動時にクリーンアップが走る。日常的な利用パターンでは十分な頻度で `initialize()` が呼ばれるが、保証はない。

## 選択肢

### 案A: フラッシュ時にクリーンアップ（推奨）

1分間隔のアラーム `flushOnAlarm()` 内でクリーンアップを実行する。ただし毎回はコスト過多のため、その日の最初のフラッシュ時のみ実行する。

**実装:**

- `chrome.storage.local` に `lastCleanupDate` フラグを追加
- `flushOnAlarm()` の先頭で `lastCleanupDate !== 今日` なら `pruneOldDates()` を実行し、フラグを更新

**メリット:**

- 1分間隔のアラームで確実にトリガーされる
- 1日1回のみ実行するため、パフォーマンス影響なし
- 既存の `initialize()` のクリーンアップと共存可能

**デメリット:**

- `flushOnAlarm()` のコードが若干増える
- `lastCleanupDate` キーの追加が必要

### 案B: initialize() のまま維持

現行の `initialize()` でのクリーンアップのみ。Service Worker 再起動は日常的に発生するため、実用上は十分。

**メリット:**

- 追加実装不要

**デメリット:**

- Service Worker が長時間再起動されないケースでクリーンアップが遅延する可能性
- 長期間ブラウザを開いたままにする使用パターンでは日をまたいでもクリーンアップが走らない可能性

### 案C: 専用アラームで毎日1回実行

`chrome.alarms.create("cleanup", { periodInMinutes: 1440 })` で24時間ごとにクリーンアップ用のアラームを別途設定する。

**メリット:**

- 確実に1日1回のクリーンアップが保証される

**デメリット:**

- 既存のフラッシュアラームとは別のアラーム管理が必要
- Service Worker のアラーム数が増加
- 案Aで十分な場合は不必要な複雑性

## 決定

**案A を採用する。**

### 理由

1. **確実性**: 1分間隔の既存アラーム（`flushOnAlarm`）に組み込むことで、ブラウザが起動していればその日の最初のフラッシュ時にクリーンアップが確実に実行される。
2. **効率性**: `lastCleanupDate` フラグで1日1回に制限するため、毎分の `pruneOldDates()` 実行によるパフォーマンスオーバーヘッドは発生しない。
3. **シンプルさ**: 既存の `flushOnAlarm()` 内に数行追加するだけで実現可能。新たなアラーム管理は不要。

### 保持期間について

Extension ローカルストレージの保持期間は Firebase TTL (84日) に合わせる**必要はない**と判断する。理由:

- Extension のバッファは API 送信完了前の一時データ。送信後は Firebase に保存されている。
- ペアリング済みデバイスは毎分送信を試みるため、4日の保持で十分（ネットワーク障害への備え）。
- 未ペアリングデバイスは14日保持することで、ペアリング前のデータを損失なく送信できる。
- 84日分のデータをローカルに保持するのは `chrome.storage.local` の容量制限（5MB）の観点からも不適切。

ただし、レビュー指摘で Firebase TTL に合わせるべきという方針であれば、保持期間の定数値を変更する対応も可能。この場合、容量制約を考慮して上限を設ける必要がある。

### 実装詳細

#### 変更対象ファイル

| ファイル                                 | 変更内容                                      |
| ---------------------------------------- | --------------------------------------------- |
| `extension/utils/constants.js`           | `STORAGE_KEY_LAST_CLEANUP_DATE` 定数を追加    |
| `extension/background/service-worker.js` | `flushOnAlarm()` にクリーンアップロジック追加 |

#### コード変更イメージ

```javascript
// constants.js
export const STORAGE_KEY_LAST_CLEANUP_DATE = "lastCleanupDate";

// service-worker.js — flushOnAlarm() 内
async function flushOnAlarm() {
  // 1日1回のクリーンアップ
  const today = getToday();
  const lastCleanupDate = await getStorage(STORAGE_KEY_LAST_CLEANUP_DATE);
  if (lastCleanupDate !== today) {
    const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
    const retentionDays = pairingStatus
      ? BUFFER_RETENTION_DAYS
      : UNLINKED_BUFFER_RETENTION_DAYS;
    const dailyUsage = (await getStorage(STORAGE_KEY_DAILY_USAGE)) || {};
    const pruned = pruneOldDates(dailyUsage, retentionDays);
    await setStorage(STORAGE_KEY_DAILY_USAGE, pruned);

    // sentDates のクリーンアップ
    const sentDates = (await getStorage(STORAGE_KEY_SENT_DATES)) || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays + 1);
    const cleanedSentDates = sentDates.filter((d) => d >= getToday(cutoff));
    await setStorage(STORAGE_KEY_SENT_DATES, cleanedSentDates);

    await setStorage(STORAGE_KEY_LAST_CLEANUP_DATE, today);
  }

  // 既存のフラッシュ処理
  const wasTracking = state.currentAppName;
  if (wasTracking) {
    await stopTracking();
  }
  await flushUsageData();
  if (wasTracking) {
    await startTracking(wasTracking);
  }
}
```

## 参照

- ADR-001: `docs/adr/ADR-001-daily-usage-buffer-design.md`
- `extension/utils/constants.js` — 保持期間の定数定義
- `extension/background/service-worker.js` — `initialize()`, `flushOnAlarm()`
