/** サーバー側定数 */

// ---------------------------------------------------------------------------
// コレクション名
// ---------------------------------------------------------------------------

/** usageLogs コレクション名 */
export const COLLECTION_USAGE_LOGS = "usageLogs";

/** users コレクション名 */
export const COLLECTION_USERS = "users";

/** oneTimeCodes コレクション名 */
export const COLLECTION_ONE_TIME_CODES = "oneTimeCodes";

/** devices コレクション名（deviceId → parentId 逆引き用） */
export const COLLECTION_DEVICES = "devices";

// ---------------------------------------------------------------------------
// TTL
// ---------------------------------------------------------------------------

/** usageLogs の TTL (日数) */
export const USAGE_LOGS_TTL_DAYS = 30;

// ---------------------------------------------------------------------------
// OTP 設定
// ---------------------------------------------------------------------------

/** OTP の有効期限（秒） */
export const OTP_EXPIRY_SECONDS = 300;

/** OTP ドキュメントの TTL（日数）— expireAt フィールドに使用 */
export const OTP_DOCUMENT_TTL_DAYS = 1;

/** OTP の桁数の下限（生成用） */
export const OTP_MIN = 100000;

/** OTP の桁数の上限（生成用、排他） */
export const OTP_MAX = 1000000;

// ---------------------------------------------------------------------------
// 無操作検知
// ---------------------------------------------------------------------------

/** 無操作検知のデフォルト閾値（日数） */
export const DEFAULT_INACTIVITY_THRESHOLD_DAYS = 6;
