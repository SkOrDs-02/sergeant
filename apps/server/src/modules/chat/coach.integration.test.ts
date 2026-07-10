/**
 * Integration tests for coach memory routes (GET + POST /api/coach/memory).
 *
 * Uses Testcontainers Postgres + createApp() + mocked getSessionUser
 * (same pattern as dataRights / auth-session-me integration suites).
 * Handler-direct + vi.doMock("../../db.js") was flaky in CI: coach.ts
 * imported the module-level pool before the mock applied → ECONNREFUSED
 * on localhost:5432.
 *
 * Tests:
 *   1. POST /api/coach/memory → UPSERT: creates row on first call, updates on second.
 *   2. POST with blob > MAX_BLOB_SIZE → 413, no row written.
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
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  CSRF_HEADERS,
  INTEGRATION_TIMEOUT_MS,
} from "../../test/createIntegrationApp.js";

// Mirror coach.ts MAX_BLOB_SIZE — never static-import ./coach.js here; that
// loads db.ts before bootIntegrationHarness() sets DATABASE_URL.
const MAX_BLOB_SIZE = 5 * 1024 * 1024;

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("../../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth.js")>();
  return { ...actual, getSessionUser: getSessionUserMock };
});

const USER_ID = "u_coach_intg_01";
const USER_EMAIL = `${USER_ID}@test.local`;

let app: Express | undefined;
let pool: Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

function authedSession() {
  getSessionUserMock.mockResolvedValue({
    id: USER_ID,
    email: USER_EMAIL,
    name: USER_ID,
    emailVerified: true,
  });
}

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness();
    app = harness.app;
    pool = harness.pool;
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[coach integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  getSessionUserMock.mockReset();
  if (!pool) return;
  await truncateIntegrationTables(pool);
  await seedIntegrationUser(pool, USER_ID, USER_EMAIL);
  authedSession();
});

describe("coach memory — integration (real Postgres)", () => {
  it(
    "POST /api/coach/memory UPSERT: creates row on first call, updates version on second",
    async (ctx) => {
      if (!dockerAvailable || !app || !pool) return ctx.skip();

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

      const res1 = await request(app)
        .post("/api/coach/memory")
        .set(CSRF_HEADERS)
        .set("Authorization", "Bearer test-bearer")
        .send(digest);
      expect(res1.status).toBe(200);
      expect(res1.body).toMatchObject({ ok: true });

      const { rows: rows1 } = await pool.query<{ version: number }>(
        `SELECT version FROM coach_memory WHERE user_id = $1`,
        [USER_ID],
      );
      expect(rows1).toHaveLength(1);
      expect(rows1[0]!.version).toBe(1);

      const res2 = await request(app)
        .post("/api/coach/memory")
        .set(CSRF_HEADERS)
        .set("Authorization", "Bearer test-bearer")
        .send(digest);
      expect(res2.status).toBe(200);

      const { rows: rows2 } = await pool.query<{ version: number }>(
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
      if (!dockerAvailable || !app || !pool) return ctx.skip();

      const hugeSummary = "x".repeat(MAX_BLOB_SIZE + 1024);
      const body = {
        weeklyDigest: {
          weekKey: "2026-W01",
          finyk: { summary: hugeSummary },
          overallRecommendations: [],
          correlations: [],
        },
      };

      const res = await request(app)
        .post("/api/coach/memory")
        .set(CSRF_HEADERS)
        .set("Authorization", "Bearer test-bearer")
        .send(body);

      expect(res.status).toBe(413);
      expect(res.body.error).toMatch(/blob too large/i);

      const { rows } = await pool.query<{ c: string }>(
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
      if (!dockerAvailable || !app || !pool) return ctx.skip();

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

      const postRes = await request(app)
        .post("/api/coach/memory")
        .set(CSRF_HEADERS)
        .set("Authorization", "Bearer test-bearer")
        .send(digest);
      expect(postRes.status).toBe(200);

      const getRes = await request(app)
        .get("/api/coach/memory")
        .set("Authorization", "Bearer test-bearer");

      expect(getRes.status).toBe(200);
      expect(getRes.body.ok).toBe(true);
      expect(getRes.body.memory).not.toBeNull();
      expect(getRes.body.memory.weeklyDigests).toHaveLength(1);
      expect(getRes.body.memory.weeklyDigests[0]!.weekKey).toBe("2026-W28");
      expect(getRes.body.memory.weeklyDigests[0]!.fizruk?.summary).toBe(
        "3 workouts completed",
      );
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
