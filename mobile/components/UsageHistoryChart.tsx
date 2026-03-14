/**
 * 利用履歴チャートコンポーネント
 *
 * 7日間分の日別合計利用時間をバーチャートで表示する。
 * 特定のバーをタップすると、その日のデバイス別 → アプリ別内訳を表示する。
 * 最大28日分（4ページ）のページング対応。
 */
import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import {
  collection,
  query,
  where,
  getDocs,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { COLLECTION_DAILY_LOGS, COLLECTION_USAGE_LOGS } from "../lib/constants";
import {
  useUsageHistory,
  type DailySummary,
  CHART_DAYS,
  MAX_PAGES,
} from "../hooks/useUsageHistory";
import {
  formatDuration,
  formatDurationShort,
  floorToMinutes,
  getTodayDateString,
} from "../lib/formatters";
import { AppUsageRow } from "./AppUsageRow";

/** Props */
interface UsageHistoryChartProps {
  /** 保護者 UID */
  parentId: string;
  /** デバイス名マップ (deviceId → deviceName) */
  deviceNameMap?: Map<string, string>;
}

/** 日別内訳のデバイスセクション */
interface DeviceBreakdown {
  deviceId: string;
  deviceName: string;
  totalSeconds: number;
  apps: { appName: string; totalSeconds: number }[];
}

/**
 * 曜日ラベル（短縮）
 */
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/**
 * 日付文字列 (YYYY-MM-DD) → "M/D (曜)" 表示に変換
 */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_LABELS[d.getDay()];
  return `${m}/${day}(${dow})`;
}

/** 利用履歴チャートコンポーネント */
export function UsageHistoryChart({
  parentId,
  deviceNameMap,
}: UsageHistoryChartProps): React.JSX.Element {
  const [page, setPage] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<DeviceBreakdown[] | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const { dailySummaries, loading } = useUsageHistory(parentId, page);

  /** バーの最大高さ (px) */
  const BAR_MAX_HEIGHT = 120;

  /** チャート内の最大秒数 */
  const maxSeconds = useMemo(() => {
    if (dailySummaries.length === 0) return 1;
    const max = Math.max(...dailySummaries.map((d) => d.totalSeconds));
    return max > 0 ? max : 1;
  }, [dailySummaries]);

  /**
   * バーをタップしたときに日別内訳を取得する。
   * 当日分は usageLogs から、過去日分は dailyLogs から取得する。
   */
  const handleBarPress = useCallback(
    async (date: string) => {
      if (selectedDate === date) {
        // 同じバーをタップ → 閉じる
        setSelectedDate(null);
        setBreakdown(null);
        return;
      }

      setSelectedDate(date);
      setBreakdownLoading(true);

      try {
        // 当日は usageLogs、過去は dailyLogs から取得
        const today = getTodayDateString();
        const collectionName =
          date === today ? COLLECTION_USAGE_LOGS : COLLECTION_DAILY_LOGS;

        const q = query(
          collection(db, collectionName),
          where("parentId", "==", parentId),
          where("date", "==", date),
        );
        const snapshot = await getDocs(q);

        // デバイス → アプリ別に集計
        const deviceMap = new Map<string, Map<string, number>>();

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data() as DocumentData;
          const deviceId = data.deviceId as string;
          const appName = data.appName as string;
          const seconds = data.totalSeconds as number;

          if (!deviceMap.has(deviceId)) {
            deviceMap.set(deviceId, new Map());
          }
          const appMap = deviceMap.get(deviceId)!;
          appMap.set(appName, (appMap.get(appName) ?? 0) + seconds);
        }

        const result: DeviceBreakdown[] = Array.from(deviceMap.entries())
          .map(([deviceId, appMap]) => {
            const apps = Array.from(appMap.entries())
              .map(([appName, totalSeconds]) => ({ appName, totalSeconds }))
              .sort((a, b) => b.totalSeconds - a.totalSeconds);
            return {
              deviceId,
              deviceName: deviceNameMap?.get(deviceId) ?? deviceId,
              totalSeconds: apps.reduce(
                (sum, app) => sum + floorToMinutes(app.totalSeconds),
                0,
              ),
              apps,
            };
          })
          .sort((a, b) => b.totalSeconds - a.totalSeconds);

        setBreakdown(result);
      } catch (err) {
        console.error("[UsageHistoryChart] breakdown fetch error:", err);
        setBreakdown(null);
      } finally {
        setBreakdownLoading(false);
      }
    },
    [parentId, selectedDate, deviceNameMap],
  );

  /** ページ戻り */
  const handlePrevPage = useCallback(() => {
    setPage((p) => Math.min(p + 1, MAX_PAGES - 1));
    setSelectedDate(null);
    setBreakdown(null);
  }, []);

  /** ページ進み */
  const handleNextPage = useCallback(() => {
    setPage((p) => Math.max(p - 1, 0));
    setSelectedDate(null);
    setBreakdown(null);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#4285F4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>利用履歴</Text>

      {/* ページングコントロール */}
      <View style={styles.paging}>
        <TouchableOpacity
          onPress={handlePrevPage}
          disabled={page >= MAX_PAGES - 1}
          style={styles.pageButton}
        >
          <Text
            style={[
              styles.pageButtonText,
              page >= MAX_PAGES - 1 && styles.pageButtonDisabled,
            ]}
          >
            ◀ 前週
          </Text>
        </TouchableOpacity>

        <Text style={styles.pageLabel}>
          {dailySummaries.length > 0
            ? `${formatShortDate(dailySummaries[0].date)} 〜 ${formatShortDate(dailySummaries[dailySummaries.length - 1].date)}`
            : ""}
        </Text>

        <TouchableOpacity
          onPress={handleNextPage}
          disabled={page <= 0}
          style={styles.pageButton}
        >
          <Text
            style={[
              styles.pageButtonText,
              page <= 0 && styles.pageButtonDisabled,
            ]}
          >
            次週 ▶
          </Text>
        </TouchableOpacity>
      </View>

      {/* バーチャート */}
      <View style={styles.chartContainer}>
        {dailySummaries.map((day) => {
          const barHeight = Math.max(
            (day.totalSeconds / maxSeconds) * BAR_MAX_HEIGHT,
            2,
          );
          const isSelected = selectedDate === day.date;

          return (
            <TouchableOpacity
              key={day.date}
              style={styles.barColumn}
              onPress={() => handleBarPress(day.date)}
              activeOpacity={0.7}
            >
              <Text style={styles.barValue}>
                {day.totalSeconds > 0
                  ? formatDurationShort(day.totalSeconds)
                  : ""}
              </Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: isSelected ? "#1A73E8" : "#4285F4",
                  },
                  isSelected && styles.barSelected,
                ]}
              />
              <Text
                style={[styles.barLabel, isSelected && styles.barLabelSelected]}
              >
                {formatShortDate(day.date).split("(")[0]}
              </Text>
              <Text style={styles.barDow}>
                {formatShortDate(day.date).match(/\((.)\)/)?.[1] ?? ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 選択日の内訳 */}
      {selectedDate && (
        <View style={styles.breakdownContainer}>
          <Text style={styles.breakdownTitle}>
            {formatShortDate(selectedDate)} の内訳
          </Text>

          {breakdownLoading ? (
            <ActivityIndicator
              size="small"
              color="#4285F4"
              style={styles.breakdownLoading}
            />
          ) : breakdown && breakdown.length > 0 ? (
            breakdown.map((device) => (
              <View key={device.deviceId} style={styles.deviceSection}>
                <View style={styles.deviceHeader}>
                  <Text style={styles.deviceName}>{device.deviceName}</Text>
                  <Text style={styles.deviceTotal}>
                    {formatDuration(device.totalSeconds)}
                  </Text>
                </View>
                {device.apps.map((app) => (
                  <AppUsageRow
                    key={`${device.deviceId}-${app.appName}`}
                    appName={app.appName}
                    totalSeconds={app.totalSeconds}
                  />
                ))}
              </View>
            ))
          ) : (
            <Text style={styles.noData}>この日のデータはありません</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  paging: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  pageButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pageButtonText: {
    fontSize: 13,
    color: "#4285F4",
    fontWeight: "500",
  },
  pageButtonDisabled: {
    color: "#CCC",
  },
  pageLabel: {
    fontSize: 12,
    color: "#666",
  },
  chartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 160,
    paddingTop: 16,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barValue: {
    fontSize: 9,
    color: "#888",
    marginBottom: 4,
  },
  bar: {
    width: 28,
    borderRadius: 4,
    minHeight: 2,
  },
  barSelected: {
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  barLabel: {
    fontSize: 11,
    color: "#666",
    marginTop: 6,
  },
  barLabelSelected: {
    color: "#1A73E8",
    fontWeight: "600",
  },
  barDow: {
    fontSize: 10,
    color: "#999",
    marginTop: 1,
  },
  breakdownContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    paddingTop: 12,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  breakdownLoading: {
    marginVertical: 16,
  },
  deviceSection: {
    marginBottom: 12,
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  deviceName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  deviceTotal: {
    fontSize: 13,
    fontWeight: "500",
    color: "#4285F4",
  },
  noData: {
    fontSize: 13,
    color: "#AAA",
    textAlign: "center",
    paddingVertical: 16,
  },
});
