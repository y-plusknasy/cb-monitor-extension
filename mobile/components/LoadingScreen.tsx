/**
 * ローディング画面コンポーネント
 *
 * 認証状態確認中やデータ読み込み中に表示する。
 */
import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

/** ローディング画面 */
export function LoadingScreen(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
