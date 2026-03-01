import { onRequest } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./lib/firestore.js";
import { usageLogSchema } from "./lib/validation.js";
import {
  COLLECTION_USAGE_LOGS,
  COLLECTION_DEVICES,
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
 * S02: deviceId が devices コレクションに登録済みかどうかを検証し、
 * 未登録デバイスからのリクエストは 401 で拒否する。
 * 登録済みデバイスの場合は、devices コレクションから取得した parentId を使用する。
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

  const db = getDb();

  // deviceId の登録検証: devices コレクションから parentId を逆引き
  const deviceDoc = await db.collection(COLLECTION_DEVICES).doc(deviceId).get();
  if (!deviceDoc.exists) {
    res.status(401).json({ error: "unknown_device" });
    return;
  }
  const parentId = deviceDoc.data()!.parentId as string;

  // デバイスの最終通信日時を更新（無操作検知用）
  await db
    .collection(COLLECTION_DEVICES)
    .doc(deviceId)
    .update({ lastSeenAt: Timestamp.now() });

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
        parentId,
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
