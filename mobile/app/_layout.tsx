/**
 * Root Layout
 *
 * アプリ全体のルートレイアウト。
 * 認証状態に応じて (auth) または (tabs) グループにリダイレクトする。
 */
import React from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/LoadingScreen";

/**
 * 認証ガード付きルートレイアウト。
 *
 * - 認証状態読み込み中 → ローディング画面を表示
 * - 未認証 + (tabs) セグメント → (auth)/login にリダイレクト
 * - 認証済み + (auth) セグメント → (tabs)/ にリダイレクト
 */
export default function RootLayout(): React.JSX.Element {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      // 未認証 → ログイン画面へ
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      // 認証済み → ホーム画面へ
      router.replace("/(tabs)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return <LoadingScreen />;
  }

  return <Slot />;
}
