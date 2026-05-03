import { afterEach, describe, expect, it, vi } from "vitest";

// Re-imports `env/env.ts` from scratch each test so the zod schema reads the
// current `process.env` snapshot. Without this every test would see whatever
// state the first import froze.
async function loadAssertStartupEnv(
  envOverrides: Record<string, string> = {},
): Promise<() => void> {
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  vi.resetModules();
  const mod = await import("../env.js");
  return mod.assertStartupEnv;
}

const PROD_BASELINE = {
  // Minimum env that lets `assertStartupEnv()` proceed past the unrelated
  // production checks (DATABASE_URL, BETTER_AUTH_TOKEN_ENC_KEY,
  // NUTRITION_BACKUP_KEY_SECRET) before reaching the AI_QUOTA_DISABLED gate.
  NODE_ENV: "production",
  DATABASE_URL: "postgres://hub:hub@127.0.0.1:5432/hub",
  BETTER_AUTH_TOKEN_ENC_KEY: "a".repeat(64),
  NUTRITION_BACKUP_KEY_SECRET: "b".repeat(64),
};

describe("assertStartupEnv — AI_QUOTA_DISABLED hard-block (H9)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws when NODE_ENV=production AND AI_QUOTA_DISABLED=true", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_QUOTA_DISABLED: "true",
    });
    expect(() => assertStartupEnv()).toThrow(/AI_QUOTA_DISABLED/);
  });

  it("throws when NODE_ENV=production AND AI_QUOTA_DISABLED=1 (legacy spelling)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_QUOTA_DISABLED: "1",
    });
    expect(() => assertStartupEnv()).toThrow(/AI_QUOTA_DISABLED/);
  });

  it("throws when only RAILWAY_ENVIRONMENT is set (Railway prod without NODE_ENV)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      NODE_ENV: "test",
      RAILWAY_ENVIRONMENT: "production",
      AI_QUOTA_DISABLED: "true",
    });
    expect(() => assertStartupEnv()).toThrow(/AI_QUOTA_DISABLED/);
  });

  it("throws when only RAILWAY_SERVICE_NAME is set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      NODE_ENV: "test",
      RAILWAY_SERVICE_NAME: "sergeant-api",
      AI_QUOTA_DISABLED: "true",
    });
    expect(() => assertStartupEnv()).toThrow(/AI_QUOTA_DISABLED/);
  });

  it("does NOT throw in production when AI_QUOTA_DISABLED is unset (default)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(PROD_BASELINE);
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in production when AI_QUOTA_DISABLED=false", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_QUOTA_DISABLED: "false",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in production when AI_QUOTA_DISABLED=0", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_QUOTA_DISABLED: "0",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("allows AI_QUOTA_DISABLED=true in NODE_ENV=test (CI/e2e)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "test",
      AI_QUOTA_DISABLED: "true",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("allows AI_QUOTA_DISABLED=1 in NODE_ENV=development (local dev)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      AI_QUOTA_DISABLED: "1",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});
