/**
 * OTP 表示コンポーネント
 *
 * 発行された OTP コードとカウントダウンタイマーを表示する。
 * 期限切れ時にコールバックを呼び出す。
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../contexts/ThemeContext";

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
  const { colors } = useTheme();
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
    <View style={[styles.container, { backgroundColor: colors.cardOrange }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        OTP コード
      </Text>
      <Text style={[styles.otpCode, { color: colors.otpCode }]}>{otp}</Text>
      <Text
        style={[
          styles.timer,
          { color: colors.textSecondary },
          isExpiring && { color: colors.timerExpiring, fontWeight: "600" },
        ]}
      >
        残り {formatRemaining(remaining)}
      </Text>
      <Text style={[styles.hint, { color: colors.textTertiary }]}>
        このコードを子供のデバイスの拡張機能設定画面で入力してください
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 28,
    padding: 24,
    marginTop: 12,
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    marginBottom: 12,
  },
  otpCode: {
    fontSize: 48,
    fontWeight: "bold",
    letterSpacing: 8,
    marginBottom: 12,
  },
  timer: {
    fontSize: 16,
    marginBottom: 12,
  },
  hint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});
