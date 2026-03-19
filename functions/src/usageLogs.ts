import { onRequest } from "firebase-functions/v2/https";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getDb } from "./lib/firestore.js";
import { usageLogSchema } from "./lib/validation.js";
import {
  COLLECTION_USAGE_LOGS,
  COLLECTION_DEVICES,
  USAGE_LOGS_TTL_DAYS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  MAX_DATE_AGE_DAYS,
} from "./lib/constants.js";

/**
 * 日次利用サマリー受信エンドポイント
 *
 * Chrome Extension から送信された日次サマリーを受信し、
 * Firestore の usageLogs コレクションに保存する（upsert）。
 *
 * ドキュメントID は "${deviceId}_${date}_${appName}" で一意に管理し、
 * 同一キーのリクエストは totalSeconds を上書きする。
 *
 * S02: deviceId が devices コレクションに登録済みかどうかを検証し、
 * 未登録デバイスからのリクエストは 401 で拒否する。
 * 登録済みデバイスの場合は、devices コレクションから取得した parentIds を使用する。
 *
 * S04: レート制限（デバイス単位・分間ウィンドウ）と日付バリデーションを追加。
 */
export const usageLogs = onRequest(
  { cors: true, region: "asia-northeast1" },
  async (req, res) => {
    // POST のみ許可
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    // リクエストボディのバリデーション
    const result = usageLogSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "validation_error",
        details: result.error.issues,
      });
      return;
    }

    const { deviceId, date, appName, totalSeconds, lastUpdated } = result.data;

    const db = getDb();

    // deviceId の登録検証: devices コレクションから parentIds を逆引き
    const deviceDoc = await db
      .collection(COLLECTION_DEVICES)
      .doc(deviceId)
      .get();
    if (!deviceDoc.exists) {
      res.status(401).json({ error: "unknown_device" });
      return;
    }
    const parentIds = deviceDoc.data()!.parentIds as string[];

    // レート制限: デバイス単位の分間ウィンドウ
    const deviceData = deviceDoc.data()!;
    const now = Date.now();
    const windowStart = deviceData.rateLimitWindowStart as
      | Timestamp
      | undefined;
    const requestCount = (deviceData.rateLimitRequestCount as number) ?? 0;

    if (
      windowStart &&
      now - windowStart.toDate().getTime() < RATE_LIMIT_WINDOW_MS
    ) {
      // ウィンドウ内: カウントチェック
      if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
        res.status(429).json({ error: "rate_limit_exceeded" });
        return;
      }
    }

    // 日付バリデーション: 未来日や過去 MAX_DATE_AGE_DAYS 日以前を拒否
    const dateError = validateDate(date);
    if (dateError) {
      res.status(400).json({ error: dateError });
      return;
    }

    // デバイスの最終通信日時 + レート制限カウンターを更新
    const isNewWindow =
      !windowStart ||
      now - windowStart.toDate().getTime() >= RATE_LIMIT_WINDOW_MS;

    const deviceUpdate: Record<string, unknown> = {
      lastSeenAt: Timestamp.now(),
    };
    if (isNewWindow) {
      deviceUpdate.rateLimitWindowStart = Timestamp.now();
      deviceUpdate.rateLimitRequestCount = 1;
    } else {
      deviceUpdate.rateLimitRequestCount = FieldValue.increment(1);
    }

    await db.collection(COLLECTION_DEVICES).doc(deviceId).update(deviceUpdate);

    // Firestore に upsert
    const docId = `${deviceId}_${date}_${appName}`;
    const expireAt = Timestamp.fromDate(
      new Date(
        new Date(date).getTime() + USAGE_LOGS_TTL_DAYS * 24 * 60 * 60 * 1000,
      ),
    );

    await db
      .collection(COLLECTION_USAGE_LOGS)
      .doc(docId)
      .set(
        {
          parentIds,
          deviceId,
          date,
          appName,
          totalSeconds,
          lastUpdated: Timestamp.fromDate(new Date(lastUpdated)),
          expireAt,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

    res.status(200).json({ status: "ok" });
  },
);

// ---------------------------------------------------------------------------
// ヘルパー関数（テスト用にエクスポート）
// ---------------------------------------------------------------------------

/**
 * 日付文字列 (YYYY-MM-DD) が受け付け可能な範囲内かを検証する。
 *
 * - 未来日: UTC+14（最も進んだタイムゾーン）の「今日」を超える日付は拒否。
 *   クライアントがローカル日付（例: JST = UTC+9）を送信するため、
 *   UTC 基準では「明日」に見える日付も許容する必要がある。
 * - 過去日: MAX_DATE_AGE_DAYS 日より前は拒否
 *
 * @returns エラーメッセージ。問題なければ null
 */
export function validateDate(date: string): string | null {
  const target = new Date(date + "T00:00:00Z");
  if (isNaN(target.getTime())) {
    return "invalid_date";
  }

  const now = Date.now();

  // 最も進んだタイムゾーン（UTC+14）での「今日の終わり」を未来日カットオフとする
  const MAX_TZ_OFFSET_MS = 14 * 60 * 60 * 1000;
  const farthestNow = new Date(now + MAX_TZ_OFFSET_MS);
  farthestNow.setUTCHours(0, 0, 0, 0);
  const futureLimit = new Date(farthestNow);
  futureLimit.setUTCDate(futureLimit.getUTCDate() + 1);

  if (target >= futureLimit) {
    return "future_date_not_allowed";
  }

  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const oldest = new Date(today);
  oldest.setUTCDate(oldest.getUTCDate() - MAX_DATE_AGE_DAYS);

  if (target < oldest) {
    return "date_too_old";
  }

  return null;
}
