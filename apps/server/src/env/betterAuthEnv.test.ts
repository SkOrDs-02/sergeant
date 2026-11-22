import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../obs/logger.js", () => ({
  logger: { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() },
}));

describe("assertBetterAuthStartupEnv", () => {
  beforeEach(() => {
    warn.mockClear();
  });
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

  it("не стартує в production без Resend, щоб не підтверджувати неіснуючу доставку листа", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ALLOWED_ORIGINS", "https://app.example.com");
    vi.stubEnv("RESEND_API_KEY", "");
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).toThrow(/RESEND_API_KEY/);
  });

  it("sec-46: не стартує в production із закоміченим smoke-секретом", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "smoke_test_better_auth_secret_32_chars_min",
    );
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).toThrow(/placeholder/);
  });

  it("sec-46: попереджає в production, коли межа підтвердження email не задана", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("ALLOWED_ORIGINS", "https://app.example.com");
    vi.stubEnv("RESEND_API_KEY", "re_dummy");
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED_FROM", "");
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    assertBetterAuthStartupEnv();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "email_verification_cutoff_unset" }),
    );

    warn.mockClear();
    vi.stubEnv("EMAIL_VERIFICATION_REQUIRED_FROM", "2026-11-21");
    assertBetterAuthStartupEnv();
    expect(warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ msg: "email_verification_cutoff_unset" }),
    );
  });

  it("APP_ENV=production без NODE_ENV=production теж вимагає секрет", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    const { assertBetterAuthStartupEnv } = await import("./betterAuthEnv.js");
    expect(() => assertBetterAuthStartupEnv()).toThrow(/BETTER_AUTH_SECRET/);
  });
});
