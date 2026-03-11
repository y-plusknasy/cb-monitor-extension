/** モバイルアプリ側の定数 */

// ---------------------------------------------------------------------------
// Firestore コレクション名
// ---------------------------------------------------------------------------

/** usageLogs コレクション名 */
export const COLLECTION_USAGE_LOGS = "usageLogs";

/** users コレクション名 */
export const COLLECTION_USERS = "users";

/** devices コレクション名 */
export const COLLECTION_DEVICES = "devices";

/** appRegistry コレクション名 */
export const COLLECTION_APP_REGISTRY = "appRegistry";

// ---------------------------------------------------------------------------
// アプリ名定数
// ---------------------------------------------------------------------------

/** Chrome ブラウザ全体の appName */
export const APP_NAME_CHROME_BROWSER = "chrome";

/** 種別不明ウィンドウの appName */
export const APP_NAME_UNKNOWN = "unknown";

// ---------------------------------------------------------------------------
// 表示用
// ---------------------------------------------------------------------------

/** appName → 表示名のデフォルトマッピング */
export const DEFAULT_APP_DISPLAY_NAMES: Record<string, string> = {
  [APP_NAME_CHROME_BROWSER]: "Chrome ブラウザ",
  [APP_NAME_UNKNOWN]: "不明なアプリ",
};

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

/** OTP の有効期限（秒） */
export const OTP_EXPIRY_SECONDS = 300;

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Firebase Functions の API ベース URL。
 * 環境変数 EXPO_PUBLIC_API_BASE_URL から取得。
 * ローカル開発時は Emulator の URL を設定する。
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "http://localhost:5001/cb-monitor-extension/us-central1";

/**
 * Google SSO 用 Web Client ID。
 * Firebase Console → Authentication → Sign-in method → Google から取得。
 */
export const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_WEB_CLIENT_ID ?? "";
