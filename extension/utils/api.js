/**
 * API 通信ユーティリティ
 */

/**
 * usageLogs エンドポイントの URL から、別の Function 名の URL を導出する。
 *
 * Production: https://region-project.cloudfunctions.net/usageLogs
 *           → https://region-project.cloudfunctions.net/registerDevice
 *
 * Emulator:  http://localhost:5001/project/region/usageLogs
 *          → http://localhost:5001/project/region/registerDevice
 *
 * @param {string} baseEndpoint - usageLogs の完全 URL
 * @param {string} functionName - 導出先の Function 名
 * @returns {string} 導出された URL
 */
export function deriveEndpointUrl(baseEndpoint, functionName) {
  const url = new URL(baseEndpoint);
  const parts = url.pathname.split("/");
  parts[parts.length - 1] = functionName;
  url.pathname = parts.join("/");
  return url.toString();
}

/**
 * 日次利用サマリーログを API に送信する
 * @param {string} endpoint - API のベース URL
 * @param {Array<{deviceId: string, date: string, appName: string, totalSeconds: number, lastUpdated: string}>} logs - 送信するログ配列
 * @returns {Promise<boolean>} 送信成功なら true、失敗なら false
 */
export async function sendUsageLogs(endpoint, logs) {
  if (!endpoint) {
    console.warn("[CBLink] API エンドポイントが未設定です");
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
        console.error(`[CBLink] API エラー: ${response.status} ${errorBody}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("[CBLink] ネットワークエラー:", error);
    return false;
  }
}

/**
 * デバイスをペアリング登録する（OTP + deviceId を registerDevice API に送信）
 *
 * @param {string} usageLogsEndpoint - usageLogs の完全 URL（registerDevice URL を導出するため）
 * @param {string} otp - 6桁の OTP コード
 * @param {string} deviceId - デバイス UUID
 * @param {string} deviceName - デバイス表示名
 * @param {boolean} [syncAvailable] - chrome.storage.sync が利用可能か
 * @returns {Promise<{success: boolean, error?: string}>} 登録結果
 */
export async function registerDevice(
  usageLogsEndpoint,
  otp,
  deviceId,
  deviceName,
  syncAvailable,
) {
  const endpoint = deriveEndpointUrl(usageLogsEndpoint, "registerDevice");

  try {
    const body = { otp, deviceId, deviceName };
    if (syncAvailable !== undefined) {
      body.syncAvailable = syncAvailable;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return { success: true };
    }

    const errorBody = await response.json();
    return { success: false, error: errorBody.error || "unknown_error" };
  } catch (error) {
    console.error("[CBLink] ペアリング登録エラー:", error);
    return { success: false, error: "network_error" };
  }
}

/**
 * Firestore 上のデバイス名を更新する
 *
 * @param {string} usageLogsEndpoint - usageLogs の完全 URL（updateDeviceName URL を導出するため）
 * @param {string} deviceId - デバイス UUID
 * @param {string} deviceName - 新しいデバイス表示名
 * @returns {Promise<{success: boolean, error?: string}>} 更新結果
 */
export async function updateDeviceName(
  usageLogsEndpoint,
  deviceId,
  deviceName,
) {
  const endpoint = deriveEndpointUrl(usageLogsEndpoint, "updateDeviceName");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, deviceName }),
    });

    if (response.ok) {
      return { success: true };
    }

    const errorBody = await response.json();
    return { success: false, error: errorBody.error || "unknown_error" };
  } catch (error) {
    console.error("[CBLink] デバイス名更新エラー:", error);
    return { success: false, error: "network_error" };
  }
}
