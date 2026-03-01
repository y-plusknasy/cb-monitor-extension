/**
 * Popup スクリプト — ステータス表示のみ
 *
 * Service Worker から現在の計測状態を取得して表示する。
 * 監視の開始/停止ボタンは設けない（子供が任意に監視を無効化できない設計）。
 */

const currentAppEl = document.getElementById("current-app");
const deviceIdEl = document.getElementById("device-id");
const todayTotalEl = document.getElementById("today-total");

/**
 * 秒数を「○時間○分」形式にフォーマットする
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} 時間 ${minutes} 分`;
  }
  return `${minutes} 分`;
}

/**
 * Service Worker にステータスを問い合わせて UI を更新する
 */
async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "getStatus" });
    if (response) {
      // 計測対象
      if (response.currentAppName) {
        currentAppEl.textContent = response.currentAppName;
        currentAppEl.className = "value active";
      } else {
        currentAppEl.textContent = "非アクティブ";
        currentAppEl.className = "value inactive";
      }

      // デバイスID（先頭8文字のみ表示）
      if (response.deviceId) {
        deviceIdEl.textContent = response.deviceId.substring(0, 8) + "...";
        deviceIdEl.title = response.deviceId;
      }

      // 本日の合計利用時間
      todayTotalEl.textContent = formatDuration(
        response.todayTotalSeconds || 0,
      );
    }
  } catch (error) {
    console.error("[WebUsageTracker] ステータス取得エラー:", error);
    currentAppEl.textContent = "取得失敗";
    currentAppEl.className = "value inactive";
  }
}

// 初回読み込み時にステータスを取得
updateStatus();
