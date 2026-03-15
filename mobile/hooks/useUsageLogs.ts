/**
 * 利用ログリアルタイム取得フック
 *
 * Firestore の usageLogs コレクションを onSnapshot で購読し、
 * 指定日（デフォルト: 今日）の利用ログをリアルタイムに取得する。
 * デバイス別の合計秒数も集計して返す。
 */
import { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { COLLECTION_USAGE_LOGS } from "../lib/constants";
import { getTodayDateString } from "../lib/formatters";

/** 利用ログエントリの型 */
export interface UsageLogEntry {
  /** デバイス UUID */
  deviceId: string;
  /** アプリ識別名（ドメイン名 or "chrome"） */
  appName: string;
  /** その日のアプリ累積利用秒数 */
  totalSeconds: number;
  /** 対象日 (YYYY-MM-DD) */
  date: string;
}

/** デバイス別合計の型 */
export interface DeviceTotalEntry {
  /** デバイス UUID */
  deviceId: string;
  /** そのデバイスの合計利用秒数 */
  totalSeconds: number;
}

/** useUsageLogs の戻り値型 */
export interface UsageLogsState {
  /** 利用ログ一覧 */
  logs: UsageLogEntry[];
  /** 全デバイス合計利用秒数 */
  totalSeconds: number;
  /** デバイス別合計利用秒数 */
  deviceTotals: DeviceTotalEntry[];
  /** 読み込み中フラグ */
  loading: boolean;
  /** エラー */
  error: Error | null;
}

/**
 * デバイス別の合計利用秒数を集計する。
 *
 * @param logs - 利用ログエントリ配列
 * @returns デバイス別合計（利用時間の多い順にソート）
 */
export function aggregateByDevice(logs: UsageLogEntry[]): DeviceTotalEntry[] {
  const map = new Map<string, number>();
  for (const log of logs) {
    const current = map.get(log.deviceId) ?? 0;
    map.set(log.deviceId, current + log.totalSeconds);
  }
  return Array.from(map.entries())
    .map(([deviceId, totalSeconds]) => ({ deviceId, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

/**
 * 指定日の利用ログをリアルタイムに取得するカスタムフック。
 *
 * parentId が指定されている場合のみ Firestore リスナーを開始する。
 * デバイス別の合計秒数も集計して返す。
 *
 * @param parentId - 保護者の Firebase Auth UID
 * @param date - 対象日 (YYYY-MM-DD)。省略時は今日
 */
export function useUsageLogs(
  parentId: string | undefined,
  date?: string,
): UsageLogsState {
  const [logs, setLogs] = useState<UsageLogEntry[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [deviceTotals, setDeviceTotals] = useState<DeviceTotalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const targetDate = date ?? getTodayDateString();

  useEffect(() => {
    if (!parentId) {
      setLogs([]);
      setTotalSeconds(0);
      setDeviceTotals([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COLLECTION_USAGE_LOGS),
      where("parentIds", "array-contains", parentId),
      where("date", "==", targetDate),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const entries: UsageLogEntry[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            deviceId: data.deviceId as string,
            appName: data.appName as string,
            totalSeconds: data.totalSeconds as number,
            date: data.date as string,
          };
        });

        setLogs(entries);
        setTotalSeconds(
          entries.reduce((sum, entry) => sum + entry.totalSeconds, 0),
        );
        setDeviceTotals(aggregateByDevice(entries));
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[useUsageLogs] onSnapshot error:", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [parentId, targetDate]);

  return { logs, totalSeconds, deviceTotals, loading, error };
}
