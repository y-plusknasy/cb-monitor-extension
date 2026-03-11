/**
 * 利用時間サマリーカードコンポーネント
 *
 * 今日の合計利用時間を大きく表示するカード。
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatDuration } from "../lib/formatters";

/** Props */
interface UsageSummaryCardProps {
  /** 合計利用秒数 */
  totalSeconds: number;
}

/** 今日の合計利用時間サマリーカード */
export function UsageSummaryCard({
  totalSeconds,
}: UsageSummaryCardProps): React.JSX.Element {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>今日の利用時間</Text>
      <Text style={styles.duration}>{formatDuration(totalSeconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#E8F5E9",
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  duration: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#2E7D32",
  },
});
