/**
 * Service Worker — メインのトラッキングロジック
 *
 * Chrome ブラウザおよび PWA の利用時間を計測し、
 * 定期的に Firebase Functions API へ送信する。
 *
 * 状態管理は chrome.storage.local をプライマリストアとし、
 * Service Worker のライフサイクル（停止・再起動）に耐える設計。
 *
 * @see docs/adr/ADR-001-daily-usage-buffer-design.md
 */

import {
  STORAGE_KEY_DEVICE_ID,
  STORAGE_KEY_API_ENDPOINT,
  STORAGE_KEY_TRACKING_SESSION,
  STORAGE_KEY_DAILY_USAGE,
  STORAGE_KEY_SENT_DATES,
  STORAGE_KEY_LAST_SENT_ETAG,
  STORAGE_KEY_PAIRING_STATUS,
  STORAGE_KEY_LAST_CLEANUP_DATE,
  SYNC_KEY_DEVICE_BACKUPS,
  ALARM_NAME_FLUSH,
  MIN_DURATION_SECONDS,
  BUFFER_RETENTION_DAYS,
  UNLINKED_BUFFER_RETENTION_DAYS,
} from "../utils/constants.js";
import {
  getStorage,
  setStorage,
  getSyncStorage,
  computeDeviceFingerprint,
} from "../utils/storage.js";
import { sendUsageLogs } from "../utils/api.js";
import {
  determineAppName,
  getToday,
  addUsageToDailyBuffer,
  pruneOldDates,
  computeDailyUsageEtag,
} from "../utils/tracking.js";

// ---------------------------------------------------------------------------
// インメモリ状態（現在の計測セッションのみ。永続化は chrome.storage）
// ---------------------------------------------------------------------------

/**
 * @type {{
 *   currentAppName: string|null,
 *   trackingStartTime: number|null,
 *   deviceId: string|null
 * }}
 */
const state = {
  /** 現在計測中のアプリ名 (PWA: ドメイン名 / Browser: "chrome" / null: 非アクティブ) */
  currentAppName: null,
  /** 現在のアプリの計測開始時刻 (ms) */
  trackingStartTime: null,
  /** デバイスID（chrome.storage からロード） */
  deviceId: null,
};

// ---------------------------------------------------------------------------
// chrome.storage.sync バックアップからの復元
// ---------------------------------------------------------------------------

/**
 * chrome.storage.sync に保存されたバックアップからデバイス情報を復元する。
 * デバイスフィンガープリントで端末を識別し、一致するバックアップを返す。
 *
 * @returns {Promise<{deviceId: string, pairingStatus: object|null, apiEndpoint: string|null}|null>}
 */
async function restoreFromSyncBackup() {
  try {
    const backups = await getSyncStorage(SYNC_KEY_DEVICE_BACKUPS);
    if (!backups || typeof backups !== "object") {
      return null;
    }

    const fingerprint = computeDeviceFingerprint();
    const backup = backups[fingerprint];
    if (!backup || !backup.deviceId) {
      return null;
    }

    return {
      deviceId: backup.deviceId,
      pairingStatus: backup.pairingStatus || null,
      apiEndpoint: backup.apiEndpoint || null,
    };
  } catch (error) {
    console.warn("[CBLink] chrome.storage.sync からの復元に失敗:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

/**
 * Service Worker の初期化
 * - deviceId の取得または生成
 * - 前回の計測セッションの復元（Service Worker 再起動対策）
 * - 古い日付データのガベージコレクション
 * - 未送信の過去日付データの送信
 * - 定期送信アラームの登録
 */
async function initialize() {
  // deviceId の取得または復元または新規生成
  let deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);
  if (!deviceId) {
    // chrome.storage.sync からの復元を試みる
    const restored = await restoreFromSyncBackup();
    if (restored) {
      deviceId = restored.deviceId;
      await setStorage(STORAGE_KEY_DEVICE_ID, deviceId);
      if (restored.pairingStatus) {
        await setStorage(STORAGE_KEY_PAIRING_STATUS, restored.pairingStatus);
      }
      if (restored.apiEndpoint) {
        await setStorage(STORAGE_KEY_API_ENDPOINT, restored.apiEndpoint);
      }
      console.log(
        "[CBLink] chrome.storage.sync から deviceId を復元:",
        deviceId,
      );
    } else {
      deviceId = crypto.randomUUID();
      await setStorage(STORAGE_KEY_DEVICE_ID, deviceId);
      console.log("[CBLink] 新規 deviceId を生成:", deviceId);
    }
  }
  state.deviceId = deviceId;

  // 前回の計測セッションを復元
  // Service Worker が再起動した場合、前回の計測中だった情報が残っている。
  // ただし停止中の時間は計測不能なため、セッションは破棄する。
  const prevSession = await getStorage(STORAGE_KEY_TRACKING_SESSION);
  if (prevSession) {
    console.log(
      `[CBLink] 前回セッション破棄: ${prevSession.appName} (Service Worker 再起動のため)`,
    );
    await setStorage(STORAGE_KEY_TRACKING_SESSION, null);
  }

  // 古い日付データのガベージコレクション
  // ペアリング済みの場合は BUFFER_RETENTION_DAYS、未ペアリングの場合は UNLINKED_BUFFER_RETENTION_DAYS
  const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
  const retentionDays = pairingStatus
    ? BUFFER_RETENTION_DAYS
    : UNLINKED_BUFFER_RETENTION_DAYS;
  const dailyUsage = (await getStorage(STORAGE_KEY_DAILY_USAGE)) || {};
  const pruned = pruneOldDates(dailyUsage, retentionDays);
  await setStorage(STORAGE_KEY_DAILY_USAGE, pruned);

  // 送信済みリストもクリーンアップ
  const sentDates = (await getStorage(STORAGE_KEY_SENT_DATES)) || [];
  const today = getToday();
  const cleanedSentDates = sentDates.filter((d) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays + 1);
    return d >= getToday(cutoff);
  });
  await setStorage(STORAGE_KEY_SENT_DATES, cleanedSentDates);

  // 未送信データを送信（当日分含む）
  await flushUsageData();

  // 定期送信アラームの登録（1分間隔）
  await chrome.alarms.create(ALARM_NAME_FLUSH, { periodInMinutes: 1 });
  console.log("[CBLink] 初期化完了 deviceId:", deviceId);
}

// ---------------------------------------------------------------------------
// トラッキング
// ---------------------------------------------------------------------------

/**
 * 利用時間計測を開始する
 * @param {string} appName - 計測対象のアプリ名
 */
async function startTracking(appName) {
  state.currentAppName = appName;
  state.trackingStartTime = Date.now();

  // chrome.storage に現在のセッション情報を永続化
  await setStorage(STORAGE_KEY_TRACKING_SESSION, {
    appName,
    startTime: state.trackingStartTime,
  });

  console.log("[CBLink] 計測開始:", appName);
}

/**
 * 現在の計測を停止し、日付別バッファに加算する
 */
async function stopTracking() {
  if (!state.currentAppName || !state.trackingStartTime) {
    return;
  }

  const now = Date.now();
  const durationSeconds = Math.floor((now - state.trackingStartTime) / 1000);

  // 最小秒数未満は無視
  if (durationSeconds < MIN_DURATION_SECONDS) {
    state.currentAppName = null;
    state.trackingStartTime = null;
    await setStorage(STORAGE_KEY_TRACKING_SESSION, null);
    return;
  }

  // 日付をまたぐ場合の分割処理
  const startDate = getToday(new Date(state.trackingStartTime));
  const endDate = getToday(new Date(now));

  let dailyUsage = (await getStorage(STORAGE_KEY_DAILY_USAGE)) || {};

  if (startDate === endDate) {
    // 同日: そのまま加算
    dailyUsage = addUsageToDailyBuffer(
      dailyUsage,
      startDate,
      state.currentAppName,
      durationSeconds,
    );
  } else {
    // 日付跨ぎ: 各日に分割して加算
    // startDate の分: startTime 〜 翌日 0:00
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const secondsBeforeMidnight = Math.floor(
      (midnight.getTime() - state.trackingStartTime) / 1000,
    );
    const secondsAfterMidnight = durationSeconds - secondsBeforeMidnight;

    if (secondsBeforeMidnight >= MIN_DURATION_SECONDS) {
      dailyUsage = addUsageToDailyBuffer(
        dailyUsage,
        startDate,
        state.currentAppName,
        secondsBeforeMidnight,
      );
    }
    if (secondsAfterMidnight >= MIN_DURATION_SECONDS) {
      dailyUsage = addUsageToDailyBuffer(
        dailyUsage,
        endDate,
        state.currentAppName,
        secondsAfterMidnight,
      );
    }
  }

  await setStorage(STORAGE_KEY_DAILY_USAGE, dailyUsage);

  console.log(
    `[CBLink] 計測停止: ${state.currentAppName} (${durationSeconds}秒)`,
  );

  state.currentAppName = null;
  state.trackingStartTime = null;
  await setStorage(STORAGE_KEY_TRACKING_SESSION, null);
}

// ---------------------------------------------------------------------------
// ログ送信
// ---------------------------------------------------------------------------

/**
 * dailyUsage バッファを API に送信する
 * - 当日分: 毎回送信（最新の累積値で upsert）
 * - 過去日付: sentDates に含まれない場合のみ送信
 */
async function flushUsageData() {
  const endpoint = await getStorage(STORAGE_KEY_API_ENDPOINT);
  if (!endpoint) {
    console.warn("[CBLink] API エンドポイント未設定。送信スキップ");
    return;
  }

  // S02: ペアリング済みの場合のみ送信する
  const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
  if (!pairingStatus) {
    return;
  }

  const dailyUsage = (await getStorage(STORAGE_KEY_DAILY_USAGE)) || {};
  const sentDates = (await getStorage(STORAGE_KEY_SENT_DATES)) || [];
  const today = getToday();

  // 送信対象: 当日分（毎回） + 過去日付で未送信のもの
  const datesToSend = Object.keys(dailyUsage).filter(
    (date) => date === today || !sentDates.includes(date),
  );

  if (datesToSend.length === 0) {
    return;
  }

  // 送信対象データの etag を計算し、前回送信時と同一なら送信スキップ
  const sendTarget = {};
  for (const date of datesToSend) {
    sendTarget[date] = dailyUsage[date];
  }
  const currentEtag = computeDailyUsageEtag(sendTarget);
  const lastSentEtag = await getStorage(STORAGE_KEY_LAST_SENT_ETAG);
  if (currentEtag === lastSentEtag) {
    return;
  }

  for (const date of datesToSend) {
    const apps = dailyUsage[date];
    const logs = Object.entries(apps).map(([appName, data]) => ({
      deviceId: state.deviceId,
      date,
      appName,
      totalSeconds: data.totalSeconds,
      lastUpdated: data.lastUpdated,
    }));

    const success = await sendUsageLogs(endpoint, logs);
    if (success) {
      // 過去日付のみ sentDates に記録（当日分は毎回再送するため記録しない）
      if (date < today && !sentDates.includes(date)) {
        sentDates.push(date);
      }
      console.log(`[CBLink] ${date} のログを送信完了 (${logs.length} アプリ)`);
    } else {
      console.warn(`[CBLink] ${date} のログ送信失敗。次回リトライ`);
      break; // 1件失敗したら残りも中断（ネットワーク障害の可能性）
    }
  }

  await setStorage(STORAGE_KEY_SENT_DATES, sentDates);

  // 送信成功時の etag を保存
  const updatedSendTarget = {};
  for (const date of datesToSend) {
    if (dailyUsage[date]) {
      updatedSendTarget[date] = dailyUsage[date];
    }
  }
  await setStorage(
    STORAGE_KEY_LAST_SENT_ETAG,
    computeDailyUsageEtag(updatedSendTarget),
  );
}

/**
 * 定期アラームで呼ばれるフラッシュ処理
 * - 現在計測中のセッションを一旦停止→バッファ加算→再開
 * - 過去日付データを API に送信
 */
async function flushOnAlarm() {
  // 1日1回のクリーンアップ（ADR-007）
  const today = getToday();
  const lastCleanupDate = await getStorage(STORAGE_KEY_LAST_CLEANUP_DATE);
  if (lastCleanupDate !== today) {
    const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
    const retentionDays = pairingStatus
      ? BUFFER_RETENTION_DAYS
      : UNLINKED_BUFFER_RETENTION_DAYS;

    const dailyUsage = (await getStorage(STORAGE_KEY_DAILY_USAGE)) || {};
    const pruned = pruneOldDates(dailyUsage, retentionDays);
    await setStorage(STORAGE_KEY_DAILY_USAGE, pruned);

    const sentDates = (await getStorage(STORAGE_KEY_SENT_DATES)) || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays + 1);
    const cleanedSentDates = sentDates.filter((d) => d >= getToday(cutoff));
    await setStorage(STORAGE_KEY_SENT_DATES, cleanedSentDates);

    await setStorage(STORAGE_KEY_LAST_CLEANUP_DATE, today);
    console.log("[CBLink] 日次クリーンアップ完了");
  }

  const wasTracking = state.currentAppName;

  if (wasTracking) {
    await stopTracking();
  }

  await flushUsageData();

  if (wasTracking) {
    await startTracking(wasTracking);
  }
}

// ---------------------------------------------------------------------------
// イベントハンドラ
// ---------------------------------------------------------------------------

/**
 * ウィンドウフォーカス変更時のハンドラ
 * @param {number} windowId - フォーカスされたウィンドウのID
 */
async function handleWindowFocusChanged(windowId) {
  // 現在計測中なら停止
  await stopTracking();

  // Chrome が非アクティブになった場合
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // 当日分含む未送信データを送信
    await flushUsageData();
    return;
  }

  try {
    // ウィンドウ情報を取得
    const win = await chrome.windows.get(windowId);
    // ウィンドウ内のタブ一覧を取得（PWA 判定用）
    const tabs = await chrome.tabs.query({ windowId, active: true });

    const appName = determineAppName(win, tabs);
    if (appName) {
      await startTracking(appName);
    } else {
      console.log("[CBLink] appName を特定できないウィンドウ");
    }
  } catch (error) {
    console.error("[CBLink] ウィンドウ情報取得エラー:", error);
  }
}

// ---------------------------------------------------------------------------
// メッセージハンドラ（Popup 連携用）
// ---------------------------------------------------------------------------

/**
 * Popup からのステータス問い合わせに応答する
 * @param {object} message - メッセージオブジェクト
 * @param {chrome.runtime.MessageSender} _sender
 * @param {function} sendResponse - 応答関数
 * @returns {boolean} 非同期応答の場合 true
 */
function handleMessage(message, _sender, sendResponse) {
  if (message.type === "getStatus") {
    // dailyUsage の今日の合計を取得（非同期）
    (async () => {
      const dailyUsage = await getStorage(STORAGE_KEY_DAILY_USAGE);
      const today = getToday();
      const todayUsage = dailyUsage?.[today] || {};
      // 各アプリの秒数を分単位に切り捨ててから合計する
      const todayTotalSeconds = Object.values(todayUsage).reduce(
        (sum, entry) => {
          const seconds = entry.totalSeconds || 0;
          return sum + Math.floor(seconds / 60) * 60;
        },
        0,
      );

      const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
      sendResponse({
        currentAppName: state.currentAppName,
        deviceId: state.deviceId,
        todayTotalSeconds,
        todayApps: todayUsage,
        pairingStatus,
      });
    })();
    return true; // 非同期応答
  }
  return false;
}

// ---------------------------------------------------------------------------
// イベントリスナー登録
// ---------------------------------------------------------------------------

// Service Worker 起動時に初期化
initialize();

// ウィンドウフォーカス変更
chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);

// 定期アラーム（60秒間隔）
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME_FLUSH) {
    await flushOnAlarm();
  }
});

// Popup からのメッセージ
chrome.runtime.onMessage.addListener(handleMessage);
