/**
 * 設定画面
 *
 * アカウント情報の表示とログアウト機能を提供する。
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
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";

export default function SettingsScreen(): React.JSX.Element {
  const { user, signOut } = useAuth();
  const router = useRouter();

  /** サインアウト実行 */
  const performSignOut = async () => {
    try {
      await signOut();
      // auth guard（_layout.tsx）がリダイレクトを担当するが、
      // Web では onAuthStateChanged の反映にラグがある場合があるため、
      // 明示的にログイン画面へ遷移する
      router.replace("/(auth)/login");
    } catch (error) {
      console.error("[SettingsScreen] sign out failed:", error);
    }
  };

  /** ログアウト確認ダイアログ */
  const handleSignOut = () => {
    if (Platform.OS === "web") {
      // react-native-web の Alert.alert はコールバック呼び出しが不安定なため、
      // Web では window.confirm を使用する
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
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* アカウント情報セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>アカウント情報</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>表示名</Text>
              <Text style={styles.infoValue}>
                {user?.displayName ?? "未設定"}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>メールアドレス</Text>
              <Text style={styles.infoValue}>{user?.email ?? "未設定"}</Text>
            </View>
          </View>
        </View>

        {/* ログアウトボタン */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Text style={styles.signOutButtonText}>ログアウト</Text>
          </TouchableOpacity>
        </View>

        {/* アプリ情報 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Web Usage Tracker v1.0.0</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  content: {
    flex: 1,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    marginHorizontal: 16,
    marginBottom: 8,
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: {
    fontSize: 15,
    color: "#555",
  },
  infoValue: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 16,
  },
  signOutButton: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D32F2F",
  },
  signOutButtonText: {
    color: "#D32F2F",
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
    color: "#CCC",
  },
});
