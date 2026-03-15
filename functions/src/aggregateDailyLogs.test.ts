import { describe, it, expect } from "vitest";
import {
  aggregateUsageLogs,
  getYesterdayDateString,
  type AggregatedEntry,
} from "./aggregateDailyLogs.js";

/**
 * テスト用の Firestore ドキュメントスナップショットのモック。
 */
function mockDoc(data: Record<string, unknown>) {
  return {
    data: () => data,
    id: `${data.deviceId}_${data.date}_${data.appName}`,
    ref: {},
  } as unknown as FirebaseFirestore.QueryDocumentSnapshot;
}

describe("aggregateUsageLogs", () => {
  it("複数デバイス・複数アプリを正しく集計する", () => {
    const docs = [
      mockDoc({
        parentIds: ["parent-1"],
        deviceId: "device-a",
        appName: "youtube.com",
        totalSeconds: 1200,
        date: "2026-03-11",
      }),
      mockDoc({
        parentIds: ["parent-1"],
        deviceId: "device-a",
        appName: "chrome",
        totalSeconds: 600,
        date: "2026-03-11",
      }),
      mockDoc({
        parentIds: ["parent-1"],
        deviceId: "device-b",
        appName: "youtube.com",
        totalSeconds: 300,
        date: "2026-03-11",
      }),
    ];

    const result = aggregateUsageLogs(docs);

    expect(result.size).toBe(3);

    const ytA = result.get("device-a_youtube.com")!;
    expect(ytA.totalSeconds).toBe(1200);
    expect(ytA.parentIds).toEqual(["parent-1"]);
    expect(ytA.deviceId).toBe("device-a");
    expect(ytA.appName).toBe("youtube.com");

    const chromeA = result.get("device-a_chrome")!;
    expect(chromeA.totalSeconds).toBe(600);

    const ytB = result.get("device-b_youtube.com")!;
    expect(ytB.totalSeconds).toBe(300);
  });

  it("同一デバイス・同一アプリの秒数を合算する", () => {
    const docs = [
      mockDoc({
        parentIds: ["parent-1"],
        deviceId: "device-a",
        appName: "chrome",
        totalSeconds: 100,
        date: "2026-03-11",
      }),
      mockDoc({
        parentIds: ["parent-1"],
        deviceId: "device-a",
        appName: "chrome",
        totalSeconds: 200,
        date: "2026-03-11",
      }),
    ];

    const result = aggregateUsageLogs(docs);
    expect(result.size).toBe(1);

    const entry = result.get("device-a_chrome")!;
    expect(entry.totalSeconds).toBe(300);
  });

  it("空の配列では空の Map を返す", () => {
    const result = aggregateUsageLogs([]);
    expect(result.size).toBe(0);
  });
});

describe("getYesterdayDateString", () => {
  it("YYYY-MM-DD 形式の文字列を返す", () => {
    const result = getYesterdayDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("前日の日付を返す", () => {
    const result = getYesterdayDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const expected = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    expect(result).toBe(expected);
  });
});
