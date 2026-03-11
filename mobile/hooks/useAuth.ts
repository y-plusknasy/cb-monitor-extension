/**
 * Firebase Auth 認証フック
 *
 * Firebase Auth の認証状態を監視し、Google SSO サインイン・サインアウト機能を提供する。
 *
 * プラットフォーム別の認証方式:
 * - Web: Firebase Auth の signInWithPopup を使用（expo-auth-session は COOP ヘッダーにより
 *   window.closed を検知できず動作しないため）。Emulator 接続時は Emulator の認証UIが開く。
 * - Native (iOS/Android): expo-auth-session + Firebase credential を使用
 */
import { useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import {
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { auth } from "../lib/firebase";
import { WEB_CLIENT_ID } from "../lib/constants";

// Expo の WebBrowser セッションを完了するために必要
WebBrowser.maybeCompleteAuthSession();

/** useAuth の戻り値型 */
export interface AuthState {
  /** 現在の認証ユーザー（未認証の場合 null） */
  user: User | null;
  /** 認証状態の読み込み中フラグ */
  loading: boolean;
  /** Google SSO でサインイン */
  signInWithGoogle: () => Promise<void>;
  /** メール/パスワードでサインイン（Emulator テスト用） */
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** サインアウト */
  signOut: () => Promise<void>;
  /** Emulator 接続中かどうか */
  isEmulator: boolean;
}

/**
 * Firebase Auth の認証状態を管理するカスタムフック。
 *
 * - onAuthStateChanged で認証状態をリアルタイム監視
 * - Web: signInWithPopup で Google SSO を実行（COOP 問題を回避）
 * - Native: expo-auth-session で Google SSO を実行 → Firebase credential でサインイン
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isEmulator = process.env.EXPO_PUBLIC_USE_EMULATOR === "true";

  // Google OAuth リクエスト設定（Native 用。Web でもフック呼び出しは必須だが使用しない）
  const [, response, promptAsync] = Google.useAuthRequest({
    webClientId: WEB_CLIENT_ID,
    // Android / iOS の clientId は app.json の plugins で設定
  });

  // Firebase Auth 状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Native: Google SSO のレスポンスを処理
  useEffect(() => {
    if (Platform.OS !== "web" && response?.type === "success") {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential).catch((error) => {
        console.error("[useAuth] signInWithCredential failed:", error);
      });
    }
  }, [response]);

  /** Google SSO でサインインを開始 */
  const signInWithGoogle = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        // Web: Firebase Auth の signInWithPopup を使用
        // Emulator 接続時は Emulator の認証UIが自動的に開く
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } else {
        // Native: expo-auth-session を使用
        await promptAsync();
      }
    } catch (error) {
      console.error("[useAuth] Google Sign-In failed:", error);
    }
  }, [promptAsync]);

  /** サインアウト */
  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("[useAuth] Sign out failed:", error);
    }
  }, []);

  /** メール/パスワードでサインイン（Emulator テスト用） */
  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        console.error("[useAuth] Email Sign-In failed:", error);
      }
    },
    [],
  );

  return {
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signOut,
    isEmulator,
  };
}
