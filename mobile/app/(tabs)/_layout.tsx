/**
 * タブナビゲーションレイアウト
 *
 * ホーム・デバイス管理・設定の3タブ構成。
 */
import React from "react";
import { Tabs } from "expo-router";
import { Text } from "react-native";

/** タブアイコン用テキストコンポーネント */
function TabIcon({
  emoji,
  focused,
}: {
  emoji: string;
  focused: boolean;
}): React.JSX.Element {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

export default function TabsLayout(): React.JSX.Element {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#4285F4",
        tabBarInactiveTintColor: "#888",
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: "デバイス",
          tabBarIcon: ({ focused }) => <TabIcon emoji="📱" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "設定",
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
