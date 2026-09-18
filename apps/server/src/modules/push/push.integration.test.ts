/**
 * Integration tests for push subscription handlers.
 *
 * Strategy: boot a real Postgres container, mock `web-push` / env / helper
 * modules, then call `subscribe` / `unsubscribe` handlers directly with
 * fake req/res objects so the real `push_subscriptions` table is exercised.
 *
 * Tests:
 *   1. POST subscribe → row in push_subscriptions
 *   2. Re-subscribe with same endpoint → ON CONFLICT UPDATE (deleted_at cleared)
 *   3. DELETE (unsubscribe) → soft-delete (deleted_at set)
 *   4. User-B isolation: User-B's subscription is not visible for User-A
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
import type { Request, Response } from "express";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";

// These will be set after bootIntegrationHarness has a real pool.
let harness: IntegrationHarness;
let dockerAvailable = false;

// Handlers resolved after all mocks are in place.
let subscribeFn: (req: Request, res: Response) => Promise<void>;
let unsubscribeFn: (req: Request, res: Response) => Promise<void>;

const USER_A = "u_push_intg_a";
const USER_B = "u_push_intg_b";

const ENDPOINT_A = "https://push.example/sub-a";
const ENDPOINT_B = "https://push.example/sub-b";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

function makeReq(userId: string, body: Record<string, unknown>): Request {
  return {
    method: "POST",
    body,
    user: { id: userId },
  } as unknown as Request;
}

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({
      app: false,
      env: {
        VAPID_PUBLIC_KEY: "BPUB_TEST",
        VAPID_PRIVATE_KEY: "BPRIV_TEST",
        VAPID_EMAIL: "mailto:test@example.com",
      },
    });
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      "[push integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }

  // Register all mocks BEFORE the dynamic import so module-load code
  // (VAPID setup, vapidReady flag) sees the stubs.
  vi.doMock("../../env/env.js", () => ({
    env: {
      VAPID_PUBLIC_KEY: "BPUB_TEST",
      VAPID_PRIVATE_KEY: "BPRIV_TEST",
      VAPID_EMAIL: "mailto:test@example.com",
      NODE_ENV: "test",
      PUSH_SEND_TARGET_LIMIT: 10,
      PUSH_SEND_TARGET_WINDOW_MS: 60_000,
      PUSH_INTERNAL_ALLOWED_IPS: "",
    },
  }));

  vi.doMock("web-push", () => ({
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(),
    },
  }));

  vi.doMock("../../db.js", () => ({
    default: harness.pool,
    pool: harness.pool,
    query: (text: string, values?: unknown[]) =>
      harness.pool.query(text, values),
    ensureSchema: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock("../../obs/logger.js", () => ({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  }));

  vi.doMock("../../obs/metrics.js", () => ({
    pushSendsTotal: { inc: vi.fn() },
    externalHttpRequestsTotal: { inc: vi.fn() },
  }));

  vi.doMock("../../lib/webpushSend.js", () => ({
    sendWebPush: vi.fn(async () => ({ outcome: "ok" })),
  }));

  vi.doMock("../../push/send.js", () => ({
    sendToUser: vi.fn(async () => ({ delivered: {}, cleaned: 0, errors: [] })),
    sendToUserQuietly: vi.fn(async () => undefined),
  }));

  vi.doMock("../../http/rateLimit.js", () => ({
    getIp: vi.fn(() => "127.0.0.1"),
    getPerTargetRateLimit: vi.fn(async () => ({
      ok: true,
      remaining: 9,
      resetAt: Date.now() + 60_000,
    })),
  }));

  vi.doMock("./audit.js", () => ({
    logPushSend: vi.fn(),
  }));

  const mod = await import("./push.js");
  subscribeFn = mod.subscribe;
  unsubscribeFn = mod.unsubscribe;
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER_A);
  await seedIntegrationUser(harness.pool, USER_B);
});

describe("push — integration (real Postgres)", () => {
  it(
    "POST subscribe → push_subscriptions row is created",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      const res = makeRes();
      await subscribeFn(
        makeReq(USER_A, {
          endpoint: ENDPOINT_A,
          keys: { p256dh: "p256_a", auth: "auth_a" },
        }),
        res,
      );

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ok: true });

      const { rows } = await harness.pool.query<{
        user_id: string;
        endpoint: string;
        deleted_at: Date | null;
      }>(
        `SELECT user_id, endpoint, deleted_at
           FROM push_subscriptions WHERE endpoint = $1`,
        [ENDPOINT_A],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.user_id).toBe(USER_A);
      expect(rows[0]!.deleted_at).toBeNull();
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "re-subscribe with same endpoint → ON CONFLICT UPDATE (deleted_at cleared)",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      // First subscribe.
      await subscribeFn(
        makeReq(USER_A, {
          endpoint: ENDPOINT_A,
          keys: { p256dh: "p256_a", auth: "auth_a" },
        }),
        makeRes(),
      );

      // Manually soft-delete to simulate a stale subscription.
      await harness.pool.query(
        `UPDATE push_subscriptions SET deleted_at = NOW() WHERE endpoint = $1`,
        [ENDPOINT_A],
      );

      // Re-subscribe should clear deleted_at.
      await subscribeFn(
        makeReq(USER_A, {
          endpoint: ENDPOINT_A,
          keys: { p256dh: "p256_a_new", auth: "auth_a_new" },
        }),
        makeRes(),
      );

      const { rows } = await harness.pool.query<{
        p256dh: string;
        deleted_at: Date | null;
      }>(
        `SELECT p256dh, deleted_at
           FROM push_subscriptions WHERE endpoint = $1`,
        [ENDPOINT_A],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.p256dh).toBe("p256_a_new");
      expect(rows[0]!.deleted_at).toBeNull();
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "DELETE unsubscribe → soft-delete (deleted_at is set)",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      // Create subscription first.
      await subscribeFn(
        makeReq(USER_A, {
          endpoint: ENDPOINT_A,
          keys: { p256dh: "p256_a", auth: "auth_a" },
        }),
        makeRes(),
      );

      // Soft-delete via unsubscribe.
      const deleteReq = {
        method: "DELETE",
        body: { endpoint: ENDPOINT_A },
        user: { id: USER_A },
      } as unknown as Request;

      const res = makeRes();
      await unsubscribeFn(deleteReq, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ ok: true });

      const { rows } = await harness.pool.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM push_subscriptions WHERE endpoint = $1`,
        [ENDPOINT_A],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.deleted_at).not.toBeNull();
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "User-A subscription is not visible as User-B subscription",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      // Subscribe User A.
      await subscribeFn(
        makeReq(USER_A, {
          endpoint: ENDPOINT_A,
          keys: { p256dh: "p256_a", auth: "auth_a" },
        }),
        makeRes(),
      );

      // Subscribe User B.
      await subscribeFn(
        makeReq(USER_B, {
          endpoint: ENDPOINT_B,
          keys: { p256dh: "p256_b", auth: "auth_b" },
        }),
        makeRes(),
      );

      // Each user has exactly one subscription row with their own user_id.
      const { rows: rowsA } = await harness.pool.query<{ user_id: string }>(
        `SELECT user_id FROM push_subscriptions WHERE user_id = $1`,
        [USER_A],
      );
      const { rows: rowsB } = await harness.pool.query<{ user_id: string }>(
        `SELECT user_id FROM push_subscriptions WHERE user_id = $1`,
        [USER_B],
      );

      expect(rowsA).toHaveLength(1);
      expect(rowsB).toHaveLength(1);
      expect(rowsA[0]!.user_id).toBe(USER_A);
      expect(rowsB[0]!.user_id).toBe(USER_B);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
