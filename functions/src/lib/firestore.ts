import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK が未初期化であれば初期化する。
 */
function ensureInitialized(): void {
  if (getApps().length === 0) {
    initializeApp();
  }
}

/**
 * Firebase Admin SDK を初期化し、Firestore インスタンスを返す。
 * Firebase Functions 環境ではデフォルト認証情報を使用。
 * Emulator 環境では FIRESTORE_EMULATOR_HOST 環境変数で自動接続される。
 */
export function getDb(): FirebaseFirestore.Firestore {
  ensureInitialized();
  return getFirestore();
}

/**
 * Firebase Admin SDK を初期化し、Auth インスタンスを返す。
 * Emulator 環境では FIREBASE_AUTH_EMULATOR_HOST 環境変数で自動接続される。
 */
export function getAdminAuth(): Auth {
  ensureInitialized();
  return getAuth();
}
