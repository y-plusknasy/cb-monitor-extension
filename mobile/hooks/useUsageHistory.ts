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
import { COLLECTION_USAGE_LOGS } from "../lib/constants";

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

  useEffect(() => {
    if (!parentId) {
      setDailySummaries([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, COLLECTION_USAGE_LOGS),
      where("parentId", "==", parentId),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        // 日ごとに合計
        const map = new Map<string, number>();
        for (const d of dates) {
          map.set(d, 0);
        }

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          const date = data.date as string;
          const seconds = data.totalSeconds as number;
          const current = map.get(date) ?? 0;
          map.set(date, current + seconds);
        }

        const summaries: DailySummary[] = dates.map((date) => ({
          date,
          totalSeconds: map.get(date) ?? 0,
        }));

        setDailySummaries(summaries);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[useUsageHistory] onSnapshot error:", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [parentId, startDate, endDate, dates]);

  return { dailySummaries, loading, error };
}
