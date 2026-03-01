/**
 * API 通信ユーティリティ
 */

/**
 * 日次利用サマリーログを API に送信する
 * @param {string} endpoint - API のベース URL
 * @param {Array<{deviceId: string, date: string, appName: string, totalSeconds: number, lastUpdated: string}>} logs - 送信するログ配列
 * @returns {Promise<boolean>} 送信成功なら true、失敗なら false
 */
export async function sendUsageLogs(endpoint, logs) {
  if (!endpoint) {
    console.warn("[WebUsageTracker] API エンドポイントが未設定です");
    return false;
  }

  try {
    // 各日次サマリーを個別に送信（API は単一レコードを受け付ける設計）
    for (const log of logs) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(log),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `[WebUsageTracker] API エラー: ${response.status} ${errorBody}`,
        );
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("[WebUsageTracker] ネットワークエラー:", error);
    return false;
  }
}
