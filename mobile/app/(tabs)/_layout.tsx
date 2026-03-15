/**
 * タブナビゲーションレイアウト
 *
 * ホーム・デバイス管理・設定の3タブ構成。
 * テーマ対応のアクティブ/インアクティブカラー。
 */
import React from "react";
import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useTheme } from "../../contexts/ThemeContext";

/** タブアイコン用テキストコンポーネント */
function TabIcon({
  label,
  focused,
  activeColor,
  inactiveColor,
}: {
  label: string;
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
}): React.JSX.Element {
  return (
    <Text
      style={{
        fontSize: 20,
        color: focused ? activeColor : inactiveColor,
      }}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="🏠"
              focused={focused}
              activeColor={colors.tabActive}
              inactiveColor={colors.tabInactive}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: "デバイス",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="💻"
              focused={focused}
              activeColor={colors.tabActive}
              inactiveColor={colors.tabInactive}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "設定",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="⚙️"
              focused={focused}
              activeColor={colors.tabActive}
              inactiveColor={colors.tabInactive}
            />
          ),
        }}
      />
    </Tabs>
  );
}
