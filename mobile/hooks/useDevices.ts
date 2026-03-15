/**
 * デバイス一覧取得フック
 *
 * Firestore の users/{uid} ドキュメント (childDevices) と
 * devices コレクション (syncAvailable, lastSeenAt) を onSnapshot で購読し、
 * 登録済みデバイスの詳細情報をリアルタイムに取得する。
 */
import { useState, useEffect } from "react";
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { COLLECTION_USERS, COLLECTION_DEVICES } from "../lib/constants";

/** デバイス情報の型 */
export interface DeviceInfo {
  /** デバイス UUID */
  deviceId: string;
  /** デバイス名 */
  deviceName: string;
  /** 登録日時 (ISO8601) */
  registeredAt: string;
  /** chrome.storage.sync の利用可否（null = 未判定） */
  syncAvailable: boolean | null;
  /** 最終データ受信日時 (ISO8601)。null = まだデータ受信なし */
  lastSeenAt: string | null;
}

/** useDevices の戻り値型 */
export interface DevicesState {
  /** 登録済みデバイス一覧 */
  devices: DeviceInfo[];
  /** 読み込み中フラグ */
  loading: boolean;
  /** エラー */
  error: Error | null;
}

/**
 * Firestore Timestamp を ISO8601 文字列に変換する。
 * Timestamp 型でない場合は null を返す。
 */
function timestampToIso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as Timestamp).toDate().toISOString();
  }
  return null;
}

/**
 * 登録デバイス一覧をリアルタイムに取得するカスタムフック。
 *
 * uid が指定されている場合のみ Firestore リスナーを開始する。
 * users/{uid}.childDevices と devices コレクションの情報をマージして返す。
 *
 * @param uid - 保護者の Firebase Auth UID
 */
export function useDevices(uid: string | undefined): DevicesState {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setDevices([]);
      setLoading(false);
      return;
    }

    // users/{uid}.childDevices の基本情報を保持
    type ChildDeviceBasic = {
      deviceId: string;
      deviceName: string;
      registeredAt: string;
    };
    let childDevicesBasic: ChildDeviceBasic[] = [];

    // devices コレクションの追加情報を保持
    type DeviceExtra = {
      syncAvailable: boolean | null;
      lastSeenAt: string | null;
    };
    let deviceExtras = new Map<string, DeviceExtra>();

    let userLoaded = false;
    let devicesLoaded = false;

    /** 両方のリスナーからデータが揃ったらマージして更新 */
    function mergeAndUpdate() {
      if (!userLoaded || !devicesLoaded) return;

      const merged: DeviceInfo[] = childDevicesBasic.map((d) => {
        const extra = deviceExtras.get(d.deviceId);
        return {
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          registeredAt: d.registeredAt,
          syncAvailable: extra?.syncAvailable ?? null,
          lastSeenAt: extra?.lastSeenAt ?? null,
        };
      });

      setDevices(merged);
      setLoading(false);
      setError(null);
    }

    // リスナー 1: users/{uid} の childDevices
    const userRef = doc(db, COLLECTION_USERS, uid);
    const unsubUser = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          childDevicesBasic =
            (data.childDevices as ChildDeviceBasic[] | undefined) ?? [];
        } else {
          childDevicesBasic = [];
        }
        userLoaded = true;
        mergeAndUpdate();
      },
      (err) => {
        console.error("[useDevices] user onSnapshot error:", err);
        setError(err);
        setLoading(false);
      },
    );

    // リスナー 2: devices コレクション (parentIds array-contains uid)
    const devicesQuery = query(
      collection(db, COLLECTION_DEVICES),
      where("parentIds", "array-contains", uid),
    );
    const unsubDevices = onSnapshot(
      devicesQuery,
      (snapshot) => {
        const extras = new Map<string, DeviceExtra>();
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          extras.set(docSnap.id, {
            syncAvailable: (data.syncAvailable as boolean | null) ?? null,
            lastSeenAt: timestampToIso(data.lastSeenAt),
          });
        }
        deviceExtras = extras;
        devicesLoaded = true;
        mergeAndUpdate();
      },
      (err) => {
        console.error("[useDevices] devices onSnapshot error:", err);
        setError(err);
        setLoading(false);
      },
    );

    return () => {
      unsubUser();
      unsubDevices();
    };
  }, [uid]);

  return { devices, loading, error };
}
