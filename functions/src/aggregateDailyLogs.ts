import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./lib/firestore.js";
import {
  COLLECTION_USAGE_LOGS,
  COLLECTION_DAILY_LOGS,
  DAILY_LOGS_TTL_DAYS,
} from "./lib/constants.js";

/**
 * dailyLogs 日次バッチ集計
 *
 * 毎日 15:00 (UTC) = JST 0:00 に前日分の usageLogs を集計し、
 * dailyLogs コレクションに deviceId × appName 単位でサマリーを書き込む。
 *
 * ドキュメントID: `{deviceId}_{appName}_{date}`
 * TTL: 作成日から 84 日後（expireAt フィールド）
 */
export const aggregateDailyLogs = onSchedule(
  { schedule: "every day 15:00", region: "asia-northeast1" },
  async () => {
    const db = getDb();
    const yesterday = getYesterdayDateString();

    console.log(`[aggregateDailyLogs] 集計開始: date=${yesterday}`);

    // 前日分の usageLogs を全件取得
    const snapshot = await db
      .collection(COLLECTION_USAGE_LOGS)
      .where("date", "==", yesterday)
      .get();

    if (snapshot.empty) {
      console.log("[aggregateDailyLogs] 集計対象なし");
      return;
    }

    // deviceId × appName ごとに集計
    const aggregated = aggregateUsageLogs(snapshot.docs);

    // dailyLogs に書き込み（バッチ）
    const BATCH_SIZE = 500;
    const entries = Array.from(aggregated.values());
    let written = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = entries.slice(i, i + BATCH_SIZE);

      for (const entry of chunk) {
        const docId = `${entry.deviceId}_${entry.appName}_${yesterday}`;
        const expireAt = Timestamp.fromDate(
          new Date(Date.now() + DAILY_LOGS_TTL_DAYS * 24 * 60 * 60 * 1000),
        );

        batch.set(
          db.collection(COLLECTION_DAILY_LOGS).doc(docId),
          {
            parentIds: entry.parentIds,
            deviceId: entry.deviceId,
            appName: entry.appName,
            date: yesterday,
            totalSeconds: entry.totalSeconds,
            totalMinutes: Math.floor(entry.totalSeconds / 60),
            updatedAt: Timestamp.now(),
            expireAt,
          },
          { merge: true },
        );
      }

      await batch.commit();
      written += chunk.length;
    }

    console.log(
      `[aggregateDailyLogs] ${written} 件の dailyLogs を書き込み (date=${yesterday})`,
    );
  },
);

// ---------------------------------------------------------------------------
// ヘルパー関数（テスト用にエクスポート）
// ---------------------------------------------------------------------------

/** 集計エントリの型 */
export interface AggregatedEntry {
  parentIds: string[];
  deviceId: string;
  appName: string;
  totalSeconds: number;
}

/**
 * usageLogs のドキュメント群を deviceId × appName でグループ化・集計する。
 *
 * @param docs - usageLogs のドキュメントスナップショット配列
 * @returns Map<集計キー, AggregatedEntry>
 */
export function aggregateUsageLogs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
): Map<string, AggregatedEntry> {
  const map = new Map<string, AggregatedEntry>();

  for (const doc of docs) {
    const data = doc.data();
    const deviceId = data.deviceId as string;
    const appName = data.appName as string;
    const parentIds = data.parentIds as string[];
    const totalSeconds = (data.totalSeconds as number) ?? 0;

    const key = `${deviceId}_${appName}`;
    const existing = map.get(key);

    if (existing) {
      existing.totalSeconds += totalSeconds;
      // parentIds をマージ（重複排除）
      for (const pid of parentIds) {
        if (!existing.parentIds.includes(pid)) {
          existing.parentIds.push(pid);
        }
      }
    } else {
      map.set(key, {
        parentIds: [...parentIds],
        deviceId,
        appName,
        totalSeconds,
      });
    }
  }

  return map;
}

/**
 * JST (UTC+9) 基準で前日の日付文字列 (YYYY-MM-DD) を返す。
 *
 * このバッチは 15:00 UTC (= 00:00 JST) に実行されるため、
 * 「前日」は JST 基準で計算する必要がある。
 * Firebase Functions の実行環境は通常 UTC のため、ローカル時間ではなく
 * 明示的に JST オフセットを加算して計算する。
 */
export function getYesterdayDateString(): string {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  nowJst.setUTCDate(nowJst.getUTCDate() - 1);
  const year = nowJst.getUTCFullYear();
  const month = String(nowJst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(nowJst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
