/**
 * OTP 表示コンポーネント
 *
 * 発行された OTP コードとカウントダウンタイマーを表示する。
 * 期限切れ時にコールバックを呼び出す。
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";

/** Props */
interface OtpDisplayProps {
  /** OTP コード（6桁数字） */
  otp: string;
  /** 有効期限（秒） */
  expiresIn: number;
  /** 期限切れ時のコールバック */
  onExpired: () => void;
}

/**
 * OTP コードと残り時間を表示するコンポーネント。
 *
 * カウントダウンタイマーで残り時間を表示し、
 * 期限切れ時に onExpired コールバックを呼び出す。
 */
export function OtpDisplay({
  otp,
  expiresIn,
  onExpired,
}: OtpDisplayProps): React.JSX.Element {
  const [remaining, setRemaining] = useState(expiresIn);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    setRemaining(expiresIn);
  }, [expiresIn, otp]);

  useEffect(() => {
    if (remaining <= 0) {
      onExpiredRef.current();
      return;
    }

    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remaining]);

  /** 残り時間をフォーマット（M:SS） */
  const formatRemaining = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, []);

  const isExpiring = remaining <= 60;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>OTP コード</Text>
      <Text style={styles.otpCode}>{otp}</Text>
      <Text style={[styles.timer, isExpiring && styles.timerExpiring]}>
        残り {formatRemaining(remaining)}
      </Text>
      <Text style={styles.hint}>
        このコードを子供のデバイスの拡張機能設定画面で入力してください
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF3E0",
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  otpCode: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#E65100",
    letterSpacing: 8,
    marginBottom: 8,
  },
  timer: {
    fontSize: 16,
    color: "#888",
    marginBottom: 8,
  },
  timerExpiring: {
    color: "#D32F2F",
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
  },
});
