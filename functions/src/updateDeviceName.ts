/**
 * updateDeviceName — デバイス名を Firestore 上で更新する Cloud Function
 *
 * 拡張機能の設定画面からデバイス名を変更した際に呼ばれ、
 * devices コレクションと、紐付く各保護者の childDevices 配列を更新する。
 */
import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "./lib/firestore.js";
import { updateDeviceNameSchema } from "./lib/validation.js";
import { COLLECTION_DEVICES, COLLECTION_USERS } from "./lib/constants.js";

export const updateDeviceName = onRequest(
  { cors: true, region: "asia-northeast1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    // バリデーション
    const result = updateDeviceNameSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "validation_error",
        details: result.error.issues,
      });
      return;
    }

    const { deviceId, deviceName } = result.data;
    const db = getDb();

    // デバイスの存在確認
    const deviceRef = db.collection(COLLECTION_DEVICES).doc(deviceId);
    const deviceDoc = await deviceRef.get();

    if (!deviceDoc.exists) {
      res.status(404).json({ error: "device_not_found" });
      return;
    }

    const deviceData = deviceDoc.data()!;
    const parentIds = (deviceData.parentIds as string[]) || [];

    // devices コレクションの deviceName を更新
    await deviceRef.update({ deviceName });

    // 各保護者の childDevices 配列内のデバイス名も更新
    for (const parentId of parentIds) {
      try {
        const userRef = db.collection(COLLECTION_USERS).doc(parentId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) continue;

        const userData = userDoc.data()!;
        const childDevices =
          (userData.childDevices as Array<{
            deviceId: string;
            deviceName: string;
            registeredAt: string;
          }>) || [];

        const updated = childDevices.map((d) =>
          d.deviceId === deviceId ? { ...d, deviceName } : d,
        );
        await userRef.update({ childDevices: updated });
      } catch (err) {
        console.warn(
          `[updateDeviceName] parentId=${parentId} の childDevices 更新失敗:`,
          err,
        );
      }
    }

    res.status(200).json({ success: true });
  },
);
