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
  const showSyncWarning = syncAvailable === false;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.deviceName}>{deviceName}</Text>
        {showSyncWarning && (
          <Text
            style={styles.warningIcon}
            accessibilityLabel="バックアップ不可"
          >
            ⚠️
          </Text>
        )}
      </View>
      <Text style={styles.deviceIdText}>{deviceId}</Text>
      <Text style={styles.registeredAt}>
        登録日: {formatDate(registeredAt)}
      </Text>
      {lastSeenAt && (
        <Text style={styles.lastSeen}>最終通信: {formatDate(lastSeenAt)}</Text>
      )}
      {showSyncWarning && (
        <Text style={styles.warningText}>
          バックアップ不可: キャッシュ削除で監視が解除される可能性があります
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: "#4285F4",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  deviceIdText: {
    fontSize: 11,
    color: "#9CA3AF",
    marginBottom: 4,
    fontFamily: "monospace",
  },
  warningIcon: {
    fontSize: 18,
    marginLeft: 8,
  },
  registeredAt: {
    fontSize: 13,
    color: "#888",
  },
  lastSeen: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  warningText: {
    fontSize: 12,
    color: "#E65100",
    marginTop: 6,
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
});
