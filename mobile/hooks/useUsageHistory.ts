/**
 * 利用履歴取得フック
 *
 * Firestore から指定期間（7日分 × ページ）の利用ログを取得し、
 * 日ごとの合計利用秒数を返す。
 * リアルタイム更新 (onSnapshot) で購読する。
 */
import { useState, useEffect, useMemo } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { COLLECTION_DAILY_LOGS, COLLECTION_USAGE_LOGS } from "../lib/constants";
import { getTodayDateString, floorToMinutes } from "../lib/formatters";

/** 1日分のサマリー */
export interface DailySummary {
  /** 日付 (YYYY-MM-DD) */
  date: string;
  /** 合計利用秒数 */
  totalSeconds: number;
}

/** useUsageHistory の戻り値型 */
export interface UsageHistoryState {
  /** 日別サマリー配列（古い順） */
  dailySummaries: DailySummary[];
  /** 読み込み中フラグ */
  loading: boolean;
  /** エラー */
  error: Error | null;
}

/** チャート表示の日数 */
export const CHART_DAYS = 7;

/** 最大ページ数（28日 ÷ 7日 = 4） */
export const MAX_PAGES = 4;

/**
 * 基準日から offset 日前の日付文字列 (YYYY-MM-DD) を返す。
 */
function getDateString(baseDate: Date, offset: number): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - offset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 指定ページ分の日付範囲を生成する。
 *
 * @param page - ページ番号（0 = 今日から, 1 = 8日前から, ...）
 * @returns { startDate, endDate, dates } — dates は古い順
 */
export function getDateRange(page: number): {
  startDate: string;
  endDate: string;
  dates: string[];
} {
  const today = new Date();
  const endOffset = page * CHART_DAYS;
  const startOffset = endOffset + CHART_DAYS - 1;

  const dates: string[] = [];
  for (let i = startOffset; i >= endOffset; i--) {
    dates.push(getDateString(today, i));
  }

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dates,
  };
}

/**
 * 指定ページの利用履歴を取得するカスタムフック。
 *
 * dailyLogs コレクション（日次バッチ集計済み）から前日以前の履歴を取得する。
 * 当日分は dailyLogs に未反映のため、usageLogs コレクションから取得して補完する。
 *
 * @param parentId - 保護者の Firebase Auth UID
 * @param page - ページ番号 (0〜3)
 */
export function useUsageHistory(
  parentId: string | undefined,
  page: number,
): UsageHistoryState {
  const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { startDate, endDate, dates } = useMemo(
    () => getDateRange(page),
    [page],
  );

  const today = useMemo(() => getTodayDateString(), []);
  const hasToday = dates.includes(today);

  useEffect(() => {
    if (!parentId) {
      setDailySummaries([]);
      setLoading(false);
      return;
    }

    // dailyLogs の合計を保持（前日以前）
    const dailyLogsMap = new Map<string, number>();
    // usageLogs の当日合計を保持
    let todayTotal = 0;

    let dailyLogsLoaded = false;
    let usageLogsLoaded = !hasToday; // 当日を含まない場合はロード済みとする
    const unsubscribers: (() => void)[] = [];

    /** 両リスナーが揃ったら summaries を更新する */
    function mergeAndUpdate() {
      if (!dailyLogsLoaded || !usageLogsLoaded) return;

      const summaries: DailySummary[] = dates.map((date) => ({
        date,
        totalSeconds:
          date === today ? todayTotal : (dailyLogsMap.get(date) ?? 0),
      }));

      setDailySummaries(summaries);
      setLoading(false);
      setError(null);
    }

    // dailyLogs リスナー（前日以前のデータ）
    const dailyQ = query(
      collection(db, COLLECTION_DAILY_LOGS),
      where("parentIds", "array-contains", parentId),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
    );

    unsubscribers.push(
      onSnapshot(
        dailyQ,
        (snapshot: QuerySnapshot<DocumentData>) => {
          dailyLogsMap.clear();
          for (const d of dates) {
            dailyLogsMap.set(d, 0);
          }
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const date = data.date as string;
            const seconds = floorToMinutes(data.totalSeconds as number);
            const current = dailyLogsMap.get(date) ?? 0;
            dailyLogsMap.set(date, current + seconds);
          }
          dailyLogsLoaded = true;
          mergeAndUpdate();
        },
        (err) => {
          console.error("[useUsageHistory] dailyLogs onSnapshot error:", err);
          setError(err);
          setLoading(false);
        },
      ),
    );

    // usageLogs リスナー（当日分のみ）
    if (hasToday) {
      const usageQ = query(
        collection(db, COLLECTION_USAGE_LOGS),
        where("parentIds", "array-contains", parentId),
        where("date", "==", today),
      );

      unsubscribers.push(
        onSnapshot(
          usageQ,
          (snapshot: QuerySnapshot<DocumentData>) => {
            todayTotal = 0;
            for (const docSnap of snapshot.docs) {
              const data = docSnap.data();
              todayTotal += floorToMinutes((data.totalSeconds as number) ?? 0);
            }
            usageLogsLoaded = true;
            mergeAndUpdate();
          },
          (err) => {
            console.error("[useUsageHistory] usageLogs onSnapshot error:", err);
            setError(err);
            setLoading(false);
          },
        ),
      );
    }

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [parentId, startDate, endDate, dates, today, hasToday]);

  return { dailySummaries, loading, error };
}
