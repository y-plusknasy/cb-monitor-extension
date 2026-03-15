/**
 * デバイス管理画面
 *
 * 登録済みデバイスの一覧表示と OTP 発行を行う。
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { useDevices } from "../../hooks/useDevices";
import { DeviceCard } from "../../components/DeviceCard";
import { OtpDisplay } from "../../components/OtpDisplay";
import { LoadingScreen } from "../../components/LoadingScreen";
import { API_BASE_URL, OTP_EXPIRY_SECONDS } from "../../lib/constants";
import { useTheme } from "../../contexts/ThemeContext";

/** OTP 発行状態 */
interface OtpState {
  otp: string;
  expiresIn: number;
}

export default function DevicesScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { devices, loading } = useDevices(user?.uid);
  const [otpState, setOtpState] = useState<OtpState | null>(null);
  const [generating, setGenerating] = useState(false);

  /**
   * OTP を発行する。
   * Firebase Functions の generateOtp エンドポイントに POST リクエストを送信する。
   */
  const handleGenerateOtp = useCallback(async () => {
    if (!user) return;

    setGenerating(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`${API_BASE_URL}/generateOtp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as Record<string, string>).error ??
            "OTP generation failed",
        );
      }

      const data = (await response.json()) as {
        otp: string;
        expiresIn: number;
      };
      setOtpState({
        otp: data.otp,
        expiresIn: data.expiresIn ?? OTP_EXPIRY_SECONDS,
      });
    } catch (error) {
      console.error("[DevicesScreen] generateOtp failed:", error);
      Alert.alert(
        "エラー",
        "OTP の発行に失敗しました。しばらく経ってから再度お試しください。",
      );
    } finally {
      setGenerating(false);
    }
  }, [user]);

  /** OTP 期限切れハンドラ */
  const handleOtpExpired = useCallback(() => {
    setOtpState(null);
  }, []);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <FlatList
        data={devices}
        keyExtractor={(item) => item.deviceId}
        ListHeaderComponent={
          <View>
            {/* OTP 発行セクション */}
            <View
              style={[styles.addDeviceCard, { backgroundColor: colors.card }]}
            >
              <Text
                style={[styles.sectionTitle, { color: colors.textSecondary }]}
              >
                デバイスを追加
              </Text>
              {otpState ? (
                <OtpDisplay
                  otp={otpState.otp}
                  expiresIn={otpState.expiresIn}
                  onExpired={handleOtpExpired}
                />
              ) : (
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    { backgroundColor: colors.primary },
                    generating && { backgroundColor: colors.primaryDisabled },
                  ]}
                  onPress={handleGenerateOtp}
                  disabled={generating}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addButtonText}>
                    {generating ? "発行中..." : "OTP を発行する"}
                  </Text>
                </TouchableOpacity>
              )}

              {/* デバイス一覧ヘッダー */}
              {devices.length > 0 && (
                <Text
                  style={[styles.listTitle, { color: colors.textSecondary }]}
                >
                  登録済みデバイス ({devices.length}台)
                </Text>
              )}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <DeviceCard
            deviceId={item.deviceId}
            deviceName={item.deviceName}
            registeredAt={item.registeredAt}
            syncAvailable={item.syncAvailable}
            lastSeenAt={item.lastSeenAt}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              登録済みのデバイスはありません
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textHint }]}>
              上のボタンから OTP を発行し、子供のデバイスの{"\n"}
              Chrome 拡張機能で入力してください
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  addDeviceCard: {
    borderRadius: 28,
    padding: 24,
    marginHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
  },
  addButton: {
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: "center",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 24,
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});
