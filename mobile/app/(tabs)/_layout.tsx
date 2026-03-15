/**
 * タブナビゲーションレイアウト
 *
 * ホーム・デバイス管理・設定の3タブ構成。
 * テーマ対応のアクティブ/インアクティブカラー。
 */
import React from "react";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { Home, Laptop, Settings } from "lucide-react-native";
import { useTheme } from "../../contexts/ThemeContext";

/** タブアイコン用テキストコンポーネント */
function TabIcon({
  label,
  focused,
  activeColor,
  inactiveColor,
}: {
  label: React.ReactNode;
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
}): React.JSX.Element {
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </View>
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
          height: 60,
          paddingBottom: 6,
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
              label={
                <Home
                  size={24}
                  color={focused ? colors.tabActive : colors.tabInactive}
                />
              }
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
              label={
                <Laptop
                  size={24}
                  color={focused ? colors.tabActive : colors.tabInactive}
                />
              }
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
              label={
                <Settings
                  size={24}
                  color={focused ? colors.tabActive : colors.tabInactive}
                />
              }
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
