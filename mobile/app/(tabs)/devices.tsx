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

/** OTP 発行状態 */
interface OtpState {
  otp: string;
  expiresIn: number;
}

export default function DevicesScreen(): React.JSX.Element {
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
    <SafeAreaView style={styles.container}>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.deviceId}
        ListHeaderComponent={
          <View>
            {/* OTP 発行セクション */}
            <View style={styles.addDeviceSection}>
              <Text style={styles.sectionTitle}>デバイスを追加</Text>
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
                    generating && styles.addButtonDisabled,
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
            </View>

            {/* デバイス一覧ヘッダー */}
            {devices.length > 0 && (
              <Text style={styles.listTitle}>
                登録済みデバイス ({devices.length}台)
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <DeviceCard
            deviceName={item.deviceName}
            registeredAt={item.registeredAt}
            syncAvailable={item.syncAvailable}
            lastSeenAt={item.lastSeenAt}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>登録済みのデバイスはありません</Text>
            <Text style={styles.emptyHint}>
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
    backgroundColor: "#F5F5F5",
  },
  listContent: {
    paddingBottom: 24,
  },
  addDeviceSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#555",
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: "#4285F4",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  addButtonDisabled: {
    backgroundColor: "#A0C4FF",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#555",
    marginTop: 24,
    marginHorizontal: 16,
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 32,
  },
  emptyText: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 13,
    color: "#AAA",
    textAlign: "center",
    lineHeight: 20,
  },
});
