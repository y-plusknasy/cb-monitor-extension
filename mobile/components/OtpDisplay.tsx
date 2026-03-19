/**
 * OTP 表示コンポーネント
 *
 * 発行された OTP コードとカウントダウンタイマーを表示する。
 * 期限切れ時にコールバックを呼び出す。
 *
 * 残り時間は expiresIn 受信時の絶対時刻から算出するため、
 * アプリがバックグラウンドにある間もカウントダウンが正しく進む。
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
 * expiresIn を受け取った時点で有効期限の絶対時刻を確定し、
 * Date.now() との差分で残り時間を計算する。
 * アプリのアクティブ/非アクティブに関わらず正確にカウントダウンする。
 */
export function OtpDisplay({
  otp,
  expiresIn,
  onExpired,
}: OtpDisplayProps): React.JSX.Element {
  const { colors } = useTheme();
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  // expiresIn 受信時に有効期限の絶対時刻を確定
  const [expiresAt, setExpiresAt] = useState(
    () => Date.now() + expiresIn * 1000,
  );
  const [remaining, setRemaining] = useState(expiresIn);

  // otp または expiresIn が変わったら有効期限を再計算
  useEffect(() => {
    setExpiresAt(Date.now() + expiresIn * 1000);
  }, [expiresIn, otp]);

  useEffect(() => {
    /** 現在時刻から残り秒数を計算 */
    const calcRemaining = () =>
      Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));

    setRemaining(calcRemaining());

    const timer = setInterval(() => {
      const r = calcRemaining();
      setRemaining(r);
      if (r <= 0) {
        clearInterval(timer);
        onExpiredRef.current();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

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
