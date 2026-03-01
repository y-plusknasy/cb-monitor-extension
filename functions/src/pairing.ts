import { randomInt } from "crypto";
import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getDb } from "./lib/firestore.js";
import { registerDeviceSchema } from "./lib/validation.js";
import {
  COLLECTION_USERS,
  COLLECTION_ONE_TIME_CODES,
  COLLECTION_DEVICES,
  OTP_EXPIRY_SECONDS,
  OTP_DOCUMENT_TTL_DAYS,
  OTP_MIN,
  OTP_MAX,
  DEFAULT_INACTIVITY_THRESHOLD_DAYS,
} from "./lib/constants.js";

// ---------------------------------------------------------------------------
// generateOtp — OTP 生成（Firebase Auth 認証付き）
// ---------------------------------------------------------------------------

/**
 * 保護者がモバイルアプリから OTP を発行するためのエンドポイント。
 * Firebase Auth の ID Token で認証し、6桁の OTP を生成して Firestore に保存する。
 *
 * - Authorization ヘッダーに Bearer トークンが必要
 * - users コレクションにユーザードキュメントが存在しなければ自動作成
 */
export const generateOtp = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Authorization ヘッダーから ID Token を抽出
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const idToken = authHeader.split("Bearer ")[1];

  let decodedToken;
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const uid = decodedToken.uid;
  const email = decodedToken.email || "";
  const displayName = decodedToken.name || "";

  const db = getDb();

  // users ドキュメントが存在しなければ作成
  const userRef = db.collection(COLLECTION_USERS).doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    await userRef.set({
      email,
      displayName,
      childDevices: [],
      inactivityThresholdDays: DEFAULT_INACTIVITY_THRESHOLD_DAYS,
      createdAt: Timestamp.now(),
    });
  }

  // 6桁 OTP を生成（暗号学的に安全な乱数を使用）
  const otp = String(randomInt(OTP_MIN, OTP_MAX));

  // oneTimeCodes コレクションに保存
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000),
  );
  await db
    .collection(COLLECTION_ONE_TIME_CODES)
    .doc(otp)
    .set({
      parentId: uid,
      expiresAt,
      used: false,
      expireAt: Timestamp.fromDate(
        new Date(Date.now() + OTP_DOCUMENT_TTL_DAYS * 24 * 60 * 60 * 1000),
      ),
    });

  res.status(200).json({
    otp,
    expiresIn: OTP_EXPIRY_SECONDS,
  });
});

// ---------------------------------------------------------------------------
// registerDevice — デバイス登録（OTP 検証）
// ---------------------------------------------------------------------------

/**
 * Chrome Extension から OTP + deviceId を受け取り、デバイスを保護者アカウントに紐付ける。
 *
 * - OTP の有効性を検証（存在・未使用・有効期限内）
 * - devices コレクションに deviceId → parentId マッピングを作成
 * - users コレクションの childDevices 配列にデバイス情報を追加
 */
export const registerDevice = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  // バリデーション
  const result = registerDeviceSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "validation_error",
      details: result.error.issues,
    });
    return;
  }

  const { otp, deviceId, deviceName, syncAvailable } = result.data;
  const db = getDb();

  // OTP を検証
  const otpRef = db.collection(COLLECTION_ONE_TIME_CODES).doc(otp);
  const otpDoc = await otpRef.get();

  if (!otpDoc.exists) {
    res.status(400).json({ error: "invalid_otp" });
    return;
  }

  const otpData = otpDoc.data()!;

  if (otpData.used) {
    res.status(400).json({ error: "otp_already_used" });
    return;
  }

  if (otpData.expiresAt.toDate() < new Date()) {
    res.status(400).json({ error: "otp_expired" });
    return;
  }

  const parentId = otpData.parentId as string;
  const registeredAt = new Date().toISOString();

  // トランザクションで整合性を保証
  await db.runTransaction(async (tx) => {
    // OTP を使用済みにマーク
    tx.update(otpRef, { used: true });

    // devices コレクションにマッピングを作成
    const deviceRef = db.collection(COLLECTION_DEVICES).doc(deviceId);
    tx.set(deviceRef, {
      parentId,
      deviceName,
      registeredAt,
      lastSeenAt: Timestamp.now(),
      syncAvailable: syncAvailable ?? null,
    });

    // users の childDevices 配列に追加
    const userRef = db.collection(COLLECTION_USERS).doc(parentId);
    tx.update(userRef, {
      childDevices: FieldValue.arrayUnion({
        deviceId,
        deviceName,
        registeredAt,
      }),
    });
  });

  res.status(200).json({ status: "paired" });
});
