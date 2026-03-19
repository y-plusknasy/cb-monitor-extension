/**
 * テーマ定数
 *
 * ライト/ダークテーマのカラーパレットを定義する。
 * design-assets/ のカラーテーマ定義に基づく。
 */

/** テーマ種別 */
export type ThemeType = "light" | "dark";

/** カラーパレット型定義 */
export interface ThemeColors {
  /** メイン背景 */
  background: string;
  /** カード背景 */
  card: string;
  /** グレーカード背景（サマリーカード等） */
  cardGray: string;
  /** オレンジカード背景（OTP 表示等） */
  cardOrange: string;
  /** プライマリアクセント（ボタン、アクティブ状態） */
  primary: string;
  /** プライマリアクセント（ホバー / プレス時） */
  primaryPressed: string;
  /** プライマリアクセント（無効時） */
  primaryDisabled: string;
  /** 数値強調表示 */
  accent: string;
  /** 警告・ログアウト */
  warning: string;
  /** 見出しテキスト */
  textPrimary: string;
  /** ボディテキスト */
  textSecondary: string;
  /** 補足テキスト・非アクティブ */
  textTertiary: string;
  /** ごく薄いテキスト（ヒント等） */
  textHint: string;
  /** ボーダー・区切り線 */
  border: string;
  /** OTP コードテキスト */
  otpCode: string;
  /** タイマー期限切れ警告 */
  timerExpiring: string;
  /** バーチャートのアクティブバー */
  chartBar: string;
  /** バーチャートの選択中バー */
  chartBarSelected: string;
  /** バーチャートの空バー */
  chartBarEmpty: string;
  /** タブバー背景 */
  tabBar: string;
  /** タブバーアクティブ */
  tabActive: string;
  /** タブバー非アクティブ */
  tabInactive: string;
  /** デバイスカード左ボーダー */
  deviceBorder: string;
  /** sync 警告テキスト */
  syncWarningText: string;
  /** sync 警告背景 */
  syncWarningBg: string;
}

/** ライトテーマ カラーパレット */
export const lightColors: ThemeColors = {
  background: "#F9FAFB",
  card: "#FFFFFF",
  cardGray: "#F3F4F6",
  cardOrange: "#FFFAF0",
  primary: "#4285F4",
  primaryPressed: "#3367D6",
  primaryDisabled: "#A0C4FF",
  accent: "#1565C0",
  warning: "#FF6F00",
  textPrimary: "#1F2937",
  textSecondary: "#4B5563",
  textTertiary: "#6B7280",
  textHint: "#9CA3AF",
  border: "#E5E7EB",
  otpCode: "#E65100",
  timerExpiring: "#D32F2F",
  chartBar: "#4285F4",
  chartBarSelected: "#1A73E8",
  chartBarEmpty: "#E0E0E0",
  tabBar: "#FFFFFF",
  tabActive: "#4285F4",
  tabInactive: "#6B7280",
  deviceBorder: "#4285F4",
  syncWarningText: "#E65100",
  syncWarningBg: "#FFF3E0",
};

/** ダークテーマ カラーパレット */
export const darkColors: ThemeColors = {
  background: "#0F0F0F",
  card: "#1A1A1A",
  cardGray: "#242424",
  cardOrange: "#2A1A0F",
  primary: "#FF9100",
  primaryPressed: "#FF6F00",
  primaryDisabled: "#7A4500",
  accent: "#FFB74D",
  warning: "#FF6F00",
  textPrimary: "#E0E0E0",
  textSecondary: "#B0B0B0",
  textTertiary: "#808080",
  textHint: "#606060",
  border: "#404040",
  otpCode: "#FFB74D",
  timerExpiring: "#FF6B6B",
  chartBar: "#FF9100",
  chartBarSelected: "#FF6F00",
  chartBarEmpty: "#404040",
  tabBar: "#1A1A1A",
  tabActive: "#FF9100",
  tabInactive: "#B0B0B0",
  deviceBorder: "#FF9100",
  syncWarningText: "#FFB74D",
  syncWarningBg: "#2A1A0F",
};
