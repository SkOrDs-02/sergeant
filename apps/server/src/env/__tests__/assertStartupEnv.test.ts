import { afterEach, describe, expect, it, vi } from "vitest";

import { isDeployedProduction } from "../env.js";

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
  // backend-perf PR-01 — VAPID keypair is required in production. Negative
  // path lives in its own `describe` block below (with a VAPID-less baseline).
  VAPID_PUBLIC_KEY: "d".repeat(80),
  VAPID_PRIVATE_KEY: "e".repeat(40),
  // Independent audit 2026-06-11 ws-06 — SENTRY_DSN is required in production.
  // Negative path lives in its own `describe` block below (DSN-less baseline).
  SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
};

describe("isDeployedProduction — host-agnostic prod detection", () => {
  it("returns true under the Coolify env shape (NODE_ENV=production, no RAILWAY_*)", () => {
    expect(isDeployedProduction({ NODE_ENV: "production" })).toBe(true);
  });

  it("returns true via the generic APP_ENV signal (NODE_ENV unset/non-prod)", () => {
    expect(isDeployedProduction({ APP_ENV: "production" })).toBe(true);
    expect(
      isDeployedProduction({ NODE_ENV: "test", APP_ENV: "production" }),
    ).toBe(true);
  });

  it("returns true via legacy Railway signals", () => {
    expect(
      isDeployedProduction({ NODE_ENV: "test", RAILWAY_ENVIRONMENT: "prod" }),
    ).toBe(true);
    expect(
      isDeployedProduction({ NODE_ENV: "test", RAILWAY_SERVICE_NAME: "api" }),
    ).toBe(true);
  });

  it("returns false for local/dev shapes and non-'production' APP_ENV", () => {
    expect(isDeployedProduction({ NODE_ENV: "development" })).toBe(false);
    expect(isDeployedProduction({ NODE_ENV: "test" })).toBe(false);
    expect(isDeployedProduction({ APP_ENV: "staging" })).toBe(false);
    expect(isDeployedProduction({})).toBe(false);
  });
});

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

  it("throws via APP_ENV=production on Coolify (no NODE_ENV=production, no RAILWAY_*)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      NODE_ENV: "test",
      APP_ENV: "production",
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
  //
  // P0-7 (docs/audits/2026-05-13-revenue-monetization-roast.md) — once
  // `STRIPE_SECRET_KEY` is in the baseline, `STRIPE_PRICE_ID_PRO_MONTHLY`
  // also becomes required. These two cases stub it to a valid value so
  // the cross-cutting webhook-secret tests below stay focused.
  const STRIPE_BASELINE = {
    ...PROD_BASELINE,
    OPENCLAW_GITHUB_PAT: "",
    Git_PAT: "",
  };

  it("throws in production when STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...STRIPE_BASELINE,
      STRIPE_SECRET_KEY: "sk_live_xxx",
      STRIPE_PRICE_ID_PRO_MONTHLY: "price_1AbCdEf123",
    });
    expect(() => assertStartupEnv()).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("does NOT throw in production when both Stripe vars are set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...STRIPE_BASELINE,
      STRIPE_SECRET_KEY: "sk_live_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_xxx",
      STRIPE_PRICE_ID_PRO_MONTHLY: "price_1AbCdEf123",
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

  // Security Engineer council finding — `STRIPE_WEBHOOK_TOLERANCE_SECONDS<=0`
  // disables `verifyStripeSignature` timestamp replay-window check entirely.
  // An unattended staging/preview config with this value turns any captured
  // signed webhook payload into an unbounded replay primitive against the
  // billing endpoint. Guard must hard-fail at boot in production-with-billing.
  it("throws in production when STRIPE_WEBHOOK_TOLERANCE_SECONDS is 0 (replay-window disabled)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...STRIPE_BASELINE,
      STRIPE_SECRET_KEY: "sk_live_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_xxx",
      STRIPE_PRICE_ID_PRO_MONTHLY: "price_1AbCdEf123",
      STRIPE_WEBHOOK_TOLERANCE_SECONDS: "0",
    });
    expect(() => assertStartupEnv()).toThrow(
      /STRIPE_WEBHOOK_TOLERANCE_SECONDS/,
    );
  });

  it("throws in production when STRIPE_WEBHOOK_TOLERANCE_SECONDS is negative", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...STRIPE_BASELINE,
      STRIPE_SECRET_KEY: "sk_live_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_xxx",
      STRIPE_PRICE_ID_PRO_MONTHLY: "price_1AbCdEf123",
      STRIPE_WEBHOOK_TOLERANCE_SECONDS: "-1",
    });
    expect(() => assertStartupEnv()).toThrow(
      /STRIPE_WEBHOOK_TOLERANCE_SECONDS/,
    );
  });

  it("does NOT throw in NODE_ENV=development when STRIPE_WEBHOOK_TOLERANCE_SECONDS is 0", async () => {
    // Dev tolerance: local mock-webhook tests may set tolerance=0 deliberately
    // to avoid clock-skew false-negatives during replay. Guard is production-
    // only.
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      STRIPE_SECRET_KEY: "sk_test_xxx",
      STRIPE_WEBHOOK_TOLERANCE_SECONDS: "0",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — STRIPE_PRICE_ID_PRO_MONTHLY (P0-7)", () => {
  // Stripe price IDs sit on the same lifecycle as `STRIPE_WEBHOOK_SECRET`:
  // optional when billing is not wired, mandatory at boot in production
  // once `STRIPE_SECRET_KEY` is set. Until P0-7 these were read straight
  // from `process.env` inside `getPriceId`, so a missing or malformed
  // ID surfaced only when a user clicked Upgrade and the route returned
  // a generic 503. The Zod schema now enforces `price_*` on parse, and
  // this block locks in:
  //   1. Malformed values fail at module load (zod refine).
  //   2. Missing values fail at `assertStartupEnv` in prod-with-billing.
  //   3. Dev / preview deploys (NODE_ENV != production) stay tolerant.
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const PRICE_BASELINE = {
    ...PROD_BASELINE,
    OPENCLAW_GITHUB_PAT: "",
    Git_PAT: "",
    STRIPE_SECRET_KEY: "sk_live_xxx",
    STRIPE_WEBHOOK_SECRET: "whsec_xxx",
  };

  it("throws in production when STRIPE_SECRET_KEY is set but STRIPE_PRICE_ID_PRO_MONTHLY is missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(PRICE_BASELINE);
    expect(() => assertStartupEnv()).toThrow(/STRIPE_PRICE_ID_PRO_MONTHLY/);
  });

  it("throws on module import when STRIPE_PRICE_ID_PRO_MONTHLY is malformed (not price_*)", async () => {
    // Zod refines on `.regex(/^price_…/)` at module-load time, so the
    // bad value never even reaches `assertStartupEnv` — `loadAssertStartupEnv`
    // (which does the dynamic import) is what fails.
    await expect(
      loadAssertStartupEnv({
        ...PRICE_BASELINE,
        STRIPE_PRICE_ID_PRO_MONTHLY: "prod_not_a_price_id",
      }),
    ).rejects.toThrow(/STRIPE_PRICE_ID_PRO_MONTHLY/);
  });

  it("does NOT throw in production when STRIPE_PRICE_ID_PRO_MONTHLY is a valid price_* value", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PRICE_BASELINE,
      STRIPE_PRICE_ID_PRO_MONTHLY: "price_1AbCdEf123",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in NODE_ENV=development when STRIPE_PRICE_ID_PRO_MONTHLY is missing", async () => {
    // Local dev / preview deploys (sk_test_*) still boot without a
    // price ID — the runtime `getPriceId` call inside checkout
    // surfaces the 503 path through normal e2e instead.
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
    // backend-perf PR-01 — keep VAPID present so the not-throw case reaches
    // the METRICS gate instead of tripping the (later) VAPID check.
    VAPID_PUBLIC_KEY: "d".repeat(80),
    VAPID_PRIVATE_KEY: "e".repeat(40),
    SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
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

describe("assertStartupEnv — HTTPS scheme hard-fail (T2 audit #6)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const HTTPS_BASELINE = {
    ...PROD_BASELINE,
    OPENCLAW_GITHUB_PAT: "",
    Git_PAT: "",
  };

  it("throws in production when BETTER_AUTH_URL uses http://", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...HTTPS_BASELINE,
      BETTER_AUTH_URL: "http://api.example.com",
    });
    expect(() => assertStartupEnv()).toThrow(/BETTER_AUTH_URL/);
  });

  it("throws in production when PUBLIC_API_BASE_URL uses http://", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...HTTPS_BASELINE,
      PUBLIC_API_BASE_URL: "http://api.example.com",
    });
    expect(() => assertStartupEnv()).toThrow(/PUBLIC_API_BASE_URL/);
  });

  it("does NOT throw in production when both URLs use https://", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...HTTPS_BASELINE,
      BETTER_AUTH_URL: "https://api.example.com",
      PUBLIC_API_BASE_URL: "https://api.example.com",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in production when both URLs are unset (Better Auth derives them)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(HTTPS_BASELINE);
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in NODE_ENV=development when BETTER_AUTH_URL uses http://localhost", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — AI_MEMORY_ENABLED requires VOYAGE_API_KEY (D3)", () => {
  // Mirror of the Stripe-wired-without-secret guard: if the master flag
  // `AI_MEMORY_ENABLED=true` is on but `VOYAGE_API_KEY` is empty, the
  // first embedding call throws MissingVoyageApiKeyError → 503 у recall,
  // BullMQ-skip у ingest. Boot-time guard surfaces this misconfig у
  // deploy logs замість тихого 503-флоу.

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws у production коли AI_MEMORY_ENABLED=true і VOYAGE_API_KEY порожній", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_MEMORY_ENABLED: "true",
      VOYAGE_API_KEY: "",
    });
    expect(() => assertStartupEnv()).toThrow(/VOYAGE_API_KEY/);
    expect(() => assertStartupEnv()).toThrow(/AI_MEMORY_ENABLED/);
  });

  it("throws коли AI_MEMORY_ENABLED=1 (legacy spelling)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_MEMORY_ENABLED: "1",
      VOYAGE_API_KEY: "",
    });
    expect(() => assertStartupEnv()).toThrow(/VOYAGE_API_KEY/);
  });

  it("throws під Railway prod без NODE_ENV=production", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      NODE_ENV: "test",
      RAILWAY_ENVIRONMENT: "production",
      AI_MEMORY_ENABLED: "true",
      VOYAGE_API_KEY: "",
    });
    expect(() => assertStartupEnv()).toThrow(/VOYAGE_API_KEY/);
  });

  it("does NOT throw у production коли AI_MEMORY_ENABLED=false (master off)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_MEMORY_ENABLED: "false",
      VOYAGE_API_KEY: "",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw у production коли AI_MEMORY_ENABLED=true і VOYAGE_API_KEY заповнений", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      AI_MEMORY_ENABLED: "true",
      VOYAGE_API_KEY: "pa-test-1234567890abcdef",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw у NODE_ENV=development з AI_MEMORY_ENABLED=true і пустим VOYAGE_API_KEY (warning only)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      AI_MEMORY_ENABLED: "true",
      VOYAGE_API_KEY: "",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw у NODE_ENV=test (CI без Voyage key)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "test",
      AI_MEMORY_ENABLED: "true",
      VOYAGE_API_KEY: "",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — backend-perf PR-01: VAPID keypair required in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Prod baseline WITHOUT the VAPID keypair so we exercise the negative path.
  // All other production-required gates are satisfied, so only the VAPID
  // check fires. Legacy PATs cleared (same Git_PAT gate as PROD_BASELINE).
  const VAPID_MISSING_BASELINE = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://hub:hub@127.0.0.1:5432/hub",
    BETTER_AUTH_TOKEN_ENC_KEY: "a".repeat(64),
    NUTRITION_BACKUP_KEY_SECRET: "b".repeat(64),
    METRICS_TOKEN: "c".repeat(64),
    SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
    OPENCLAW_GITHUB_PAT: "",
    Git_PAT: "",
  };

  it("throws in production when both VAPID keys are missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(VAPID_MISSING_BASELINE);
    expect(() => assertStartupEnv()).toThrow(
      /VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/,
    );
  });

  it("throws in production when only the public key is set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...VAPID_MISSING_BASELINE,
      VAPID_PUBLIC_KEY: "d".repeat(80),
    });
    expect(() => assertStartupEnv()).toThrow(/VAPID/);
  });

  it("does NOT throw in production when both VAPID keys are present", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...VAPID_MISSING_BASELINE,
      VAPID_PUBLIC_KEY: "d".repeat(80),
      VAPID_PRIVATE_KEY: "e".repeat(40),
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in NODE_ENV=development when VAPID keys are missing (warn-only)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — STRIPE_ENABLED requires STRIPE_SECRET_KEY (audit 2026-06-11 ws-08)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws in production when STRIPE_ENABLED=true without STRIPE_SECRET_KEY", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      OPENCLAW_GITHUB_PAT: "",
      Git_PAT: "",
      STRIPE_ENABLED: "true",
    });
    expect(() => assertStartupEnv()).toThrow(
      /STRIPE_ENABLED=true requires STRIPE_SECRET_KEY/,
    );
  });

  it("does NOT throw in production when STRIPE_ENABLED=true with full Stripe wiring", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...PROD_BASELINE,
      OPENCLAW_GITHUB_PAT: "",
      Git_PAT: "",
      STRIPE_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_xxx",
      STRIPE_WEBHOOK_SECRET: "whsec_xxx",
      STRIPE_PRICE_ID_PRO_MONTHLY: "price_1AbCdEf123",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in NODE_ENV=development when STRIPE_ENABLED=true without keys", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      STRIPE_ENABLED: "true",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — SENTRY_DSN required in production (audit 2026-06-11 ws-06)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Prod baseline WITHOUT the DSN so the negative path reaches the SENTRY gate
  // (it is deliberately the last production hard-fail in assertStartupEnv, so
  // every other required var must be present here).
  const SENTRY_MISSING_BASELINE = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://hub:hub@127.0.0.1:5432/hub",
    BETTER_AUTH_TOKEN_ENC_KEY: "a".repeat(64),
    NUTRITION_BACKUP_KEY_SECRET: "b".repeat(64),
    METRICS_TOKEN: "c".repeat(64),
    VAPID_PUBLIC_KEY: "d".repeat(80),
    VAPID_PRIVATE_KEY: "e".repeat(40),
    OPENCLAW_GITHUB_PAT: "",
    Git_PAT: "",
  };

  it("throws in production when SENTRY_DSN is missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv(
      SENTRY_MISSING_BASELINE,
    );
    expect(() => assertStartupEnv()).toThrow(/SENTRY_DSN/);
  });

  it("throws under Railway prod even without NODE_ENV=production", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...SENTRY_MISSING_BASELINE,
      NODE_ENV: "test",
      RAILWAY_ENVIRONMENT: "production",
    });
    expect(() => assertStartupEnv()).toThrow(/SENTRY_DSN/);
  });

  it("does NOT throw in production when SENTRY_DSN is set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      ...SENTRY_MISSING_BASELINE,
      SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("does NOT throw in NODE_ENV=development when SENTRY_DSN is missing (warn-only)", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});

describe("assertStartupEnv — Phase 7 UA billing provider keys", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws when LIQPAY_ENABLED=true but keys are missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      LIQPAY_ENABLED: "true",
    });
    expect(() => assertStartupEnv()).toThrow(/LIQPAY_PUBLIC_KEY/);
  });

  it("does NOT throw when LIQPAY_ENABLED=true and both keys are set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      LIQPAY_ENABLED: "true",
      LIQPAY_PUBLIC_KEY: "sandbox_pub",
      LIQPAY_PRIVATE_KEY: "sandbox_priv",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });

  it("throws when PLATA_ENABLED=true but PLATA_TOKEN is missing", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      PLATA_ENABLED: "true",
    });
    expect(() => assertStartupEnv()).toThrow(/PLATA_TOKEN/);
  });

  it("does NOT throw when PLATA_ENABLED=true and PLATA_TOKEN is set", async () => {
    const assertStartupEnv = await loadAssertStartupEnv({
      NODE_ENV: "development",
      PLATA_ENABLED: "true",
      PLATA_TOKEN: "test-merchant-token",
    });
    expect(() => assertStartupEnv()).not.toThrow();
  });
});
