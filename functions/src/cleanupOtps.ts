import { onSchedule } from "firebase-functions/v2/scheduler";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./lib/firestore.js";
import { COLLECTION_ONE_TIME_CODES } from "./lib/constants.js";

/**
 * 期限切れ OTP ドキュメントの日次クリーンアップ
 *
 * 毎日 03:00 (UTC) に実行し、expireAt を過ぎた oneTimeCodes ドキュメントを削除する。
 * OTP の有効期限は 5 分だが、ドキュメント TTL は 1 日に設定されており、
 * TTL 経過後にこの関数で物理削除する。
 *
 * Firestore のネイティブ TTL 機能が利用可能な場合はそちらで自動削除されるが、
 * 本関数はバックアップとして、および TTL が未設定の環境（Emulator 等）での
 * クリーンアップを担当する。
 */
export const cleanupExpiredOtps = onSchedule(
  { schedule: "every day 03:00", region: "asia-northeast1" },
  async () => {
    const db = getDb();
    const now = Timestamp.now();

    const expiredDocs = await db
      .collection(COLLECTION_ONE_TIME_CODES)
      .where("expireAt", "<=", now)
      .get();

    if (expiredDocs.empty) {
      console.log("[cleanupExpiredOtps] 削除対象なし");
      return;
    }

    // Firestore のバッチ書き込みは 500 件まで
    const BATCH_SIZE = 500;
    let deleted = 0;

    for (let i = 0; i < expiredDocs.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = expiredDocs.docs.slice(i, i + BATCH_SIZE);
      for (const doc of chunk) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deleted += chunk.length;
    }

    console.log(`[cleanupExpiredOtps] ${deleted} 件の期限切れ OTP を削除`);
  },
);
