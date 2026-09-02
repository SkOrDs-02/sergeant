import { afterEach, describe, expect, it, vi } from "vitest";

describe("assertBetterAuthStartupEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no-op у не-production без Railway", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BETTER_AUTH_SECRET", "short");
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).not.toThrow();
  });

  it("кидає якщо production і секрет коротший за 32", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(31));
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("кидає на placeholder-секреті", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "change_me_to_a_long_random_string_32chars",
    );
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).toThrow(/placeholder/);
  });

  it("проходить у production з довгим унікальним секретом", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ALLOWED_ORIGINS", "https://app.example.com");
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).not.toThrow();
  });

  it("APP_ENV=production без NODE_ENV=production теж вимагає секрет", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).toThrow(/BETTER_AUTH_SECRET/);
  });
});
