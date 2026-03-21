/**
 * 定数定義
 * マジックナンバーを避け、設定値をここに集約する。
 *
 * @see docs/adr/ADR-001-daily-usage-buffer-design.md
 */

/** 本番 API エンドポイント URL（usageLogs Function） */
export const DEFAULT_API_ENDPOINT =
  "https://asia-northeast1-cb-monitor-extension.cloudfunctions.net/usageLogs";

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

/** バッファに保持する最大日数（当日含む、ペアリング済み時） */
export const BUFFER_RETENTION_DAYS = 4;

/** 未ペアリング時のバッファ保持最大日数（当日含む） */
export const UNLINKED_BUFFER_RETENTION_DAYS = 14;

// ---------------------------------------------------------------------------
// S02: ペアリング関連
// ---------------------------------------------------------------------------

/** chrome.storage のキー: ペアリング状態 */
export const STORAGE_KEY_PAIRING_STATUS = "pairingStatus";

/** chrome.storage のキー: 最後にクリーンアップを実行した日付 (YYYY-MM-DD) */
export const STORAGE_KEY_LAST_CLEANUP_DATE = "lastCleanupDate";

/** chrome.storage.sync のキー: デバイスバックアップ（deviceId 復旧用） */
export const SYNC_KEY_DEVICE_BACKUPS = "deviceBackups";

// ---------------------------------------------------------------------------
// S-redesign: ポインタ管理・条件付き同期
// ---------------------------------------------------------------------------

/** chrome.storage のキー: アクティブポインタ（現在計測中のドメイン情報） */
export const STORAGE_KEY_ACTIVE_POINTER = "activePointer";

/** chrome.storage のキー: 最終 Firebase アップロード時刻 (ms) */
export const STORAGE_KEY_LAST_UPLOAD_TIMESTAMP = "lastUploadTimestamp";

/** Firebase アップロード最小間隔 (ms) — 59秒 */
export const UPLOAD_INTERVAL_MS = 59_000;

/** ポインタが「古い」と判定する閾値 (ms) — 5分 */
export const MAX_POINTER_STALENESS_MS = 300_000;

/** idle 検知の閾値 (秒) */
export const IDLE_DETECTION_INTERVAL_SECONDS = 60;
