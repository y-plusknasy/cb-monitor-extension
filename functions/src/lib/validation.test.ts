import { describe, it, expect } from "vitest";
import { usageLogSchema } from "./validation.js";

describe("usageLogSchema", () => {
  const validPayload = {
    deviceId: "550e8400-e29b-41d4-a716-446655440000",
    date: "2026-02-28",
    appName: "youtube.com",
    totalSeconds: 3600,
    lastUpdated: "2026-02-28T23:59:00.000Z",
  };

  it("正常なペイロードを受け入れる", () => {
    const result = usageLogSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("appName = 'chrome' を受け入れる", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "chrome",
    });
    expect(result.success).toBe(true);
  });

  it("deviceId が UUID でない場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      deviceId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("appName が空文字の場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "",
    });
    expect(result.success).toBe(false);
  });

  it("date が YYYY-MM-DD 形式でない場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      date: "2026/02/28",
    });
    expect(result.success).toBe(false);
  });

  it("date が空の場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      date: "",
    });
    expect(result.success).toBe(false);
  });

  it("totalSeconds が 0 の場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      totalSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it("totalSeconds が負の場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      totalSeconds: -10,
    });
    expect(result.success).toBe(false);
  });

  it("totalSeconds が 86400 を超える場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      totalSeconds: 86401,
    });
    expect(result.success).toBe(false);
  });

  it("totalSeconds が小数の場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      totalSeconds: 10.5,
    });
    expect(result.success).toBe(false);
  });

  it("lastUpdated が ISO8601 でない場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      lastUpdated: "2026/02/28",
    });
    expect(result.success).toBe(false);
  });

  it("必須フィールドが欠けている場合はエラー", () => {
    const { deviceId, ...incomplete } = validPayload;
    const result = usageLogSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});
