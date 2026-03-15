/**
 * 設定画面
 *
 * アカウント情報の表示、テーマ切り替え、ログアウト機能を提供する。
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Platform,
} from "react-native";
import { Sun, Moon } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../contexts/ThemeContext";

export default function SettingsScreen(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { theme, colors, toggleTheme } = useTheme();

  /** サインアウト実行 */
  const performSignOut = async () => {
    try {
      await signOut();
      router.replace("/(auth)/login");
    } catch (error) {
      console.error("[SettingsScreen] sign out failed:", error);
    }
  };

  /** ログアウト確認ダイアログ */
  const handleSignOut = () => {
    if (Platform.OS === "web") {
      if (window.confirm("ログアウトしますか？")) {
        performSignOut();
      }
    } else {
      Alert.alert("ログアウト", "ログアウトしますか？", [
        { text: "キャンセル", style: "cancel" },
        {
          text: "ログアウト",
          style: "destructive",
          onPress: () => performSignOut(),
        },
      ]);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        {/* テーマ設定セクション */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            表示設定
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={styles.themeRow}
              onPress={toggleTheme}
              activeOpacity={0.7}
            >
              <View style={styles.themeLabel}>
                <View style={styles.themeIcon}>
                  {theme === "dark" ? (
                    <Moon size={20} color={colors.textSecondary} />
                  ) : (
                    <Sun size={20} color={colors.textSecondary} />
                  )}
                </View>
                <Text style={[styles.infoLabel, { color: colors.textPrimary }]}>
                  テーマ
                </Text>
              </View>
              <Text
                style={[styles.themeValue, { color: colors.textSecondary }]}
              >
                {theme === "dark" ? "ダーク" : "ライト"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* アカウント情報セクション */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            アカウント情報
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                表示名
              </Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                {user?.displayName ?? "未設定"}
              </Text>
            </View>
            <View
              style={[styles.divider, { backgroundColor: colors.border }]}
            />
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                メールアドレス
              </Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                {user?.email ?? "未設定"}
              </Text>
            </View>
          </View>
        </View>

        {/* ログアウトボタン */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.signOutButton,
              { borderColor: colors.accent, backgroundColor: colors.accent },
            ]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.signOutButtonText, { color: colors.background }]}
            >
              ログアウト
            </Text>
          </TouchableOpacity>
        </View>

        {/* アプリ情報 */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textHint }]}>
            CB Link v1.0.0
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  card: {
    borderRadius: 28,
    padding: 8,
    overflow: "hidden",
  },
  themeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  themeLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  themeIcon: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  themeValue: {
    fontSize: 15,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  infoLabel: {
    fontSize: 15,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  signOutButton: {
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 2,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 12,
  },
});
