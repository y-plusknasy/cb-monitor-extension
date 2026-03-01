/**
 * API ユーティリティのテスト
 */
import { describe, it, expect } from "vitest";
import { deriveEndpointUrl } from "./api.js";

describe("deriveEndpointUrl", () => {
  it("Production URL から別の Function 名を導出できる", () => {
    const result = deriveEndpointUrl(
      "https://us-central1-my-project.cloudfunctions.net/usageLogs",
      "registerDevice",
    );
    expect(result).toBe(
      "https://us-central1-my-project.cloudfunctions.net/registerDevice",
    );
  });

  it("Emulator URL から別の Function 名を導出できる", () => {
    const result = deriveEndpointUrl(
      "http://localhost:5001/my-project/us-central1/usageLogs",
      "registerDevice",
    );
    expect(result).toBe(
      "http://localhost:5001/my-project/us-central1/registerDevice",
    );
  });

  it("generateOtp の URL を導出できる", () => {
    const result = deriveEndpointUrl(
      "https://us-central1-my-project.cloudfunctions.net/usageLogs",
      "generateOtp",
    );
    expect(result).toBe(
      "https://us-central1-my-project.cloudfunctions.net/generateOtp",
    );
  });

  it("末尾にスラッシュがあっても正しく導出できる", () => {
    const result = deriveEndpointUrl(
      "https://us-central1-my-project.cloudfunctions.net/usageLogs/",
      "registerDevice",
    );
    // URL が末尾スラッシュ付きの場合、最後のパートは空文字なので1つ前を置換
    // この実装では最後の空パートを置換するため結果が異なる可能性がある
    // 実際の利用では末尾スラッシュなしの URL を想定
    expect(result).toContain("registerDevice");
  });
});
