import { describe, it, expect } from "vitest";
import { usageLogSchema, registerDeviceSchema } from "./validation.js";

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

  // strict: 未定義プロパティの拒否
  it("未定義のプロパティが含まれている場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      extraField: "malicious",
    });
    expect(result.success).toBe(false);
  });

  it("複数の未定義プロパティが含まれている場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      __proto__: "hack",
      constructor: "evil",
    });
    expect(result.success).toBe(false);
  });

  // appName インジェクション防止
  it("appName にスラッシュが含まれる場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "../etc/passwd",
    });
    expect(result.success).toBe(false);
  });

  it("appName にスペースが含まれる場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "app name",
    });
    expect(result.success).toBe(false);
  });

  it("appName に制御文字が含まれる場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "app\x00name",
    });
    expect(result.success).toBe(false);
  });

  it("appName に SQL インジェクション的文字列を含む場合はエラー", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "'; DROP TABLE users;--",
    });
    expect(result.success).toBe(false);
  });

  it("appName = 'unknown' を受け入れる", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "unknown",
    });
    expect(result.success).toBe(true);
  });

  it("appName にハイフンとドットを含むドメインを受け入れる", () => {
    const result = usageLogSchema.safeParse({
      ...validPayload,
      appName: "my-app.example.com",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S02: registerDeviceSchema
// ---------------------------------------------------------------------------

describe("registerDeviceSchema", () => {
  const validPayload = {
    otp: "123456",
    deviceId: "550e8400-e29b-41d4-a716-446655440000",
    deviceName: "Chromebook（子供）",
  };

  it("正常なペイロードを受け入れる", () => {
    const result = registerDeviceSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("OTP が6桁数字でない場合はエラー（5桁）", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      otp: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("OTP が6桁数字でない場合はエラー（7桁）", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      otp: "1234567",
    });
    expect(result.success).toBe(false);
  });

  it("OTP にアルファベットが含まれる場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      otp: "12345a",
    });
    expect(result.success).toBe(false);
  });

  it("OTP が空文字の場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      otp: "",
    });
    expect(result.success).toBe(false);
  });

  it("deviceId が UUID でない場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      deviceId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("deviceName が空文字の場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      deviceName: "",
    });
    expect(result.success).toBe(false);
  });

  it("deviceName が100文字を超える場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      deviceName: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("deviceName が100文字ちょうどの場合は受け入れる", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      deviceName: "a".repeat(100),
    });
    expect(result.success).toBe(true);
  });

  it("必須フィールドが欠けている場合はエラー（otp）", () => {
    const { otp, ...incomplete } = validPayload;
    const result = registerDeviceSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("必須フィールドが欠けている場合はエラー（deviceName）", () => {
    const { deviceName, ...incomplete } = validPayload;
    const result = registerDeviceSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // syncAvailable (オプショナル)
  // ---------------------------------------------------------------------------

  it("syncAvailable = true を受け入れる", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      syncAvailable: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.syncAvailable).toBe(true);
    }
  });

  it("syncAvailable = false を受け入れる", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      syncAvailable: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.syncAvailable).toBe(false);
    }
  });

  it("syncAvailable が省略されても受け入れる", () => {
    const result = registerDeviceSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.syncAvailable).toBeUndefined();
    }
  });

  it("syncAvailable が boolean 以外の場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      syncAvailable: "yes",
    });
    expect(result.success).toBe(false);
  });

  // strict: 未定義プロパティの拒否
  it("未定義のプロパティが含まれている場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      extraField: "malicious",
    });
    expect(result.success).toBe(false);
  });

  // deviceName インジェクション防止
  it("deviceName に制御文字が含まれる場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      deviceName: "device\x00name",
    });
    expect(result.success).toBe(false);
  });

  it("deviceName にバックスラッシュが含まれる場合はエラー", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      deviceName: "device\\name",
    });
    expect(result.success).toBe(false);
  });

  it("deviceName に日本語を含む名前を受け入れる", () => {
    const result = registerDeviceSchema.safeParse({
      ...validPayload,
      deviceName: "子供のChromebook（リビング）",
    });
    expect(result.success).toBe(true);
  });
});
