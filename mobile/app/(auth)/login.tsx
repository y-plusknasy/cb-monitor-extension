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

export default function LoginScreen(): React.JSX.Element {
  const { signInWithGoogle, signInWithEmail, isEmulator } = useAuth();
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Web Usage Tracker</Text>
        <Text style={styles.subtitle}>
          子供のブラウザ利用時間を{"\n"}リアルタイムに確認
        </Text>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={signInWithGoogle}
          activeOpacity={0.8}
        >
          <Text style={styles.googleButtonText}>Google でサインイン</Text>
        </TouchableOpacity>

        {isEmulator && (
          <View style={styles.emulatorSection}>
            <Text style={styles.emulatorLabel}>Emulator テストログイン</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="メールアドレス"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="パスワード"
              secureTextEntry
            />
            <TouchableOpacity
              style={styles.emulatorButton}
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
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 48,
    lineHeight: 24,
  },
  googleButton: {
    backgroundColor: "#4285F4",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: "100%",
    alignItems: "center",
    shadowColor: "#4285F4",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
    borderTopColor: "#E0E0E0",
  },
  emulatorLabel: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: "#FAFAFA",
  },
  emulatorButton: {
    backgroundColor: "#757575",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  emulatorButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
