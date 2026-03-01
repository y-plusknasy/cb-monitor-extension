import { z } from "zod";

/** YYYY-MM-DD 形式の日付文字列 */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式で指定してください");

/**
 * 日次利用サマリーリクエストのバリデーションスキーマ (Zod)
 *
 * - deviceId: UUID v4 形式
 * - date: 対象日 (YYYY-MM-DD)
 * - appName: PWA のドメイン名 / "chrome" / "unknown"（1〜253文字）
 * - totalSeconds: その日のアプリ累積利用秒数（1〜86400）
 * - lastUpdated: 最終更新日時 ISO8601 datetime
 */
export const usageLogSchema = z.object({
  deviceId: z.string().uuid(),
  date: dateString,
  appName: z.string().min(1).max(253),
  totalSeconds: z.number().int().positive().max(86400),
  lastUpdated: z.string().datetime(),
});

/** usageLogSchema から推論されるリクエスト型 */
export type UsageLogRequest = z.infer<typeof usageLogSchema>;
