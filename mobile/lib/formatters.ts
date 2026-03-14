/**
 * 時間フォーマットユーティリティ
 */

/**
 * 秒数を分単位に切り捨てる（60秒未満は 0 になる）。
 *
 * @param totalSeconds - 合計秒数
 * @returns 分単位に切り捨てた秒数
 */
export function floorToMinutes(totalSeconds: number): number {
  return Math.floor(totalSeconds / 60) * 60;
}

/**
 * 秒数を「X時間Y分」形式の文字列に変換する。
 *
 * @param totalSeconds - 合計秒数
 * @returns フォーマットされた文字列（例: "1時間30分", "45分", "0分"）
 */
export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  }
  return `${minutes}分`;
}

/**
 * 秒数を「HH:MM」形式の文字列に変換する。
 *
 * @param totalSeconds - 合計秒数
 * @returns フォーマットされた文字列（例: "01:30", "0:45"）
 */
export function formatDurationShort(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * 今日の日付を YYYY-MM-DD 形式で取得する。
 *
 * @returns 今日の日付文字列
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * ISO8601 日時文字列を読みやすい日付文字列に変換する。
 *
 * @param isoString - ISO8601 形式の日時文字列
 * @returns フォーマットされた日付（例: "2026/03/02"）
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}
