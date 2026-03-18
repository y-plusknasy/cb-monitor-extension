/**
 * Firebase JS SDK 初期化
 *
 * Firebase Auth と Firestore のインスタンスをエクスポートする。
 * 設定値は環境変数から提供する。
 *
 * EXPO_PUBLIC_USE_EMULATOR=true の場合、Firebase Emulator に接続する。
 * Emulator 使用時は apiKey / appId 等はダミー値でも動作する。
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  connectAuthEmulator,
  type Auth,
  type Persistence,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Firebase 設定。
 * Expo の環境変数 (EXPO_PUBLIC_*) から読み込む。
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "fake-api-key",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId:
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "cb-monitor-extension",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "1:000:web:fake",
};

/** Emulator 使用フラグ */
const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === "true";

/** Emulator ホスト（デフォルト: localhost） */
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? "localhost";

/** Firebase App インスタンスを取得（未初期化なら初期化） */
function getFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

/** Firebase App シングルトン */
const app = getFirebaseApp();

/**
 * Firebase Auth インスタンス
 *
 * Native (iOS/Android) では AsyncStorage を使ってセッションを永続化する。
 * Web では getAuth のデフォルト永続化（IndexedDB）をそのまま使用する。
 */
function createAuth(firebaseApp: FirebaseApp): Auth {
  if (Platform.OS === "web") {
    return getAuth(firebaseApp);
  }
  // getReactNativePersistence は react-native condition でのみエクスポートされ、
  // TypeScript の型定義には含まれない。Metro バンドラーでは正しくリゾルブされる。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getReactNativePersistence } = require("firebase/auth");
  return initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage) as Persistence,
  });
}

export const auth: Auth = createAuth(app);

/** Firestore インスタンス */
export const db: Firestore = getFirestore(app);

/**
 * Emulator 接続（USE_EMULATOR=true の場合のみ）
 *
 * connectAuthEmulator / connectFirestoreEmulator は
 * 同一インスタンスに対して1回のみ呼び出し可能。
 * フラグで二重呼び出しを防止する。
 */
let emulatorConnected = false;

if (USE_EMULATOR && !emulatorConnected) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  emulatorConnected = true;
  console.log(
    `[Firebase] Emulator に接続: Auth=${EMULATOR_HOST}:9099, Firestore=${EMULATOR_HOST}:8080`,
  );
}

export default app;
