/**
 * Service Worker — イベント駆動型トラッキングロジック
 *
 * Chrome ブラウザおよび PWA の利用時間を計測し、
 * 定期的に Firebase Functions API へ送信する。
 *
 * 設計方針:
 * - すべての状態は chrome.storage.local に永続化（SW 再起動耐性）
 * - 「アクティブポインタ」で現在の計測対象ドメインを管理
 * - イベント駆動で計測開始・終了・切り替え
 * - ポインタ操作は直列化キューで排他制御（二重計上防止）
 *
 * @see docs/adr/ADR-001-daily-usage-buffer-design.md
 * @see docs/review/v1.0/redesign-extension.md
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
  STORAGE_KEY_ACTIVE_POINTER,
  STORAGE_KEY_LAST_UPLOAD_TIMESTAMP,
  SYNC_KEY_DEVICE_BACKUPS,
  ALARM_NAME_FLUSH,
  MIN_DURATION_SECONDS,
  BUFFER_RETENTION_DAYS,
  UNLINKED_BUFFER_RETENTION_DAYS,
  UPLOAD_INTERVAL_MS,
  MAX_POINTER_STALENESS_MS,
  IDLE_DETECTION_INTERVAL_SECONDS,
  STORAGE_KEY_IDLE_START_TIMESTAMP,
  IDLE_TOLERANCE_MS,
  DEFAULT_API_ENDPOINT,
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
// 排他制御（ポインタ操作の直列化キュー）
// ---------------------------------------------------------------------------

/**
 * ポインタ操作の直列化キュー。
 * 複数のイベントが短時間に発火した場合に、storage の読み書きを
 * 順序保証付きで実行し、二重計上を防止する。
 */
let pointerQueue = Promise.resolve();

/**
 * ポインタ操作を直列化キューに追加して実行する
 * @param {() => Promise<void>} fn - 実行する非同期関数
 * @returns {Promise<void>}
 */
function withPointerLock(fn) {
  pointerQueue = pointerQueue.then(fn).catch((err) => {
    console.error("[CBLink] ポインタ操作エラー:", err);
  });
  return pointerQueue;
}

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
// ポインタ操作
// ---------------------------------------------------------------------------

/**
 * アクティブポインタを確定し、dailyUsage に利用時間を加算する。
 *
 * @param {{domain: string, startTime: number, triggerEvent: string}} pointer
 * @param {number} endTime - 確定時刻 (ms)
 */
async function finalizePointer(pointer, endTime) {
  if (!pointer || !pointer.domain || !pointer.startTime) return;

  const durationSeconds = Math.floor((endTime - pointer.startTime) / 1000);
  if (durationSeconds < MIN_DURATION_SECONDS) return;

  const startDate = getToday(new Date(pointer.startTime));
  const endDate = getToday(new Date(endTime));

  let dailyUsage = (await getStorage(STORAGE_KEY_DAILY_USAGE)) || {};

  if (startDate === endDate) {
    dailyUsage = addUsageToDailyBuffer(
      dailyUsage,
      startDate,
      pointer.domain,
      durationSeconds,
    );
  } else {
    // 日付跨ぎ: 各日に分割して加算
    const midnight = new Date(endTime);
    midnight.setHours(0, 0, 0, 0);
    const secondsBeforeMidnight = Math.floor(
      (midnight.getTime() - pointer.startTime) / 1000,
    );
    const secondsAfterMidnight = durationSeconds - secondsBeforeMidnight;

    if (secondsBeforeMidnight >= MIN_DURATION_SECONDS) {
      dailyUsage = addUsageToDailyBuffer(
        dailyUsage,
        startDate,
        pointer.domain,
        secondsBeforeMidnight,
      );
    }
    if (secondsAfterMidnight >= MIN_DURATION_SECONDS) {
      dailyUsage = addUsageToDailyBuffer(
        dailyUsage,
        endDate,
        pointer.domain,
        secondsAfterMidnight,
      );
    }
  }

  await setStorage(STORAGE_KEY_DAILY_USAGE, dailyUsage);
  console.log(`[CBLink] 計測確定: ${pointer.domain} (${durationSeconds}秒)`);
}

/**
 * ドメインを切り替える（旧ドメインの確定 → 新ドメインのポインタ作成）。
 * 直列化キュー内で実行され、二重計上を防止する。
 *
 * @param {string|null} newAppName - 新しい計測対象（null = 計測停止）
 * @param {string} triggerEvent - トリガーとなったイベント名
 */
async function switchDomain(newAppName, triggerEvent) {
  return withPointerLock(async () => {
    const now = Date.now();
    const pointer = await getStorage(STORAGE_KEY_ACTIVE_POINTER);

    // 同じドメインなら切り替え不要
    if (pointer && pointer.domain === newAppName) {
      return;
    }

    // 旧ドメインの利用時間を確定
    if (pointer) {
      await finalizePointer(pointer, now);
    }

    // 新ドメインのポインタ作成 or クリア
    if (newAppName) {
      await setStorage(STORAGE_KEY_ACTIVE_POINTER, {
        domain: newAppName,
        startTime: now,
        triggerEvent,
      });
      console.log(`[CBLink] 計測開始: ${newAppName} (${triggerEvent})`);
    } else {
      await setStorage(STORAGE_KEY_ACTIVE_POINTER, null);
      console.log(`[CBLink] 計測停止 (${triggerEvent})`);
    }
  });
}

// ---------------------------------------------------------------------------
// idle 状態の共通解決
// ---------------------------------------------------------------------------

/**
 * idle 状態を解決する — 各イベントハンドラの冒頭で呼び出す。
 *
 * STORAGE_KEY_IDLE_START_TIMESTAMP が記録されている場合:
 * - IDLE_TOLERANCE_MS 以内 → 短時間 idle として計測継続
 * - IDLE_TOLERANCE_MS 超過 → idle 開始時点でポインタを確定・クリア
 *
 * @returns {Promise<"long"|"short"|"none">}
 *   "long"  = 長時間 idle 超過 — ポインタは idle 開始時点で確定・クリア済み
 *   "short" = 短時間 idle — 計測継続
 *   "none"  = idle 状態ではなかった
 */
async function resolveIdleState() {
  const idleStart = await getStorage(STORAGE_KEY_IDLE_START_TIMESTAMP);
  if (!idleStart) return "none";

  const idleDuration = Date.now() - idleStart;
  await setStorage(STORAGE_KEY_IDLE_START_TIMESTAMP, null);

  if (idleDuration > IDLE_TOLERANCE_MS) {
    // 長時間 idle: idle 開始時点でポインタを確定・クリア
    await withPointerLock(async () => {
      const pointer = await getStorage(STORAGE_KEY_ACTIVE_POINTER);
      if (pointer) {
        await finalizePointer(pointer, idleStart);
        await setStorage(STORAGE_KEY_ACTIVE_POINTER, null);
      }
    });
    console.log(
      `[CBLink] 長時間 idle 解決 (${Math.round(idleDuration / 1000)}秒)`,
    );
    return "long";
  }

  console.log(
    `[CBLink] 短時間 idle 復帰 (${Math.round(idleDuration / 1000)}秒) — 計測継続`,
  );
  return "short";
}

// ---------------------------------------------------------------------------
// ログ送信
// ---------------------------------------------------------------------------

/**
 * 前回アップロードから UPLOAD_INTERVAL_MS 以上経過している場合のみ送信する。
 * SW が頻繁に再起動しても通信コストを抑制する。
 */
async function conditionalUpload() {
  const lastUpload = (await getStorage(STORAGE_KEY_LAST_UPLOAD_TIMESTAMP)) || 0;
  const now = Date.now();

  if (now - lastUpload < UPLOAD_INTERVAL_MS) return;

  await flushUsageData();
  await setStorage(STORAGE_KEY_LAST_UPLOAD_TIMESTAMP, now);
}

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

  // ペアリング済みの場合のみ送信する
  const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
  if (!pairingStatus) {
    return;
  }

  const deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);
  if (!deviceId) return;

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
      deviceId,
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

// ---------------------------------------------------------------------------
// 初期化
// ---------------------------------------------------------------------------

/**
 * Service Worker の初期化 — システムの心臓部。
 *
 * SW が起動するたびに呼ばれ、以下を順に実行する:
 * 1. deviceId の取得 / 復元 / 新規生成
 * 2. 旧 trackingSession のマイグレーション
 * 3. アクティブポインタのクラッシュリカバリ
 * 4. 古い日付データのガベージコレクション
 * 5. 条件付き Firebase 同期
 * 6. 定期アラーム・idle 検知の登録
 * 7. 現在のアクティブタブの計測開始
 */
async function initialize() {
  // --- Phase 1: deviceId ---
  let deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);
  if (!deviceId) {
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

  // API エンドポイントが未設定なら本番デフォルトを設定
  const currentEndpoint = await getStorage(STORAGE_KEY_API_ENDPOINT);
  if (!currentEndpoint) {
    await setStorage(STORAGE_KEY_API_ENDPOINT, DEFAULT_API_ENDPOINT);
  }

  // --- Phase 2: マイグレーション（旧 trackingSession をクリア） ---
  const prevSession = await getStorage(STORAGE_KEY_TRACKING_SESSION);
  if (prevSession) {
    await setStorage(STORAGE_KEY_TRACKING_SESSION, null);
    console.log("[CBLink] 旧 trackingSession をクリア");
  }

  // --- Phase 3: クラッシュリカバリ ---
  await withPointerLock(async () => {
    const pointer = await getStorage(STORAGE_KEY_ACTIVE_POINTER);
    if (pointer && pointer.startTime) {
      const elapsed = Date.now() - pointer.startTime;
      if (elapsed >= MAX_POINTER_STALENESS_MS) {
        // 古いポインタ: MAX_POINTER_STALENESS_MS 分だけ救済して破棄
        await finalizePointer(
          pointer,
          pointer.startTime + MAX_POINTER_STALENESS_MS,
        );
        await setStorage(STORAGE_KEY_ACTIVE_POINTER, null);
        console.log("[CBLink] 古いポインタを救済・クリア");
      } else {
        // 直近のポインタ: SW 再起動間の計測は継続とみなす
        console.log(
          `[CBLink] ポインタ維持: ${pointer.domain} (${Math.round(elapsed / 1000)}秒前)`,
        );
      }
    }
  });

  // --- Phase 4: ガベージコレクション ---
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

  // --- Phase 5: 条件付き Firebase 同期 ---
  await conditionalUpload();

  // --- Phase 6: アラーム・idle 検知の登録 ---
  await chrome.alarms.create(ALARM_NAME_FLUSH, { periodInMinutes: 1 });
  chrome.idle.setDetectionInterval(IDLE_DETECTION_INTERVAL_SECONDS);

  // --- Phase 7: 現在のアクティブタブで計測開始（ポインタが空の場合） ---
  await withPointerLock(async () => {
    const currentPointer = await getStorage(STORAGE_KEY_ACTIVE_POINTER);
    if (!currentPointer) {
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (activeTab) {
          const win = await chrome.windows.get(activeTab.windowId);
          const appName = determineAppName(win, [activeTab]);
          if (appName) {
            await setStorage(STORAGE_KEY_ACTIVE_POINTER, {
              domain: appName,
              startTime: Date.now(),
              triggerEvent: "initialize",
            });
            console.log(`[CBLink] 起動時計測開始: ${appName}`);
          }
        }
      } catch (e) {
        console.warn("[CBLink] 起動時アクティブタブ取得失敗:", e);
      }
    }
  });

  console.log("[CBLink] 初期化完了 deviceId:", deviceId);
}

// ---------------------------------------------------------------------------
// イベントハンドラ
// ---------------------------------------------------------------------------

/**
 * タブ切り替え時のハンドラ
 * @param {{tabId: number, windowId: number}} activeInfo
 */
async function handleTabActivated(activeInfo) {
  try {
    await resolveIdleState();
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const win = await chrome.windows.get(activeInfo.windowId);
    const appName = determineAppName(win, [tab]);
    if (appName) {
      await switchDomain(appName, "onActivated");
    }
  } catch (e) {
    console.warn("[CBLink] handleTabActivated エラー:", e);
  }
}

/**
 * タブ更新時のハンドラ（PWA ウィンドウ内の URL 変更を検知）
 * @param {number} tabId
 * @param {object} changeInfo
 * @param {chrome.tabs.Tab} tab
 */
async function handleTabUpdated(tabId, changeInfo, tab) {
  // URL 変更のみ対象
  if (!changeInfo.url) return;

  try {
    // アクティブタブ以外は無視
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!activeTab || activeTab.id !== tabId) return;

    // PWA ウィンドウ（app/popup）のみ URL 変更を追跡
    const win = await chrome.windows.get(tab.windowId);
    if (win.type !== "app" && win.type !== "popup") return;

    await resolveIdleState();
    const appName = determineAppName(win, [tab]);
    if (appName) {
      await switchDomain(appName, "onUpdated");
    }
  } catch (e) {
    console.warn("[CBLink] handleTabUpdated エラー:", e);
  }
}

/**
 * ウィンドウフォーカス変更時のハンドラ
 * @param {number} windowId - フォーカスされたウィンドウのID
 */
async function handleWindowFocusChanged(windowId) {
  // Chrome が非アクティブになった場合
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await resolveIdleState();
    await switchDomain(null, "onFocusChanged");
    await conditionalUpload();
    return;
  }

  try {
    await resolveIdleState();
    const win = await chrome.windows.get(windowId);
    const tabs = await chrome.tabs.query({ windowId, active: true });
    const appName = determineAppName(win, tabs);
    if (appName) {
      await switchDomain(appName, "onFocusChanged");
    }
  } catch (e) {
    console.warn("[CBLink] handleWindowFocusChanged エラー:", e);
  }
}

/**
 * idle 状態変更時のハンドラ
 *
 * 動画視聴や画面内容をメモしている間など、操作がなくても利用中の
 * ケースに対応するため、idle→active 間の経過時間で判定する:
 * - IDLE_TOLERANCE_MS 以内 → idle 期間も含めて継続とみなす
 * - IDLE_TOLERANCE_MS 超過 → idle 開始時点で計測を打ち切り、復帰時に再開
 *
 * @param {"active"|"idle"|"locked"} newState
 */
async function handleIdleStateChanged(newState) {
  if (newState === "active") {
    const result = await resolveIdleState();

    if (result === "long" || result === "none") {
      // long: 長時間 idle 解決済み — ポインタはクリア済みなので再開
      // none: idleStart 未記録（SW 再起動等）— 安全のため計測を更新
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (activeTab) {
          const win = await chrome.windows.get(activeTab.windowId);
          const appName = determineAppName(win, [activeTab]);
          if (appName) {
            const trigger =
              result === "long" ? "onIdleActive_long" : "onIdleActive";
            await switchDomain(appName, trigger);
          }
        }
      } catch (e) {
        console.warn("[CBLink] handleIdleStateChanged(active) エラー:", e);
      }
    }
    // result === "short": 短時間 idle — 計測継続、何もしない
  } else {
    // idle or locked: タイムスタンプを記録（計測は止めない）
    await setStorage(STORAGE_KEY_IDLE_START_TIMESTAMP, Date.now());
    console.log(`[CBLink] idle 開始記録 (${newState})`);
    await conditionalUpload();
  }
}

/**
 * 定期アラームハンドラ
 * - 日次クリーンアップ
 * - 進行中ポインタの中間計上（秒数を dailyUsage へ flush）
 * - 条件付き Firebase アップロード
 * @param {chrome.alarms.Alarm} alarm
 */
async function handleAlarm(alarm) {
  if (alarm.name !== ALARM_NAME_FLUSH) return;

  // 1日1回のクリーンアップ（ADR-007）
  const today = getToday();
  const lastCleanupDate = await getStorage(STORAGE_KEY_LAST_CLEANUP_DATE);
  if (lastCleanupDate !== today) {
    const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
    const retentionDays = pairingStatus
      ? BUFFER_RETENTION_DAYS
      : UNLINKED_BUFFER_RETENTION_DAYS;

    const dailyUsage = (await getStorage(STORAGE_KEY_DAILY_USAGE)) || {};
    const prunedUsage = pruneOldDates(dailyUsage, retentionDays);
    await setStorage(STORAGE_KEY_DAILY_USAGE, prunedUsage);

    const sentDates = (await getStorage(STORAGE_KEY_SENT_DATES)) || [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays + 1);
    const cleanedSentDates = sentDates.filter((d) => d >= getToday(cutoffDate));
    await setStorage(STORAGE_KEY_SENT_DATES, cleanedSentDates);

    await setStorage(STORAGE_KEY_LAST_CLEANUP_DATE, today);
    console.log("[CBLink] 日次クリーンアップ完了");
  }

  // 進行中ポインタの中間計上
  // idle 中の場合は idle 開始時点までの利用時間のみ確定し、
  // ポインタを idle 開始時刻で凍結する（idle 時間の誤計上を防止）
  await withPointerLock(async () => {
    const pointer = await getStorage(STORAGE_KEY_ACTIVE_POINTER);
    if (pointer) {
      const now = Date.now();
      const idleStart = await getStorage(STORAGE_KEY_IDLE_START_TIMESTAMP);

      if (idleStart && pointer.startTime < idleStart) {
        // idle 中（初回）: startTime 〜 idleStart の利用時間を確定し、
        // startTime を idleStart に固定して以降のアラームでは 0秒になるようにする
        await finalizePointer(pointer, idleStart);
        await setStorage(STORAGE_KEY_ACTIVE_POINTER, {
          ...pointer,
          startTime: idleStart,
        });
      } else if (!idleStart) {
        // 通常時（idle でない）: 現在時刻まで確定し、startTime をリセット
        await finalizePointer(pointer, now);
        await setStorage(STORAGE_KEY_ACTIVE_POINTER, {
          ...pointer,
          startTime: now,
        });
      }
      // idle 中で pointer.startTime >= idleStart: 既に精算済み、何もしない
    }
  });

  // 条件付きアップロード
  await conditionalUpload();
}

// ---------------------------------------------------------------------------
// メッセージハンドラ（Popup 連携用）
// ---------------------------------------------------------------------------

/**
 * Popup からのステータス問い合わせに応答する
 * @param {object} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {function} sendResponse
 * @returns {boolean} 非同期応答の場合 true
 */
function handleMessage(message, _sender, sendResponse) {
  if (message.type === "getStatus") {
    (async () => {
      const dailyUsage = await getStorage(STORAGE_KEY_DAILY_USAGE);
      const pointer = await getStorage(STORAGE_KEY_ACTIVE_POINTER);
      const today = getToday();
      const todayUsage = dailyUsage?.[today] || {};
      const todayTotalSeconds = Object.values(todayUsage).reduce(
        (sum, entry) => {
          const seconds = entry.totalSeconds || 0;
          return sum + Math.floor(seconds / 60) * 60;
        },
        0,
      );

      const pairingStatus = await getStorage(STORAGE_KEY_PAIRING_STATUS);
      const deviceId = await getStorage(STORAGE_KEY_DEVICE_ID);
      sendResponse({
        currentAppName: pointer?.domain || null,
        deviceId,
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

// タブ切り替え
chrome.tabs.onActivated.addListener(handleTabActivated);

// タブ URL 変更（PWA ウィンドウのドメイン変更検知）
chrome.tabs.onUpdated.addListener(handleTabUpdated);

// ウィンドウフォーカス変更
chrome.windows.onFocusChanged.addListener(handleWindowFocusChanged);

// idle 状態変更（idle / locked / active）
chrome.idle.onStateChanged.addListener(handleIdleStateChanged);

// 定期アラーム（60秒間隔）
chrome.alarms.onAlarm.addListener(handleAlarm);

// Popup からのメッセージ
chrome.runtime.onMessage.addListener(handleMessage);
