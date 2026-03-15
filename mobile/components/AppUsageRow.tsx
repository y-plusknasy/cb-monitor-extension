/**
 * アプリ別利用時間行コンポーネント
 *
 * アプリごとの利用時間を1行で表示する。
 * iconUrl が指定されていればそれを使用し、
 * 未指定の場合は favicon をフォールバックとする。
 * displayName が指定されていればそれを表示名に使用する。
 */
import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { formatDuration } from "../lib/formatters";
import {
  APP_NAME_CHROME_BROWSER,
  DEFAULT_APP_DISPLAY_NAMES,
} from "../lib/constants";
import { useTheme } from "../contexts/ThemeContext";

/** Props */
interface AppUsageRowProps {
  /** アプリ識別名（ドメイン名 or "chrome"） */
  appName: string;
  /** 利用秒数 */
  totalSeconds: number;
  /** アプリ表示名（appRegistry から取得。未指定時は appName をそのまま表示） */
  displayName?: string;
  /** アプリアイコン URL（appRegistry から取得。未指定時は favicon をフォールバック） */
  iconUrl?: string;
}

/**
 * appName を表示用の名前に変換する。
 *
 * 1. displayName が指定されていればそれを返す
 * 2. DEFAULT_APP_DISPLAY_NAMES にマッチすればそれを返す
 * 3. それ以外はドメイン名をそのまま返す
 */
function resolveDisplayName(appName: string, displayName?: string): string {
  if (displayName) return displayName;
  return DEFAULT_APP_DISPLAY_NAMES[appName] ?? appName;
}

/**
 * アイコン URL を決定する。
 *
 * 1. iconUrl が指定されていればそれを返す
 * 2. "chrome" や "unknown" の場合は null
 * 3. その他のドメインは Google favicon API を使用
 */
function resolveIconUrl(appName: string, iconUrl?: string): string | null {
  if (iconUrl) return iconUrl;
  if (appName === APP_NAME_CHROME_BROWSER || appName === "unknown") {
    return null;
  }
  return `https://www.google.com/s2/favicons?domain=${appName}&sz=64`;
}

/** 0 分（59 秒以下）の場合は非表示とする閾値 */
const MIN_DISPLAY_SECONDS = 60;

/** アプリ別利用時間行（totalSeconds < 60 の場合は null を返す） */
export function AppUsageRow({
  appName,
  totalSeconds,
  displayName,
  iconUrl,
}: AppUsageRowProps): React.JSX.Element | null {
  const { colors } = useTheme();

  if (totalSeconds < MIN_DISPLAY_SECONDS) {
    return null;
  }

  const resolvedName = resolveDisplayName(appName, displayName);
  const resolvedIcon = resolveIconUrl(appName, iconUrl);

  return (
    <View style={[styles.row, { backgroundColor: colors.card }]}>
      <View style={styles.iconContainer}>
        {resolvedIcon ? (
          <Image source={{ uri: resolvedIcon }} style={styles.icon} />
        ) : (
          <View
            style={[
              styles.iconPlaceholder,
              { backgroundColor: colors.cardGray },
            ]}
          >
            <Text style={styles.iconText}>
              {appName === APP_NAME_CHROME_BROWSER ? "🌐" : "❓"}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={[styles.appName, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {resolvedName}
      </Text>
      <Text style={[styles.duration, { color: colors.textSecondary }]}>
        {formatDuration(totalSeconds)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    marginRight: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  iconPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontSize: 16,
  },
  appName: {
    flex: 1,
    fontSize: 15,
  },
  duration: {
    fontSize: 15,
    marginLeft: 8,
  },
});
