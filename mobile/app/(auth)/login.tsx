/**
 * ログイン画面
 *
 * Google SSO ボタンを表示し、保護者の認証を行う。
 * Emulator 接続時はメール/パスワードによるテストログインも表示する。
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../contexts/ThemeContext";

export default function LoginScreen(): React.JSX.Element {
  const { signInWithGoogle, signInWithEmail, isEmulator } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          CB LINK
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Chromebook 利用時間の{"\n"}リアルタイムレポート
        </Text>

        <TouchableOpacity
          style={[styles.googleButton, { backgroundColor: colors.primary }]}
          onPress={signInWithGoogle}
          activeOpacity={0.8}
        >
          <Text style={styles.googleButtonText}>Google でサインイン</Text>
        </TouchableOpacity>

        {isEmulator && (
          <View
            style={[styles.emulatorSection, { borderTopColor: colors.border }]}
          >
            <Text
              style={[styles.emulatorLabel, { color: colors.textTertiary }]}
            >
              Emulator テストログイン
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              placeholder="メールアドレス"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="パスワード"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
            />
            <TouchableOpacity
              style={[
                styles.emulatorButton,
                { backgroundColor: colors.primaryPressed },
              ]}
              onPress={() => signInWithEmail(email, password)}
              activeOpacity={0.8}
            >
              <Text style={styles.emulatorButtonText}>
                メール/パスワードでログイン
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: "bold",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 48,
    lineHeight: 24,
  },
  googleButton: {
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
  },
  googleButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emulatorSection: {
    marginTop: 32,
    width: "100%",
    paddingTop: 24,
    borderTopWidth: 1,
  },
  emulatorLabel: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 24,
    fontSize: 14,
    marginBottom: 10,
  },
  emulatorButton: {
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  emulatorButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
