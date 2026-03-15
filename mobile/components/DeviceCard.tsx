/**
 * デバイスカードコンポーネント
 *
 * 登録デバイスの情報を表示するカード。
 * syncAvailable が false の場合は警告アイコンを表示し、
 * lastSeenAt で最終通信日時を表示する。
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatDate } from "../lib/formatters";
import { useTheme } from "../contexts/ThemeContext";

/** Props */
interface DeviceCardProps {
  /** デバイスID (UUID) */
  deviceId: string;
  /** デバイス名 */
  deviceName: string;
  /** 登録日時 (ISO8601) */
  registeredAt: string;
  /** chrome.storage.sync の利用可否（null = 未判定） */
  syncAvailable?: boolean | null;
  /** 最終データ受信日時 (ISO8601)。null = まだデータ受信なし */
  lastSeenAt?: string | null;
}

/** デバイス情報カード */
export function DeviceCard({
  deviceId,
  deviceName,
  registeredAt,
  syncAvailable,
  lastSeenAt,
}: DeviceCardProps): React.JSX.Element {
  const { colors } = useTheme();
  const showSyncWarning = syncAvailable === false;

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={[styles.indicator, { backgroundColor: colors.primary }]} />

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.deviceName, { color: colors.textPrimary }]}>
            {deviceName}
          </Text>
          {showSyncWarning && (
            <Text
              style={styles.warningIcon}
              accessibilityLabel="バックアップ不可"
            >
              ⚠️
            </Text>
          )}
        </View>
        <Text style={[styles.deviceIdText, { color: colors.textSecondary }]}>
          ID: {deviceId}
        </Text>
        <Text style={[styles.registeredAt, { color: colors.textSecondary }]}>
          登録日: {formatDate(registeredAt)}
        </Text>
        {lastSeenAt && (
          <Text style={[styles.lastSeen, { color: colors.textSecondary }]}>
            最終通信: {formatDate(lastSeenAt)}
          </Text>
        )}
        {showSyncWarning && (
          <Text
            style={[
              styles.warningText,
              {
                color: colors.syncWarningText,
                backgroundColor: colors.syncWarningBg,
              },
            ]}
          >
            バックアップ不可: キャッシュ削除で監視が解除される可能性があります
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 2,
  },
  indicator: {
    width: 6,
    borderRadius: 3,
    marginLeft: 12,
  },
  content: {
    flex: 1,
    paddingLeft: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
  },
  deviceIdText: {
    fontSize: 11,
    marginBottom: 4,
    fontFamily: "monospace",
  },
  warningIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
  registeredAt: {
    fontSize: 14,
  },
  lastSeen: {
    fontSize: 14,
    marginTop: 2,
  },
  warningText: {
    fontSize: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: "hidden",
  },
});
