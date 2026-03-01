/**
 * tracking.js のユニットテスト
 */
import { describe, it, expect, vi } from "vitest";
import {
  extractDomain,
  determineAppName,
  getToday,
  addUsageToDailyBuffer,
  pruneOldDates,
} from "./tracking.js";

describe("extractDomain", () => {
  it("通常の URL からドメインを抽出できる", () => {
    expect(extractDomain("https://www.youtube.com/watch?v=abc")).toBe(
      "www.youtube.com",
    );
  });

  it("サブドメインなしの URL からドメインを抽出できる", () => {
    expect(extractDomain("https://youtube.com/")).toBe("youtube.com");
  });

  it("HTTP URL からドメインを抽出できる", () => {
    expect(extractDomain("http://example.com/path")).toBe("example.com");
  });

  it("ポート付き URL からドメインを抽出できる", () => {
    expect(extractDomain("https://localhost:5001/api")).toBe("localhost");
  });

  it("不正な URL は null を返す", () => {
    expect(extractDomain("not-a-url")).toBe(null);
  });

  it("空文字は null を返す", () => {
    expect(extractDomain("")).toBe(null);
  });

  it("chrome:// URL からドメインを抽出できる", () => {
    expect(extractDomain("chrome://extensions/")).toBe("extensions");
  });
});

describe("determineAppName", () => {
  it("type=normal の場合は 'chrome' を返す", () => {
    expect(determineAppName({ type: "normal" }, [])).toBe("chrome");
  });

  it("type=app の場合はタブの URL からドメインを返す", () => {
    const tabs = [{ url: "https://www.youtube.com/" }];
    expect(determineAppName({ type: "app" }, tabs)).toBe("www.youtube.com");
  });

  it("type=popup の場合はタブの URL からドメインを返す", () => {
    const tabs = [{ url: "https://www.duolingo.com/learn" }];
    expect(determineAppName({ type: "popup" }, tabs)).toBe("www.duolingo.com");
  });

  it("type=app でタブがない場合は null を返す", () => {
    expect(determineAppName({ type: "app" }, [])).toBe(null);
  });

  it("type=app でタブに URL がない場合は null を返す", () => {
    expect(determineAppName({ type: "app" }, [{}])).toBe(null);
  });

  it("win が null の場合は null を返す", () => {
    expect(determineAppName(null, [])).toBe(null);
  });

  it("未知のウィンドウタイプの場合は null を返す", () => {
    expect(determineAppName({ type: "devtools" }, [])).toBe(null);
  });
});

describe("getToday", () => {
  it("指定日時の YYYY-MM-DD を返す", () => {
    const date = new Date(2026, 2, 1); // 2026-03-01
    expect(getToday(date)).toBe("2026-03-01");
  });

  it("月・日が 1 桁の場合にゼロパディングする", () => {
    const date = new Date(2026, 0, 5); // 2026-01-05
    expect(getToday(date)).toBe("2026-01-05");
  });

  it("引数なしの場合、今日の日付を返す", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(getToday()).toBe(expected);
  });
});

describe("addUsageToDailyBuffer", () => {
  it("空のバッファに新規エントリを追加できる", () => {
    const result = addUsageToDailyBuffer({}, "2026-03-01", "youtube.com", 120);
    expect(result["2026-03-01"]["youtube.com"].totalSeconds).toBe(120);
    expect(result["2026-03-01"]["youtube.com"].lastUpdated).toBeTruthy();
  });

  it("既存のアプリに秒数を加算できる", () => {
    const existing = {
      "2026-03-01": {
        "youtube.com": {
          totalSeconds: 100,
          lastUpdated: "2026-03-01T10:00:00.000Z",
        },
      },
    };
    const result = addUsageToDailyBuffer(
      existing,
      "2026-03-01",
      "youtube.com",
      50,
    );
    expect(result["2026-03-01"]["youtube.com"].totalSeconds).toBe(150);
  });

  it("同じ日に別のアプリを追加できる", () => {
    const existing = {
      "2026-03-01": {
        "youtube.com": {
          totalSeconds: 100,
          lastUpdated: "2026-03-01T10:00:00.000Z",
        },
      },
    };
    const result = addUsageToDailyBuffer(existing, "2026-03-01", "chrome", 200);
    expect(result["2026-03-01"]["youtube.com"].totalSeconds).toBe(100);
    expect(result["2026-03-01"]["chrome"].totalSeconds).toBe(200);
  });

  it("元のオブジェクトを変更しない（イミュータブル）", () => {
    const existing = {
      "2026-03-01": {
        "youtube.com": {
          totalSeconds: 100,
          lastUpdated: "2026-03-01T10:00:00.000Z",
        },
      },
    };
    const result = addUsageToDailyBuffer(
      existing,
      "2026-03-01",
      "youtube.com",
      50,
    );
    expect(existing["2026-03-01"]["youtube.com"].totalSeconds).toBe(100);
    expect(result["2026-03-01"]["youtube.com"].totalSeconds).toBe(150);
  });
});

describe("pruneOldDates", () => {
  it("保持期間内のデータは残る", () => {
    const now = new Date(2026, 2, 5); // 2026-03-05
    const data = {
      "2026-03-03": { chrome: { totalSeconds: 100, lastUpdated: "" } },
      "2026-03-04": { chrome: { totalSeconds: 200, lastUpdated: "" } },
      "2026-03-05": { chrome: { totalSeconds: 300, lastUpdated: "" } },
    };
    const result = pruneOldDates(data, 4, now);
    expect(Object.keys(result)).toEqual([
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
  });

  it("保持期間より古いデータは削除される", () => {
    const now = new Date(2026, 2, 5); // 2026-03-05
    const data = {
      "2026-03-01": { chrome: { totalSeconds: 50, lastUpdated: "" } },
      "2026-03-02": { chrome: { totalSeconds: 100, lastUpdated: "" } },
      "2026-03-05": { chrome: { totalSeconds: 300, lastUpdated: "" } },
    };
    // retentionDays=4 → cutoff = 2026-03-02
    const result = pruneOldDates(data, 4, now);
    expect(result["2026-03-01"]).toBeUndefined();
    expect(result["2026-03-02"]).toBeDefined();
    expect(result["2026-03-05"]).toBeDefined();
  });

  it("空のバッファは空を返す", () => {
    const result = pruneOldDates({}, 4, new Date());
    expect(Object.keys(result)).toHaveLength(0);
  });
});
