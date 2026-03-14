/**
 * ホーム画面（今日のサマリー）
 *
 * 今日の合計利用時間とデバイス別 → アプリ別内訳を表示する。
 * Firestore onSnapshot でリアルタイム更新される。
 */
import React, { useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import {
  useUsageLogs,
  type UsageLogEntry,
  type DeviceTotalEntry,
} from "../../hooks/useUsageLogs";
import { useDevices, type DeviceInfo } from "../../hooks/useDevices";
import { UsageSummaryCard } from "../../components/UsageSummaryCard";
import { UsageHistoryChart } from "../../components/UsageHistoryChart";
import { AppUsageRow } from "../../components/AppUsageRow";
import { LoadingScreen } from "../../components/LoadingScreen";
import { formatDuration, floorToMinutes } from "../../lib/formatters";

/** セクション内アプリ集計結果 */
interface AppSummary {
  appName: string;
  totalSeconds: number;
}

/** SectionList 用のセクション型 */
interface DeviceSection {
  /** セクションヘッダーに表示するデバイス名 */
  deviceName: string;
  /** デバイスの合計利用秒数 */
  deviceTotalSeconds: number;
  /** セクション内データ（アプリ別集計） */
  data: AppSummary[];
}

/**
 * デバイス別 → アプリ別にグループ化する。
 *
 * ログをデバイスごとにまとめ、各デバイス内でアプリ別に集計する。
 * deviceTotals の利用時間順にソートし、デバイス名は devices マップから解決する。
 */
function buildDeviceSections(
  logs: UsageLogEntry[],
  deviceTotals: DeviceTotalEntry[],
  devices: DeviceInfo[],
): DeviceSection[] {
  // deviceId → deviceName のマップ
  const nameMap = new Map<string, string>();
  for (const d of devices) {
    nameMap.set(d.deviceId, d.deviceName);
  }

  // deviceId → ログ配列
  const logsByDevice = new Map<string, UsageLogEntry[]>();
  for (const log of logs) {
    const arr = logsByDevice.get(log.deviceId) ?? [];
    arr.push(log);
    logsByDevice.set(log.deviceId, arr);
  }

  // deviceTotals 順にセクション構築（後でフロア済み合計で再ソート）
  const sections = deviceTotals.map((dt) => {
    const deviceLogs = logsByDevice.get(dt.deviceId) ?? [];

    // アプリ別集計
    const appMap = new Map<string, number>();
    for (const log of deviceLogs) {
      const cur = appMap.get(log.appName) ?? 0;
      appMap.set(log.appName, cur + log.totalSeconds);
    }
    const appSummaries = Array.from(appMap.entries())
      .map(([appName, totalSeconds]) => ({ appName, totalSeconds }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds);

    // デバイス合計 = 各アプリの分単位切り捨て後の合計
    const deviceTotalSeconds = appSummaries.reduce(
      (sum, app) => sum + floorToMinutes(app.totalSeconds),
      0,
    );

    return {
      deviceName: nameMap.get(dt.deviceId) ?? dt.deviceId,
      deviceTotalSeconds,
      data: appSummaries,
    };
  });

  // フロア済み合計で降順ソート
  return sections.sort((a, b) => b.deviceTotalSeconds - a.deviceTotalSeconds);
}

export default function HomeScreen(): React.JSX.Element {
  const { user } = useAuth();
  const {
    logs,
    totalSeconds: _rawTotalSeconds,
    deviceTotals,
    loading,
  } = useUsageLogs(user?.uid);
  const { devices } = useDevices(user?.uid);

  /** デバイス別 → アプリ別にグループ化 */
  const sections = useMemo(
    () => buildDeviceSections(logs, deviceTotals, devices),
    [logs, deviceTotals, devices],
  );

  /** 全デバイス合計 = 各セクションの丸め済み合計の総和 */
  const totalSeconds = useMemo(
    () => sections.reduce((sum, s) => sum + s.deviceTotalSeconds, 0),
    [sections],
  );

  /** deviceId → deviceName マップ（チャート用） */
  const deviceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of devices) {
      map.set(d.deviceId, d.deviceName);
    }
    return map;
  }, [devices]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.appName}-${index}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <UsageSummaryCard totalSeconds={totalSeconds} />
            {user?.uid && (
              <UsageHistoryChart
                parentId={user.uid}
                deviceNameMap={deviceNameMap}
              />
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.deviceName}</Text>
            <Text style={styles.sectionDuration}>
              {formatDuration(section.deviceTotalSeconds)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <AppUsageRow
            appName={item.appName}
            totalSeconds={item.totalSeconds}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              まだ今日の利用データがありません
            </Text>
            <Text style={styles.emptyHint}>
              Chrome
              拡張機能がインストールされたデバイスからデータが送信されると、ここに表示されます
            </Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={false} enabled={false} />}
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
    marginHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  sectionDuration: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4285F4",
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  emptyText: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: "#AAA",
    textAlign: "center",
    lineHeight: 20,
  },
});
