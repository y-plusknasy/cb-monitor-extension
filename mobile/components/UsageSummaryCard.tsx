/**
 * 利用時間サマリーカードコンポーネント
 *
 * 今日の合計利用時間を大きく表示するカード。
 * Family Link 風 Material Design。
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { formatDuration } from "../lib/formatters";
import { useTheme } from "../contexts/ThemeContext";

/** Props */
interface UsageSummaryCardProps {
  /** 合計利用秒数 */
  totalSeconds: number;
}

/** 今日の合計利用時間サマリーカード */
export function UsageSummaryCard({
  totalSeconds,
}: UsageSummaryCardProps): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.cardGray }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        今日の利用時間合計
      </Text>
      <Text style={[styles.duration, { color: colors.accent }]}>
        {formatDuration(totalSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
  },
  duration: {
    fontSize: 48,
    fontWeight: "bold",
  },
});
