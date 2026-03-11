/**
 * ローディング画面コンポーネント
 *
 * 認証状態確認中やデータ読み込み中に表示する。
 */
import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";

/** ローディング画面 */
export function LoadingScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4285F4" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
});
