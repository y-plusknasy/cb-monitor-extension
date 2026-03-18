/**
 * Firebase Auth 認証フック
 *
 * Firebase Auth の認証状態を監視し、Google SSO サインイン・サインアウト機能を提供する。
 *
 * プラットフォーム別の認証方式:
 * - Web: Firebase Auth の signInWithPopup を使用（Emulator 接続時は Emulator の認証UIが開く）
 * - Native (iOS/Android): @react-native-google-signin/google-signin でネイティブ
 *   Google Sign-In UI を呼び出し、取得した idToken で Firebase Auth にサインイン
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
import { auth } from "../lib/firebase";
import { WEB_CLIENT_ID } from "../lib/constants";

// Native 専用: @react-native-google-signin/google-signin
// Web では利用しないため、Platform ガードの中でのみ import する
let GoogleSignin:
  | typeof import("@react-native-google-signin/google-signin").GoogleSignin
  | undefined;
if (Platform.OS !== "web") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@react-native-google-signin/google-signin");
  GoogleSignin = mod.GoogleSignin;
  GoogleSignin!.configure({ webClientId: WEB_CLIENT_ID });
}

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
 * - Web: signInWithPopup で Google SSO を実行
 * - Native: @react-native-google-signin/google-signin → Firebase credential でサインイン
 */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const isEmulator = process.env.EXPO_PUBLIC_USE_EMULATOR === "true";

  // Firebase Auth 状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /** Google SSO でサインインを開始 */
  const signInWithGoogle = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        // Web: Firebase Auth の signInWithPopup を使用
        // Emulator 接続時は Emulator の認証UIが自動的に開く
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } else {
        // Native: @react-native-google-signin/google-signin を使用
        await GoogleSignin!.hasPlayServices();
        const response = await GoogleSignin!.signIn();
        const idToken =
          response.type === "success" ? response.data.idToken : null;
        if (!idToken) {
          throw new Error("Google Sign-In did not return an idToken");
        }
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      }
    } catch (error) {
      console.error("[useAuth] Google Sign-In failed:", error);
    }
  }, []);

  /** サインアウト */
  const signOut = useCallback(async () => {
    try {
      if (Platform.OS !== "web" && GoogleSignin) {
        await GoogleSignin.signOut();
      }
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
