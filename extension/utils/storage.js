/**
 * chrome.storage.local / chrome.storage.sync の Promise ラッパー
 */

/**
 * chrome.storage.local から値を取得する
 * @param {string} key - ストレージキー
 * @returns {Promise<any>} 保存されている値。未設定の場合は undefined
 */
export async function getStorage(key) {
  const result = await chrome.storage.local.get(key);
  return result[key];
}

/**
 * chrome.storage.local に値を保存する
 * @param {string} key - ストレージキー
 * @param {any} value - 保存する値
 * @returns {Promise<void>}
 */
export async function setStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ---------------------------------------------------------------------------
// chrome.storage.sync — デバイス復旧用バックアップ
// ---------------------------------------------------------------------------

/**
 * chrome.storage.sync から値を取得する
 * @param {string} key - ストレージキー
 * @returns {Promise<any>} 保存されている値。未設定の場合は undefined
 */
export async function getSyncStorage(key) {
  const result = await chrome.storage.sync.get(key);
  return result[key];
}

/**
 * chrome.storage.sync に値を保存する
 * @param {string} key - ストレージキー
 * @param {any} value - 保存する値
 * @returns {Promise<void>}
 */
export async function setSyncStorage(key, value) {
  await chrome.storage.sync.set({ [key]: value });
}

/**
 * chrome.storage.sync が利用可能かどうかを判定する。
 * 管理ポリシーで sync が無効化されている場合は false を返す。
 * @returns {Promise<boolean>}
 */
export async function isSyncStorageAvailable() {
  try {
    const testKey = "__sync_availability_test__";
    await chrome.storage.sync.set({ [testKey]: true });
    await chrome.storage.sync.remove(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * デバイスフィンガープリントを計算する。
 * chrome.storage.sync はアカウント単位の同期ストレージであるため、
 * 同一アカウントで複数デバイスを使用するケースに備え、
 * デバイスを識別するための簡易フィンガープリントを生成する。
 *
 * @returns {string} デバイスフィンガープリント文字列
 */
export function computeDeviceFingerprint() {
  const parts = [
    navigator.userAgent || "",
    navigator.platform || "",
    String(navigator.hardwareConcurrency || 0),
    navigator.language || "",
  ];
  const str = parts.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32bit integer に変換
  }
  return "device_" + Math.abs(hash).toString(36);
}
