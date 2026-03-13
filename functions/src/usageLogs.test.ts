import { describe, it, expect } from "vitest";
import { validateDate } from "./usageLogs.js";

describe("validateDate", () => {
  it("今日の日付は有効", () => {
    const today = new Date();
    const dateStr = toDateString(today);
    expect(validateDate(dateStr)).toBeNull();
  });

  it("昨日の日付は有効", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(validateDate(toDateString(yesterday))).toBeNull();
  });

  it("30日前の日付は有効", () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    expect(validateDate(toDateString(d))).toBeNull();
  });

  it("31日前の日付は有効（境界値）", () => {
    const d = new Date();
    d.setDate(d.getDate() - 31);
    expect(validateDate(toDateString(d))).toBeNull();
  });

  it("32日前の日付は拒否", () => {
    const d = new Date();
    d.setDate(d.getDate() - 32);
    expect(validateDate(toDateString(d))).toBe("date_too_old");
  });

  it("明日の日付は拒否", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(validateDate(toDateString(tomorrow))).toBe(
      "future_date_not_allowed",
    );
  });

  it("1週間後の日付は拒否", () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    expect(validateDate(toDateString(future))).toBe("future_date_not_allowed");
  });

  it("不正な日付文字列は拒否", () => {
    expect(validateDate("invalid")).toBe("invalid_date");
  });
});

/** Date を YYYY-MM-DD に変換するヘルパー */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
