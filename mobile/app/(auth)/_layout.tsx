/**
 * Auth グループレイアウト
 *
 * 認証関連画面（ログイン画面）のレイアウト。
 * ヘッダーを非表示にする。
 */
import React from "react";
import { Stack } from "expo-router";

export default function AuthLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
