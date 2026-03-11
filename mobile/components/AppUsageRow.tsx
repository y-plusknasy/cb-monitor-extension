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

/** アプリ別利用時間行 */
export function AppUsageRow({
  appName,
  totalSeconds,
  displayName,
  iconUrl,
}: AppUsageRowProps): React.JSX.Element {
  const resolvedName = resolveDisplayName(appName, displayName);
  const resolvedIcon = resolveIconUrl(appName, iconUrl);

  return (
    <View style={styles.row}>
      <View style={styles.iconContainer}>
        {resolvedIcon ? (
          <Image source={{ uri: resolvedIcon }} style={styles.icon} />
        ) : (
          <View style={styles.iconPlaceholder}>
            <Text style={styles.iconText}>
              {appName === APP_NAME_CHROME_BROWSER ? "🌐" : "❓"}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.appName} numberOfLines={1}>
        {resolvedName}
      </Text>
      <Text style={styles.duration}>{formatDuration(totalSeconds)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E0E0",
  },
  iconContainer: {
    width: 32,
    height: 32,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  iconPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  iconText: {
    fontSize: 18,
  },
  appName: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  duration: {
    fontSize: 16,
    fontWeight: "600",
    color: "#555",
    marginLeft: 8,
  },
});
