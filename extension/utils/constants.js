/**
 * 定数定義
 * マジックナンバーを避け、設定値をここに集約する。
 *
 * @see docs/adr/ADR-001-daily-usage-buffer-design.md
 */

/** chrome.storage のキー: デバイスID */
export const STORAGE_KEY_DEVICE_ID = "deviceId";

/** chrome.storage のキー: API エンドポイント URL */
export const STORAGE_KEY_API_ENDPOINT = "apiEndpoint";

/** chrome.storage のキー: 現在の計測セッション */
export const STORAGE_KEY_TRACKING_SESSION = "trackingSession";

/** chrome.storage のキー: 日付ベースの利用時間バッファ */
export const STORAGE_KEY_DAILY_USAGE = "dailyUsage";

/** chrome.storage のキー: 送信済み日付リスト */
export const STORAGE_KEY_SENT_DATES = "sentDates";

/** Chrome ブラウザ全体の appName */
export const APP_NAME_CHROME_BROWSER = "chrome";

/** 種別不明のウィンドウに対する appName */
export const APP_NAME_UNKNOWN = "unknown";

/** chrome.storage のキー: 前回送信時の etag（差分検出用） */
export const STORAGE_KEY_LAST_SENT_ETAG = "lastSentEtag";

/** アラーム名: ログ定期送信 */
export const ALARM_NAME_FLUSH = "flushLogs";

/** 計測を無視する最小秒数 */
export const MIN_DURATION_SECONDS = 1;

/** バッファに保持する最大日数（当日含む） */
export const BUFFER_RETENTION_DAYS = 4;
