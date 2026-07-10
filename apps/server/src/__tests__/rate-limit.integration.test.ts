/**
 * Integration tests for auth-sensitive rate limiting against real Postgres
 * (`rate_limit_buckets`, migration 037).
 *
 * Exercises the full stack: Testcontainers → createApp() →
 * authSensitiveRateLimit → rateLimitExpress (Postgres path, Redis disabled).
 *
 * Closes audit `docs/90-work/audits/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`
 * §7.2 (rate-limit hit → 429 with Retry-After).
 *
 * CI: fails loudly when Docker is unavailable.
 * Local: skips when testcontainers cannot start.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  CSRF_HEADERS,
  INTEGRATION_TIMEOUT_MS,
} from "../test/createIntegrationApp.js";

// Force Postgres-backed buckets — Redis would bypass the table under test.
vi.mock("../lib/redis.js", () => ({
  getRedis: vi.fn(() => null),
}));

const SIGN_IN_BODY = {
  email: "rate-limit-integ@example.com",
  password: "wrong-password-rate-limit-integ",
};

let app: Express | undefined;
let pool: Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

function postSignIn(expressApp: Express) {
  return request(expressApp)
    .post("/api/auth/sign-in/email")
    .set("Content-Type", "application/json")
    .set(CSRF_HEADERS)
    .send(SIGN_IN_BODY);
}

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness({
      env: {
        // Tight cap so the third attempt trips the limiter in one test run.
        AUTH_RATE_LIMIT_MAX: "2",
        AUTH_RATE_LIMIT_WINDOW_SEC: "60",
        RATE_LIMIT_FAIL_CLOSED_AUTH: "false",
      },
    });
    app = harness.app;
    pool = harness.pool;
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[rate-limit integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!pool) return;
  await pool.query("TRUNCATE rate_limit_buckets RESTART IDENTITY");
});

describe("auth sensitive rate limit — Postgres integration", () => {
  it(
    "third POST /api/auth/sign-in/email within window → 429 RATE_LIMIT_IP",
    async (ctx) => {
      if (!dockerAvailable || !app) return ctx.skip();

      const first = await postSignIn(app);
      const second = await postSignIn(app);
      const third = await postSignIn(app);

      expect(first.status).not.toBe(429);
      expect(second.status).not.toBe(429);
      expect(third.status).toBe(429);
      expect(third.body).toMatchObject({
        code: "RATE_LIMIT_IP",
      });
      expect(typeof third.body.message).toBe("string");
      expect(third.body.message).toContain("Забагато");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "429 response includes Retry-After and RateLimit-* headers",
    async (ctx) => {
      if (!dockerAvailable || !app) return ctx.skip();

      await postSignIn(app);
      await postSignIn(app);
      const blocked = await postSignIn(app);

      expect(blocked.status).toBe(429);
      expect(blocked.headers["retry-after"]).toBeDefined();
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
      expect(blocked.headers["ratelimit-limit"]).toBe("2");
      expect(blocked.headers["ratelimit-remaining"]).toBe("0");
      expect(blocked.headers["ratelimit-reset"]).toBeDefined();
      expect(Number(blocked.headers["ratelimit-reset"])).toBeGreaterThan(0);
      expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
