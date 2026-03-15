/**
 * テーマ Context
 *
 * アプリ全体のテーマ（ライト/ダーク）を管理する。
 * AsyncStorage に選択を永続化する。
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type ThemeType,
  type ThemeColors,
  lightColors,
  darkColors,
} from "../lib/theme";

/** AsyncStorage のキー */
const THEME_STORAGE_KEY = "cb-link-theme";

/** Context の型 */
interface ThemeContextType {
  /** 現在のテーマ種別 */
  theme: ThemeType;
  /** 現在のカラーパレット */
  colors: ThemeColors;
  /** テーマをトグルする */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * テーマプロバイダー。
 *
 * 初回マウント時に AsyncStorage から保存済みテーマを復元する。
 * テーマ変更時に AsyncStorage に保存する。
 */
export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [theme, setTheme] = useState<ThemeType>("light");

  // マウント時に保存済みテーマを復元
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (saved === "dark" || saved === "light") {
          setTheme(saved);
        }
      })
      .catch(() => {
        // 復元失敗時はデフォルト（ライト）のまま
      });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {
        // 保存失敗は無視
      });
      return next;
    });
  }, []);

  const colors = theme === "dark" ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * テーマフック。
 *
 * ThemeProvider 内でのみ使用可能。
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
