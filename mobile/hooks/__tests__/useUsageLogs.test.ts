/**
 * useUsageLogs のユーティリティ関数テスト
 */

// Firebase SDK をモックして初期化エラーを回避
jest.mock("../../lib/firebase", () => ({
  db: {},
  auth: {},
}));

import { aggregateByDevice, type UsageLogEntry } from "../useUsageLogs";

describe("aggregateByDevice", () => {
  it("空配列の場合は空配列を返す", () => {
    expect(aggregateByDevice([])).toEqual([]);
  });

  it("単一デバイスの場合はそのデバイスの合計を返す", () => {
    const logs: UsageLogEntry[] = [
      {
        deviceId: "d1",
        appName: "youtube.com",
        totalSeconds: 100,
        date: "2026-03-02",
      },
      {
        deviceId: "d1",
        appName: "google.com",
        totalSeconds: 200,
        date: "2026-03-02",
      },
    ];
    const result = aggregateByDevice(logs);
    expect(result).toEqual([{ deviceId: "d1", totalSeconds: 300 }]);
  });

  it("複数デバイスの場合はデバイス別に集計し利用時間の多い順にソートする", () => {
    const logs: UsageLogEntry[] = [
      {
        deviceId: "d1",
        appName: "youtube.com",
        totalSeconds: 100,
        date: "2026-03-02",
      },
      {
        deviceId: "d2",
        appName: "google.com",
        totalSeconds: 500,
        date: "2026-03-02",
      },
      {
        deviceId: "d1",
        appName: "chrome",
        totalSeconds: 50,
        date: "2026-03-02",
      },
      {
        deviceId: "d2",
        appName: "youtube.com",
        totalSeconds: 200,
        date: "2026-03-02",
      },
    ];
    const result = aggregateByDevice(logs);
    expect(result).toEqual([
      { deviceId: "d2", totalSeconds: 700 },
      { deviceId: "d1", totalSeconds: 150 },
    ]);
  });

  it("同一アプリの複数ログも正しく合算する", () => {
    const logs: UsageLogEntry[] = [
      {
        deviceId: "d1",
        appName: "youtube.com",
        totalSeconds: 100,
        date: "2026-03-02",
      },
      {
        deviceId: "d1",
        appName: "youtube.com",
        totalSeconds: 200,
        date: "2026-03-02",
      },
    ];
    const result = aggregateByDevice(logs);
    expect(result).toEqual([{ deviceId: "d1", totalSeconds: 300 }]);
  });
});
