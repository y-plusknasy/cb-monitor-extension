import { onRequest } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./lib/firestore.js";
import { usageLogSchema } from "./lib/validation.js";
import {
  COLLECTION_USAGE_LOGS,
  PARENT_ID_UNLINKED,
  USAGE_LOGS_TTL_DAYS,
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
 * S01 では deviceId 検証（ペアリング済みかどうか）は行わず、
 * すべてのリクエストを受け付け parentId = "unlinked" として保存する。
 */
export const usageLogs = onRequest({ cors: true }, async (req, res) => {
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

  // Firestore に upsert
  const db = getDb();
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
        parentId: PARENT_ID_UNLINKED,
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
});
