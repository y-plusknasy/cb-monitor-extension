/**
 * トラッキングロジックのユーティリティ関数
 *
 * テスト可能にするため、Chrome API 非依存の純粋関数をここに分離する。
 *
 * @see docs/adr/ADR-001-daily-usage-buffer-design.md
 */

import { APP_NAME_CHROME_BROWSER } from "./constants.js";

/**
 * URL からドメイン名を抽出する
 * @param {string} url - 完全な URL 文字列
 * @returns {string|null} ドメイン名。抽出できない場合は null
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * ウィンドウ種別から appName を決定する
 * @param {{type: string}} win - ウィンドウオブジェクト（type フィールドのみ使用）
 * @param {Array<{url?: string}>} [tabs] - ウィンドウ内のアクティブタブ一覧
 * @returns {string|null} appName。判定できない場合は null
 */
export function determineAppName(win, tabs) {
  if (!win) return null;

  // PWA ウィンドウ: type が "app" または "popup"
  if (win.type === "app" || win.type === "popup") {
    if (tabs && tabs.length > 0 && tabs[0].url) {
      return extractDomain(tabs[0].url);
    }
    return null;
  }

  // 通常の Chrome ブラウザウィンドウ
  if (win.type === "normal") {
    return APP_NAME_CHROME_BROWSER;
  }

  return null;
}

/**
 * 現在の日付を YYYY-MM-DD 形式で返す
 * @param {Date} [now] - 基準日時。省略時は現在時刻
 * @returns {string} "YYYY-MM-DD" 形式のローカル日付文字列
 */
export function getToday(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * dailyUsage バッファに利用時間を加算する（イミュータブル）
 *
 * @param {Object<string, Object<string, {totalSeconds: number, lastUpdated: string}>>} dailyUsage - 既存バッファ
 * @param {string} date - YYYY-MM-DD
 * @param {string} appName - アプリ名
 * @param {number} seconds - 加算する秒数
 * @returns {Object} 更新後の dailyUsage
 */
export function addUsageToDailyBuffer(dailyUsage, date, appName, seconds) {
  const updated = { ...dailyUsage };
  if (!updated[date]) {
    updated[date] = {};
  } else {
    updated[date] = { ...updated[date] };
  }

  const existing = updated[date][appName];
  const currentTotal = existing ? existing.totalSeconds : 0;

  updated[date][appName] = {
    totalSeconds: currentTotal + seconds,
    lastUpdated: new Date().toISOString(),
  };

  return updated;
}

/**
 * 古い日付のエントリを dailyUsage から削除する（ガベージコレクション）
 *
 * @param {Object<string, Object>} dailyUsage - 既存バッファ
 * @param {number} retentionDays - 保持日数（当日含む）
 * @param {Date} [now] - 基準日時
 * @returns {Object} ガベージコレクション後の dailyUsage
 */
export function pruneOldDates(dailyUsage, retentionDays, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - retentionDays + 1);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffStr = getToday(cutoff);

  const pruned = {};
  for (const date of Object.keys(dailyUsage)) {
    if (date >= cutoffStr) {
      pruned[date] = dailyUsage[date];
    }
  }
  return pruned;
}
