/**
 * Options ページスクリプト — ペアリング状態管理 + デバイス名編集 + API 設定
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

// ペアリング済み表示
const pairedView = document.getElementById("paired-view");
const deviceNameText = document.getElementById("device-name-text");
const pairedDateEl = document.getElementById("paired-date");
const pairedDeviceIdEl = document.getElementById("paired-device-id");

// デバイス名編集
const deviceNameDisplay = document.getElementById("device-name-display");
const deviceNameEditEl = document.getElementById("device-name-edit");
const deviceNameInput = document.getElementById("device-name-input");
const editNameBtn = document.getElementById("edit-name-btn");
const saveNameBtn = document.getElementById("save-name-btn");
const cancelNameBtn = document.getElementById("cancel-name-btn");
const nameEditMessageEl = document.getElementById("name-edit-message");

// 追加ペアリング（登録済み時の OTP 再入力）
const showRepairingBtn = document.getElementById("show-repairing-btn");
const repairingFormContainer = document.getElementById(
  "repairing-form-container",
);
const repairingForm = document.getElementById("repairing-form");
const repairingOtpInput = document.getElementById("repairing-otp-code");
const repairingBtn = document.getElementById("repairing-btn");
const repairingCancelBtn = document.getElementById("repairing-cancel-btn");
const repairingMessageEl = document.getElementById("repairing-message");

// 未登録表示
const unpairedView = document.getElementById("unpaired-view");
const pairingForm = document.getElementById("pairing-form");
const newDeviceNameInput = document.getElementById("device-name");
const otpCodeInput = document.getElementById("otp-code");
const registerBtn = document.getElementById("register-btn");
const pairingMessageEl = document.getElementById("pairing-message");

// ===== DEV ONLY: 開発環境エミュレーター接続用 START =====
// 本番環境では本セクション（START〜END）を削除すること。

// API 設定
const settingsForm = document.getElementById("settings-form");
const endpointInput = document.getElementById("api-endpoint");
const messageEl = document.getElementById("message");

// 折りたたみ
const advancedToggle = document.getElementById("advanced-toggle");
const advancedBody = document.getElementById("advanced-body");

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
// 折りたたみ制御
// ---------------------------------------------------------------------------

advancedToggle.addEventListener("click", () => {
  const isOpen = advancedBody.classList.toggle("open");
  advancedToggle.classList.toggle("open", isOpen);
});

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

settingsForm.addEventListener("submit", async (e) => {
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
    console.error("[CBLink] 設定保存エラー:", error);
    showMessage(messageEl, "保存に失敗しました", "error");
  }
});

// ===== DEV ONLY: 開発環境エミュレーター接続用 END =====

// ---------------------------------------------------------------------------
// ペアリング状態管理
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
  const deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);

  if (status) {
    // 登録済み表示
    pairedView.style.display = "block";
    unpairedView.style.display = "none";

    deviceNameText.textContent = status.deviceName;
    pairedDateEl.textContent = new Date(status.pairedAt).toLocaleDateString(
      "ja-JP",
    );
    pairedDeviceIdEl.textContent = deviceId || "-";
  } else {
    // 未登録表示
    pairedView.style.display = "none";
    unpairedView.style.display = "block";
  }
}

// ---------------------------------------------------------------------------
// デバイス名編集
// ---------------------------------------------------------------------------

editNameBtn.addEventListener("click", () => {
  const currentName = deviceNameText.textContent;
  deviceNameInput.value = currentName;
  deviceNameDisplay.style.display = "none";
  deviceNameEditEl.style.display = "flex";
  deviceNameInput.focus();
});

cancelNameBtn.addEventListener("click", () => {
  deviceNameDisplay.style.display = "flex";
  deviceNameEditEl.style.display = "none";
});

deviceNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveNameBtn.click();
  } else if (e.key === "Escape") {
    cancelNameBtn.click();
  }
});

saveNameBtn.addEventListener("click", async () => {
  const newName = deviceNameInput.value.trim();
  if (!newName) {
    showMessage(nameEditMessageEl, "デバイス名を入力してください", "error");
    return;
  }

  try {
    // chrome.storage.local のペアリング状態を更新
    const status = await getStorage(STORAGE_KEY_PAIRING_STATUS);
    if (!status) return;

    status.deviceName = newName;
    await setStorage(STORAGE_KEY_PAIRING_STATUS, status);

    // chrome.storage.sync のバックアップも更新
    const syncAvailable = await isSyncStorageAvailable();
    if (syncAvailable) {
      try {
        const fingerprint = computeDeviceFingerprint();
        const backups = (await getSyncStorage(SYNC_KEY_DEVICE_BACKUPS)) || {};
        if (backups[fingerprint]) {
          backups[fingerprint].pairingStatus = status;
          await setSyncStorage(SYNC_KEY_DEVICE_BACKUPS, backups);
        }
      } catch (syncError) {
        console.warn("[CBLink] sync バックアップ更新失敗:", syncError);
      }
    }

    // UI 更新
    deviceNameText.textContent = newName;
    deviceNameDisplay.style.display = "flex";
    deviceNameEditEl.style.display = "none";
    showMessage(nameEditMessageEl, "デバイス名を更新しました", "success");
  } catch (error) {
    console.error("[CBLink] デバイス名更新エラー:", error);
    showMessage(nameEditMessageEl, "更新に失敗しました", "error");
  }
});

// ---------------------------------------------------------------------------
// ペアリング登録（OTP）
// ---------------------------------------------------------------------------

pairingForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const otp = otpCodeInput.value.trim();
  const deviceName = newDeviceNameInput.value.trim();
  const endpoint = await getStorage(STORAGE_KEY_API_ENDPOINT);
  const deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);

  if (!endpoint) {
    showMessage(
      pairingMessageEl,
      "先に詳細設定から API エンドポイントを設定してください",
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

  registerBtn.disabled = true;
  registerBtn.textContent = "登録中...";

  try {
    const syncAvailable = await isSyncStorageAvailable();

    const result = await registerDevice(
      endpoint,
      otp,
      deviceId,
      deviceName,
      syncAvailable,
    );

    if (result.success) {
      const pairingStatus = {
        deviceName,
        pairedAt: new Date().toISOString(),
      };
      await setStorage(STORAGE_KEY_PAIRING_STATUS, pairingStatus);

      // sentDates と etag をクリア → バッファ内データを再送可能にする
      await setStorage(STORAGE_KEY_SENT_DATES, []);
      await setStorage(STORAGE_KEY_LAST_SENT_ETAG, null);

      // chrome.storage.sync にバックアップ
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
          console.log("[CBLink] chrome.storage.sync にバックアップ完了");
        } catch (syncError) {
          console.warn(
            "[CBLink] chrome.storage.sync バックアップ失敗:",
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
    console.error("[CBLink] ペアリング登録エラー:", error);
    showMessage(pairingMessageEl, "予期しないエラーが発生しました", "error");
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = "登録";
  }
});

// ---------------------------------------------------------------------------
// 追加ペアリング（登録済みデバイスを別の保護者と紐付け）
// ---------------------------------------------------------------------------

showRepairingBtn.addEventListener("click", () => {
  repairingFormContainer.style.display = "block";
  showRepairingBtn.style.display = "none";
});

repairingForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const otp = repairingOtpInput.value.trim();
  const endpoint = await getStorage(STORAGE_KEY_API_ENDPOINT);
  const deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);
  const status = await getStorage(STORAGE_KEY_PAIRING_STATUS);
  const deviceName = status?.deviceName || "Unknown Device";

  if (!endpoint) {
    showMessage(
      repairingMessageEl,
      "先に詳細設定から API エンドポイントを設定してください",
      "error",
    );
    return;
  }

  if (!deviceId) {
    showMessage(
      repairingMessageEl,
      "デバイスIDが未生成です。拡張機能を再起動してください",
      "error",
    );
    return;
  }

  repairingBtn.disabled = true;
  repairingBtn.textContent = "登録中...";

  try {
    const syncAvailable = await isSyncStorageAvailable();

    const result = await registerDevice(
      endpoint,
      otp,
      deviceId,
      deviceName,
      syncAvailable,
    );

    if (result.success) {
      showMessage(
        repairingMessageEl,
        "別の保護者アカウントとの連携が完了しました",
        "success",
      );
      repairingOtpInput.value = "";
      // フォームを閉じてボタンを戻す
      setTimeout(() => {
        repairingFormContainer.style.display = "none";
        showRepairingBtn.style.display = "block";
      }, 3000);
    } else {
      const msg =
        OTP_ERROR_MESSAGES[result.error] ||
        `登録に失敗しました (${result.error})`;
      showMessage(repairingMessageEl, msg, "error");
    }
  } catch (error) {
    console.error("[CBLink] 追加ペアリングエラー:", error);
    showMessage(repairingMessageEl, "予期しないエラーが発生しました", "error");
  } finally {
    repairingBtn.disabled = false;
    repairingBtn.textContent = "登録";
  }
});

repairingCancelBtn.addEventListener("click", (e) => {
  e.preventDefault();
  repairingOtpInput.value = "";
  repairingFormContainer.style.display = "none";
  showRepairingBtn.style.display = "block";
});

// ---------------------------------------------------------------------------
// 初回読み込み
// ---------------------------------------------------------------------------

loadSettings();
loadPairingStatus();
