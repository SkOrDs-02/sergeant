/**
 * Integration tests for coach memory handlers (GET + POST /api/coach/memory).
 *
 * Uses a real Postgres container against the `coach_memory` table.
 * The LLM/Anthropic path (POST /api/coach/insight) is NOT tested here —
 * that requires network access and is covered by E2E.
 *
 * Tests:
 *   1. POST /api/coach/memory → UPSERT: creates row on first call, updates on second.
 *   2. POST with blob > MAX_BLOB_SIZE → 413 response, no DB write.
 *   3. GET /api/coach/memory round-trip: data stored by POST is returned by GET.
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
import { MAX_BLOB_SIZE } from "./coach.js";

let harness: IntegrationHarness;
let dockerAvailable = false;

let coachMemoryPostFn: (req: Request, res: Response) => Promise<void>;
let coachMemoryGetFn: (req: Request, res: Response) => Promise<void>;

const USER_ID = "u_coach_intg_01";

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

function makePostReq(userId: string, body: Record<string, unknown>): Request {
  return {
    method: "POST",
    body,
    user: { id: userId },
  } as unknown as Request;
}

function makeGetReq(userId: string): Request {
  return {
    method: "GET",
    body: {},
    user: { id: userId },
  } as unknown as Request;
}

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      "[coach integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
    return;
  }

  // Mock db.js with the real test pool so coach handlers hit the test DB.
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

  // Stub LLM dependencies (only needed for coachInsight, not tested here).
  vi.doMock("../../lib/llm/provider.js", () => ({
    getLLMProvider: vi.fn(),
    invokeLLM: vi.fn(),
  }));

  vi.doMock("../../push/send.js", () => ({
    sendToUser: vi.fn(),
    sendToUserQuietly: vi.fn(),
  }));

  vi.doMock("./aiQuota.js", () => ({
    resolveProTier: vi.fn(async () => ({
      model: "claude-sonnet-4-5",
      tier: "premium",
    })),
  }));

  vi.doMock("../../obs/errors.js", () => ({
    makeAiProviderError: vi.fn((opts: unknown) => new Error(String(opts))),
  }));

  const mod = await import("./coach.js");
  coachMemoryPostFn = mod.coachMemoryPost;
  coachMemoryGetFn = mod.coachMemoryGet;
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER_ID);
});

describe("coach memory — integration (real Postgres)", () => {
  it(
    "POST /api/coach/memory UPSERT: creates row on first call, updates version on second",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      const digest = {
        weeklyDigest: {
          weekKey: "2026-W27",
          weekRange: "Jul 01 – Jul 07",
          generatedAt: "2026-07-07T10:00:00.000Z",
          finyk: { summary: "Spent 5000 UAH this week" },
          overallRecommendations: ["Save more"],
          correlations: [],
        },
      };

      // First POST — should create a new row.
      const res1 = makeRes();
      await coachMemoryPostFn(makePostReq(USER_ID, digest), res1);
      expect(res1.statusCode).toBe(200);
      expect(res1.body).toMatchObject({ ok: true });

      const { rows: rows1 } = await harness.pool.query<{ version: number }>(
        `SELECT version FROM coach_memory WHERE user_id = $1`,
        [USER_ID],
      );
      expect(rows1).toHaveLength(1);
      expect(rows1[0]!.version).toBe(1);

      // Second POST — should increment version (UPSERT).
      const res2 = makeRes();
      await coachMemoryPostFn(makePostReq(USER_ID, digest), res2);
      expect(res2.statusCode).toBe(200);

      const { rows: rows2 } = await harness.pool.query<{ version: number }>(
        `SELECT version FROM coach_memory WHERE user_id = $1`,
        [USER_ID],
      );
      expect(rows2).toHaveLength(1);
      expect(rows2[0]!.version).toBe(2);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "POST with blob > MAX_BLOB_SIZE → 413, no row written",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      // Build a payload that exceeds MAX_BLOB_SIZE after JSON serialization.
      // A summary string longer than MAX_BLOB_SIZE guarantees the serialized
      // CoachMemory object will also exceed it.
      const hugeSummary = "x".repeat(MAX_BLOB_SIZE + 1024);
      const body = {
        weeklyDigest: {
          weekKey: "2026-W01",
          finyk: { summary: hugeSummary },
          overallRecommendations: [],
          correlations: [],
        },
      };

      const res = makeRes();
      await coachMemoryPostFn(makePostReq(USER_ID, body), res);

      expect(res.statusCode).toBe(413);
      expect((res.body as Record<string, unknown>)["error"]).toMatch(
        /blob too large/i,
      );

      // No row must be written.
      const { rows } = await harness.pool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM coach_memory WHERE user_id = $1`,
        [USER_ID],
      );
      expect(Number(rows[0]!.c)).toBe(0);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "GET /api/coach/memory round-trip: stored data returned correctly",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();

      const digest = {
        weeklyDigest: {
          weekKey: "2026-W28",
          weekRange: "Jul 08 – Jul 14",
          generatedAt: "2026-07-10T09:00:00.000Z",
          fizruk: { summary: "3 workouts completed" },
          overallRecommendations: ["Keep it up"],
          correlations: ["Training days: lower spending"],
        },
      };

      // Write via POST.
      await coachMemoryPostFn(makePostReq(USER_ID, digest), makeRes());

      // Read via GET.
      const res = makeRes();
      await coachMemoryGetFn(makeGetReq(USER_ID), res);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        ok: boolean;
        memory: {
          weeklyDigests: Array<{
            weekKey: string;
            fizruk?: { summary?: string };
          }>;
        };
      };
      expect(body.ok).toBe(true);
      expect(body.memory).not.toBeNull();
      expect(body.memory.weeklyDigests).toHaveLength(1);
      expect(body.memory.weeklyDigests[0]!.weekKey).toBe("2026-W28");
      expect(body.memory.weeklyDigests[0]!.fizruk?.summary).toBe(
        "3 workouts completed",
      );
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
