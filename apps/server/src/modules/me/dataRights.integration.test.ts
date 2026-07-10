/**
 * Integration tests for GDPR data-rights routes:
 *   DELETE /api/me      — account deletion + CASCADE
 *   GET /api/me/export  — data export includes seeded rows
 *   PATCH /api/me/preferences — upsert round-trip
 *
 * Uses Testcontainers Postgres + createApp() + mocked getSessionUser.
 * Pattern mirrors transcribe-usd-cap.e2e.test.ts (vi.hoisted + dynamic import).
 *
 * CI: fails loudly if Docker unavailable. Local: skips gracefully.
 *
 * PR-2 of the integration test batch (cursor/pr2-auth-datarights-integration-275a).
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
  CSRF_HEADERS,
  INTEGRATION_TIMEOUT_MS,
} from "../../test/createIntegrationApp.js";

const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("../../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth.js")>();
  return { ...actual, getSessionUser: getSessionUserMock };
});

const TEST_USER_ID = "user_datarights_int";
const TEST_USER_EMAIL = `${TEST_USER_ID}@test.local`;

let app: Express | undefined;
let pool: Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

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
      `[dataRights integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  getSessionUserMock.mockReset();
  if (!pool) return;

  // Re-seed the user before each test so DELETE tests start from a clean state.
  await seedIntegrationUser(pool, TEST_USER_ID, TEST_USER_EMAIL);

  // Remove any leftover preferences or usage rows from previous tests.
  await pool.query(`DELETE FROM user_preferences WHERE user_id = $1`, [
    TEST_USER_ID,
  ]);
  await pool.query(`DELETE FROM ai_usage_daily WHERE subject_key = $1`, [
    `u:${TEST_USER_ID}`,
  ]);

  getSessionUserMock.mockResolvedValue({
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    name: "DataRights Test",
    image: null,
    emailVerified: true,
  });
});

describe("DELETE /api/me — GDPR account deletion + CASCADE", () => {
  it("deletes user row and returns ok:true with deletedAt timestamp", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    // Seed a user_preferences row to verify ON DELETE CASCADE.
    await pool.query(
      `INSERT INTO user_preferences (user_id, analytics, ai_memory, push_notifications)
       VALUES ($1, true, true, false)`,
      [TEST_USER_ID],
    );

    const res = await request(app)
      .delete("/api/me")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true });
    expect(res.body.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // User row must be gone from the DB.
    const { rows: userRows } = await pool.query(
      `SELECT id FROM "user" WHERE id = $1`,
      [TEST_USER_ID],
    );
    expect(userRows).toHaveLength(0);

    // CASCADE: user_preferences row must also be deleted.
    const { rows: prefRows } = await pool.query(
      `SELECT user_id FROM user_preferences WHERE user_id = $1`,
      [TEST_USER_ID],
    );
    expect(prefRows).toHaveLength(0);
  });

  it("second delete is a safe no-op — returns ok:true when user already gone", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    // First delete — removes the user row.
    const first = await request(app)
      .delete("/api/me")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer");
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    // Second delete: auth mock still resolves the user (mock is not DB-backed),
    // so requireSession passes. deleteUserData runs DELETE WHERE id=... on a
    // missing row — 0 rows affected — then returns ok:true (safe no-op).
    const second = await request(app)
      .delete("/api/me")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer");

    // Either 200 ok (safe no-op) or 401 (if the session table cascaded and
    // Better Auth rejects the token) — both represent correct behaviour.
    expect([200, 401]).toContain(second.status);
    if (second.status === 200) {
      expect(second.body.ok).toBe(true);
    }
  });
});

describe("GET /api/me/export — GDPR data export", () => {
  it("returns valid export structure including seeded ai_usage_daily row", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    // Seed an ai_usage_daily row (no FK to user — uses subject_key = 'u:<id>').
    await pool.query(
      `INSERT INTO ai_usage_daily (subject_key, usage_day, bucket, request_count, usd_micros)
       VALUES ($1, CURRENT_DATE, 'anthropic:claude-3-5-haiku', 3, 900)
       ON CONFLICT (subject_key, usage_day, bucket) DO NOTHING`,
      [`u:${TEST_USER_ID}`],
    );

    const res = await request(app)
      .get("/api/me/export")
      .set("Authorization", "Bearer test-bearer");

    expect(res.status).toBe(200);
    expect(res.body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.user.id).toBe(TEST_USER_ID);

    // Preferences always present (defaults when no row exists).
    expect(res.body.preferences).toMatchObject({
      analytics: true,
      aiMemory: true,
      pushNotifications: false,
    });

    // module_data is always [] after migration 046 dropped the table.
    expect(res.body.data.moduleData).toEqual([]);

    // Seeded ai_usage row must appear in the export.
    expect(Array.isArray(res.body.data.ai.usageDaily)).toBe(true);
    expect(res.body.data.ai.usageDaily.length).toBeGreaterThan(0);

    const mono = res.body.data.mono;
    expect(mono.connection).toBeNull();
    expect(Array.isArray(mono.accounts)).toBe(true);
    expect(Array.isArray(mono.transactions)).toBe(true);
  });
});

describe("PATCH /api/me/preferences — upsert round-trip", () => {
  it("upserts preferences and GET /api/me/preferences reflects the change", async (ctx) => {
    if (!dockerAvailable || !app || !pool) return ctx.skip();

    const patch = { analytics: false, pushNotifications: true };

    const patchRes = await request(app)
      .patch("/api/me/preferences")
      .set(CSRF_HEADERS)
      .set("Authorization", "Bearer test-bearer")
      .set("Content-Type", "application/json")
      .send(patch);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.analytics).toBe(false);
    expect(patchRes.body.pushNotifications).toBe(true);
    expect(patchRes.body.aiMemory).toBe(true); // default, not patched
    expect(patchRes.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Round-trip: GET /api/me/preferences must reflect the persisted values.
    const getRes = await request(app)
      .get("/api/me/preferences")
      .set("Authorization", "Bearer test-bearer");

    expect(getRes.status).toBe(200);
    expect(getRes.body.analytics).toBe(false);
    expect(getRes.body.pushNotifications).toBe(true);
    expect(getRes.body.aiMemory).toBe(true);
  });
});
