import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK を初期化し、Firestore インスタンスを返す。
 * Firebase Functions 環境ではデフォルト認証情報を使用。
 * Emulator 環境では FIRESTORE_EMULATOR_HOST 環境変数で自動接続される。
 */
export function getDb(): FirebaseFirestore.Firestore {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
}
