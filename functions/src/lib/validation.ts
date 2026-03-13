import { z } from "zod";

/** YYYY-MM-DD 形式の日付文字列 */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください");

/**
 * appName の安全な文字パターン
 *
 * ドメイン名 / "chrome" / "unknown" のみを想定。
 * 許可: 英数字、ハイフン、ドット、アンダースコア
 * 拒否: 制御文字、スラッシュ、バックスラッシュ、スペース、特殊文字等
 */
const safeAppName = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    "appName は英数字・ドット・ハイフン・アンダースコアのみ使用可能です",
  );

/**
 * 日次利用サマリーリクエストのバリデーションスキーマ (Zod)
 *
 * - deviceId: UUID v4 形式
 * - date: 対象日 (YYYY-MM-DD)
 * - appName: PWA のドメイン名 / "chrome" / "unknown"（安全な文字のみ・1〜253文字）
 * - totalSeconds: その日のアプリ累積利用秒数（1〜86400）
 * - lastUpdated: 最終更新日時 ISO8601 datetime
 *
 * strict() により未定義のプロパティが含まれている場合はバリデーションエラーとなる。
 */
export const usageLogSchema = z
  .object({
    deviceId: z.string().uuid(),
    date: dateString,
    appName: safeAppName,
    totalSeconds: z.number().int().positive().max(86400),
    lastUpdated: z.string().datetime(),
  })
  .strict();

/** usageLogSchema から推論されるリクエスト型 */
export type UsageLogRequest = z.infer<typeof usageLogSchema>;

// ---------------------------------------------------------------------------
// S02: ペアリング用スキーマ
// ---------------------------------------------------------------------------

/** 6桁数字の OTP 文字列 */
const otpString = z.string().regex(/^\d{6}$/, "6桁の数字で指定してください");

/**
 * deviceName の安全な文字パターン
 *
 * 制御文字（\x00-\x1f）とバックスラッシュを拒否。
 * 日本語を含む一般的な表示名は許可する。
 */
const safeDeviceName = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[^\x00-\x1f\\]*$/,
    "deviceName に制御文字やバックスラッシュは使用できません",
  );

/**
 * デバイス登録リクエストのバリデーションスキーマ
 *
 * - otp: 6桁数字の OTP コード
 * - deviceId: UUID v4 形式
 * - deviceName: デバイス表示名（1〜100文字、制御文字禁止）
 *
 * strict() により未定義のプロパティが含まれている場合はバリデーションエラーとなる。
 */
export const registerDeviceSchema = z
  .object({
    otp: otpString,
    deviceId: z.string().uuid(),
    deviceName: safeDeviceName,
    syncAvailable: z.boolean().optional(),
  })
  .strict();

/** registerDeviceSchema から推論されるリクエスト型 */
export type RegisterDeviceRequest = z.infer<typeof registerDeviceSchema>;
