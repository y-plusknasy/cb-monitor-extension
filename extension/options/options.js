/**
 * Options ページスクリプト — API エンドポイント設定 + OTP ペアリング
 */

import {
  STORAGE_KEY_API_ENDPOINT,
  STORAGE_KEY_DEVICE_ID,
  STORAGE_KEY_PAIRING_STATUS,
  STORAGE_KEY_SENT_DATES,
  STORAGE_KEY_LAST_SENT_ETAG,
  SYNC_KEY_DEVICE_BACKUPS,
} from "../utils/constants.js";
import {
  getStorage,
  setStorage,
  getSyncStorage,
  setSyncStorage,
  isSyncStorageAvailable,
  computeDeviceFingerprint,
} from "../utils/storage.js";
import { registerDevice } from "../utils/api.js";

// ---------------------------------------------------------------------------
// DOM 要素
// ---------------------------------------------------------------------------

const form = document.getElementById("settings-form");
const endpointInput = document.getElementById("api-endpoint");
const messageEl = document.getElementById("message");

const pairingForm = document.getElementById("pairing-form");
const deviceNameInput = document.getElementById("device-name");
const otpCodeInput = document.getElementById("otp-code");
const registerBtn = document.getElementById("register-btn");
const pairingStatusEl = document.getElementById("pairing-status");
const pairingMessageEl = document.getElementById("pairing-message");

// ---------------------------------------------------------------------------
// メッセージ表示ヘルパー
// ---------------------------------------------------------------------------

/**
 * メッセージを表示する
 * @param {HTMLElement} el - メッセージ表示要素
 * @param {string} text - 表示テキスト
 * @param {"success"|"error"} type - メッセージタイプ
 */
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
  setTimeout(() => {
    el.className = "message";
  }, 5000);
}

// ---------------------------------------------------------------------------
// API エンドポイント設定
// ---------------------------------------------------------------------------

/**
 * 保存済みの設定を読み込んでフォームに反映する
 */
async function loadSettings() {
  const endpoint = await getStorage(STORAGE_KEY_API_ENDPOINT);
  if (endpoint) {
    endpointInput.value = endpoint;
  }
}

// フォーム送信（API エンドポイント保存）
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const endpoint = endpointInput.value.trim();
  if (!endpoint) {
    showMessage(messageEl, "URL を入力してください", "error");
    return;
  }

  try {
    await setStorage(STORAGE_KEY_API_ENDPOINT, endpoint);
    showMessage(messageEl, "保存しました", "success");
  } catch (error) {
    console.error("[WebUsageTracker] 設定保存エラー:", error);
    showMessage(messageEl, "保存に失敗しました", "error");
  }
});

// ---------------------------------------------------------------------------
// ペアリング（デバイス登録）
// ---------------------------------------------------------------------------

/** OTP エラーコードの日本語メッセージ */
const OTP_ERROR_MESSAGES = {
  invalid_otp: "無効なワンタイムパスコードです",
  otp_already_used: "このワンタイムパスコードは使用済みです",
  otp_expired: "ワンタイムパスコードの有効期限が切れています",
  validation_error: "入力内容に誤りがあります",
  network_error: "通信に失敗しました。ネットワークを確認してください",
};

/**
 * ペアリング状態を UI に反映する
 */
async function loadPairingStatus() {
  const status = await getStorage(STORAGE_KEY_PAIRING_STATUS);
  if (status) {
    pairingStatusEl.className = "pairing-status paired";
    pairingStatusEl.textContent = `✓ 登録済み: ${status.deviceName}（${new Date(status.pairedAt).toLocaleDateString("ja-JP")}）`;
    // 登録済みの場合、フォームを非表示にする
    pairingForm.style.display = "none";
  } else {
    pairingStatusEl.className = "pairing-status unpaired";
    pairingStatusEl.textContent =
      "未登録 — 保護者のアプリで発行されたコードを入力して登録してください";
    pairingForm.style.display = "block";
  }
}

// ペアリングフォーム送信
pairingForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const otp = otpCodeInput.value.trim();
  const deviceName = deviceNameInput.value.trim();
  const endpoint = await getStorage(STORAGE_KEY_API_ENDPOINT);
  const deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);

  if (!endpoint) {
    showMessage(
      pairingMessageEl,
      "先に API エンドポイントを設定してください",
      "error",
    );
    return;
  }

  if (!deviceId) {
    showMessage(
      pairingMessageEl,
      "デバイスIDが未生成です。拡張機能を再起動してください",
      "error",
    );
    return;
  }

  // ボタンを無効化
  registerBtn.disabled = true;
  registerBtn.textContent = "登録中...";

  try {
    // chrome.storage.sync の利用可否を判定
    const syncAvailable = await isSyncStorageAvailable();

    const result = await registerDevice(
      endpoint,
      otp,
      deviceId,
      deviceName,
      syncAvailable,
    );

    if (result.success) {
      // ペアリング状態を保存
      const pairingStatus = {
        deviceName,
        pairedAt: new Date().toISOString(),
      };
      await setStorage(STORAGE_KEY_PAIRING_STATUS, pairingStatus);

      // sentDates と etag をクリア → バッファ内データを再送可能にする
      await setStorage(STORAGE_KEY_SENT_DATES, []);
      await setStorage(STORAGE_KEY_LAST_SENT_ETAG, null);

      // chrome.storage.sync にバックアップ（デバイスフィンガープリントで端末識別）
      if (syncAvailable) {
        try {
          const fingerprint = computeDeviceFingerprint();
          const backups = (await getSyncStorage(SYNC_KEY_DEVICE_BACKUPS)) || {};
          backups[fingerprint] = {
            deviceId,
            pairingStatus,
            apiEndpoint: endpoint,
            backedUpAt: new Date().toISOString(),
          };
          await setSyncStorage(SYNC_KEY_DEVICE_BACKUPS, backups);
          console.log(
            "[WebUsageTracker] chrome.storage.sync にバックアップ完了",
          );
        } catch (syncError) {
          console.warn(
            "[WebUsageTracker] chrome.storage.sync バックアップ失敗:",
            syncError,
          );
        }
      }

      showMessage(pairingMessageEl, "デバイス登録が完了しました", "success");
      await loadPairingStatus();
    } else {
      const msg =
        OTP_ERROR_MESSAGES[result.error] ||
        `登録に失敗しました (${result.error})`;
      showMessage(pairingMessageEl, msg, "error");
    }
  } catch (error) {
    console.error("[WebUsageTracker] ペアリング登録エラー:", error);
    showMessage(pairingMessageEl, "予期しないエラーが発生しました", "error");
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "登録";
  }
});

// ---------------------------------------------------------------------------
// 初回読み込み
// ---------------------------------------------------------------------------

loadSettings();
loadPairingStatus();
