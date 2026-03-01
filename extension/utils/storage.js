/**
 * chrome.storage.local の Promise ラッパー
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
