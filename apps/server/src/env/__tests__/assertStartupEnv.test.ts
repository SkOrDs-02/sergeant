import { afterEach, describe, expect, it, vi } from "vitest";

// Re-imports `env/env.ts` from scratch each test so the zod schema reads the
// current `process.env` snapshot. Without this every test would see whatever
// state the first import froze.
//
// T2 audit finding #11 — Hard Rule #20 (`assertStartupEnv`) inspects
// `process.env.Git_PAT` / `process.env.OPENCLAW_GITHUB_PAT` directly to
// catch leftover platform secrets that bypass Zod. Devin/CI runners
// inherit `Git_PAT` from the parent shell, which leaked into the
// "does NOT throw in production" baseline cases and flipped them to
// failures non-deterministically by host env. We explicitly stub both
// keys to empty BEFORE applying `envOverrides`, so the negative-path
// cases (which set them non-empty themselves) still win.
async function loadAssertStartupEnv(
  envOverrides: Record<string, string> = {},
): Promise<() => void> {
  vi.stubEnv("Git_PAT", "");
  vi.stubEnv("OPENCLAW_GITHUB_PAT", "");
  for (const [k, v] of Object.entries(envOverrides)) vi.stubEnv(k, v);
  vi.resetModules();
  const mod = await import("../env.js");
  return mod.assertStartupEnv;
}

const PROD_BASELINE = {
  // Minimum env that lets `assertStartupEnv()` proceed past the unrelated
  // production checks (DATABASE_URL, BETTER_AUTH_TOKEN_ENC_KEY,
  // NUTRITION_BACKUP_KEY_SECRET, METRICS_TOKEN) before reaching the
  // AI_QUOTA_DISABLED gate.
  NODE_ENV: "production",
  DATABASE_URL: "postgres://hub:hub@127.0.0.1:5432/hub",
  BETTER_AUTH_TOKEN_ENC_KEY: "a".repeat(64),
  NUTRITION_BACKUP_KEY_SECRET: "b".repeat(64),
  // T2 audit #4 — METRICS_TOKEN is required in production. Tests that
  // exercise the negative path for this gate live in a dedicated
  // `describe` block below and DELETE this key from the baseline.
  METRICS_TOKEN: "c".repeat(64),
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

describe("assertStartupEnv — Hard Rule #20: no OpenClaw PAT in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws in production when OPENCLAW_GITHUB_PAT is set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      OPENCLAW_GITHUB_PAT: "ghp_legacy_token_left_in_railway",
    });
    expect(() => assertStartupEnv()).toThrow(/Hard Rule #20/);
    expect(() => assertStartupEnv()).toThrow(/OPENCLAW_GITHUB_PAT/);
  });

  it("throws in production when Git_PAT is set (Devin VM convention bleed)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      Git_PAT: "ghp_devin_vm_token",
    });
    expect(() => assertStartupEnv()).toThrow(/Hard Rule #20/);
    expect(() => assertStartupEnv()).toThrow(/Git_PAT/);
  });

  it("lists both PATs when both are present", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      OPENCLAW_GITHUB_PAT: "ghp_a",
      Git_PAT: "ghp_b",
    });
    expect(() => assertStartupEnv()).toThrow(/OPENCLAW_GITHUB_PAT, Git_PAT/);
  });

  it("throws under Railway prod even without NODE_ENV=production", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      NODE_ENV: "test",
      RAILWAY_ENVIRONMENT: "production",
      OPENCLAW_GITHUB_PAT: "ghp_a",
    });
    expect(() => assertStartupEnv()).toThrow(/Hard Rule #20/);
  });

  it("does NOT throw in production when no legacy PAT is set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(PROD_BASELINE);
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("allows OPENCLAW_GITHUB_PAT in NODE_ENV=development (legacy local tooling)", async () => {
    // Phase 2 only hard-blocks production. Local dev environments still
    // see Devin's `Git_PAT` org-secret in `process.env`, and a developer
    // running `pnpm dev` against staging shouldn't have the server
    // refuse to boot because of it.
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      OPENCLAW_GITHUB_PAT: "ghp_local_dev",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("allows OPENCLAW_GITHUB_PAT in NODE_ENV=test (CI runs on the same VM)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "test",
      OPENCLAW_GITHUB_PAT: "ghp_ci_token",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — STRIPE_WEBHOOK_SECRET hard-fail (T2 audit #1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // PROD_BASELINE only stubs the keys it sets — Devin/CI shells may export
  // `Git_PAT` / `OPENCLAW_GITHUB_PAT`, which would trigger Hard Rule #20 and
  // make these tests non-hermetic. Stub them to empty explicitly.
  const STRIPE_BASELINE = {
    ...PROD_BASELINE,
    OPENCLAW_GITHUB_PAT: "",
    Git_PAT: "",
  };

  it("throws in production when STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...STRIPE_BASELINE,
      STRIPE_SECRET_KEY: "sk_live_xxx",
    });
    expect(() => assertStartupEnv()).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("does NOT throw in production when both Stripe vars are set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...STRIPE_BASELINE,
      STRIPE_SECRET_KEY: "sk_live_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_xxx",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in production when neither Stripe var is set (billing not wired)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(STRIPE_BASELINE);
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in NODE_ENV=development when STRIPE_SECRET_KEY is set without webhook secret", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      STRIPE_SECRET_KEY: "sk_test_xxx",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — METRICS_TOKEN hard-fail (T2 audit #4)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Strip METRICS_TOKEN from the prod baseline so we can exercise the
  // negative path. The legacy PATs are also cleared because the same
  // PROD_BASELINE inherits the Git_PAT gate.
  const METRICS_BASELINE = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://hub:hub@127.0.0.1:5432/hub",
    BETTER_AUTH_TOKEN_ENC_KEY: "a".repeat(64),
    NUTRITION_BACKUP_KEY_SECRET: "b".repeat(64),
    OPENCLAW_GITHUB_PAT: "",
    Git_PAT: "",
  };

  it("throws in production when METRICS_TOKEN is missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(METRICS_BASELINE);
    expect(() => assertStartupEnv()).toThrow(/METRICS_TOKEN/);
  });

  it("does NOT throw in production when METRICS_TOKEN is set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...METRICS_BASELINE,
      METRICS_TOKEN: "c".repeat(64),
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in NODE_ENV=development when METRICS_TOKEN is missing (legacy warning-only path)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});
