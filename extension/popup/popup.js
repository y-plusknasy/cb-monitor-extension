/**
 * Popup スクリプト — ステータス表示 + アプリ別利用時間内訳
 *
 * Service Worker から現在の計測状態を取得して表示する。
 * 監視の開始/停止ボタンは設けない（子供が任意に監視を無効化できない設計）。
 */

const currentAppEl = document.getElementById("current-app");
const pairingDotEl = document.getElementById("pairing-dot");
const deviceIdEl = document.getElementById("device-id");
const todayTotalEl = document.getElementById("today-total");
const appsListEl = document.getElementById("apps-list");
const openSettingsEl = document.getElementById("open-settings");

/**
 * 秒数を短縮形式にフォーマットする
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
 * 秒数を短い形式にフォーマットする（アプリ別表示用）
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatShortDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

/**
 * アプリ別利用時間の内訳を描画する
 * @param {Object} todayApps - { appName: { totalSeconds: number } }
 */
function renderAppBreakdown(todayApps) {
  if (!todayApps || Object.keys(todayApps).length === 0) {
    appsListEl.innerHTML = '<div class="no-data">データなし</div>';
    return;
  }

  // 利用時間が多い順にソート
  const sorted = Object.entries(todayApps)
    .map(([name, data]) => ({ name, seconds: data.totalSeconds || 0 }))
    .filter((a) => a.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  if (sorted.length === 0) {
    appsListEl.innerHTML = '<div class="no-data">データなし</div>';
    return;
  }

  const maxSeconds = sorted[0].seconds;
  // 上位 5 件のみ表示
  const display = sorted.slice(0, 5);

  appsListEl.innerHTML = display
    .map((app) => {
      const pct = Math.round((app.seconds / maxSeconds) * 100);
      return `<div class="app-row">
        <span class="app-name" title="${app.name}">${app.name}</span>
        <div class="app-bar-container">
          <div class="app-bar" style="width: ${pct}%"></div>
        </div>
        <span class="app-time">${formatShortDuration(app.seconds)}</span>
      </div>`;
    })
    .join("");
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
        currentAppEl.className = "tracking-app";
      } else {
        currentAppEl.textContent = "非アクティブ";
        currentAppEl.className = "tracking-app inactive";
      }

      // デバイスID（先頭8文字のみ表示）
      if (response.deviceId) {
        deviceIdEl.textContent = response.deviceId.substring(0, 8) + "...";
        deviceIdEl.title = response.deviceId;
      }

      // ペアリング状態（ドットインジケーター）
      if (response.pairingStatus) {
        pairingDotEl.className = "status-dot paired";
        pairingDotEl.title = `登録済み: ${response.pairingStatus.deviceName}`;
      } else {
        pairingDotEl.className = "status-dot unpaired";
        pairingDotEl.title = "未登録";
      }

      // 本日の合計利用時間
      todayTotalEl.textContent = formatDuration(
        response.todayTotalSeconds || 0,
      );

      // アプリ別内訳
      renderAppBreakdown(response.todayApps);
    }
  } catch (error) {
    console.error("[CBLink] ステータス取得エラー:", error);
    currentAppEl.textContent = "取得失敗";
    currentAppEl.className = "tracking-app inactive";
  }
}

// 設定ページを開く
openSettingsEl.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// 初回読み込み時にステータスを取得
updateStatus();
