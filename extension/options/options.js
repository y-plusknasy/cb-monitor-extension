/**
 * Options ページスクリプト — API エンドポイント設定
 *
 * S01 では OTP 入力は実装しない。API エンドポイントの設定のみ。
 */

import { STORAGE_KEY_API_ENDPOINT } from "../utils/constants.js";
import { getStorage, setStorage } from "../utils/storage.js";

const form = document.getElementById("settings-form");
const endpointInput = document.getElementById("api-endpoint");
const messageEl = document.getElementById("message");

/**
 * 保存済みの設定を読み込んでフォームに反映する
 */
async function loadSettings() {
  const endpoint = await getStorage(STORAGE_KEY_API_ENDPOINT);
  if (endpoint) {
    endpointInput.value = endpoint;
  }
}

/**
 * メッセージを表示する
 * @param {string} text - 表示テキスト
 * @param {"success"|"error"} type - メッセージタイプ
 */
function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  setTimeout(() => {
    messageEl.className = "message";
  }, 3000);
}

// フォーム送信
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const endpoint = endpointInput.value.trim();
  if (!endpoint) {
    showMessage("URL を入力してください", "error");
    return;
  }

  try {
    await setStorage(STORAGE_KEY_API_ENDPOINT, endpoint);
    showMessage("保存しました", "success");
  } catch (error) {
    console.error("[WebUsageTracker] 設定保存エラー:", error);
    showMessage("保存に失敗しました", "error");
  }
});

// 初回読み込み
loadSettings();
