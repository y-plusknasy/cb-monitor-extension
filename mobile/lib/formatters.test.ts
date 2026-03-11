/**
 * formatters ユーティリティのテスト
 */
import {
  formatDuration,
  formatDurationShort,
  getTodayDateString,
  formatDate,
} from "./formatters";

describe("formatDuration", () => {
  it("0秒を「0分」と表示する", () => {
    expect(formatDuration(0)).toBe("0分");
  });

  it("60秒未満を「0分」と表示する", () => {
    expect(formatDuration(30)).toBe("0分");
  });

  it("60秒を「1分」と表示する", () => {
    expect(formatDuration(60)).toBe("1分");
  });

  it("分のみの場合「X分」と表示する", () => {
    expect(formatDuration(2700)).toBe("45分");
  });

  it("1時間を「1時間0分」と表示する", () => {
    expect(formatDuration(3600)).toBe("1時間0分");
  });

  it("時間と分の組み合わせを正しく表示する", () => {
    expect(formatDuration(5400)).toBe("1時間30分");
  });

  it("複数時間を正しく表示する", () => {
    expect(formatDuration(7260)).toBe("2時間1分");
  });
});

describe("formatDurationShort", () => {
  it("0秒を「0:00」と表示する", () => {
    expect(formatDurationShort(0)).toBe("0:00");
  });

  it("1時間30分を「1:30」と表示する", () => {
    expect(formatDurationShort(5400)).toBe("1:30");
  });

  it("分が1桁の場合はゼロ埋めする", () => {
    expect(formatDurationShort(3660)).toBe("1:01");
  });
});

describe("getTodayDateString", () => {
  it("YYYY-MM-DD 形式の文字列を返す", () => {
    const result = getTodayDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDate", () => {
  it("ISO8601 文字列を YYYY/MM/DD 形式に変換する", () => {
    expect(formatDate("2026-03-02T10:30:00Z")).toBe("2026/03/02");
  });

  it("タイムゾーン付きの日付も正しく処理する", () => {
    const result = formatDate("2026-01-15T00:00:00+09:00");
    // ローカルタイムゾーンに依存するため、形式のみ検証
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });
});
