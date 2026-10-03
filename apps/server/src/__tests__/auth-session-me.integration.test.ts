/**
 * Integration tests for auth session handling on GET /api/me.
 *
 * Validates the full request path — Testcontainers Postgres → createApp() →
 * requireSession middleware → /api/me route handler — using the shared
 * bootIntegrationHarness and a vi.hoisted mock for getSessionUser (same
 * pattern as transcribe-usd-cap.e2e.test.ts).
 *
 * CI: fails loudly if Docker is not available (no silent skip).
 * Local: skips when testcontainers cannot start.
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
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  INTEGRATION_TIMEOUT_MS,
} from "../test/createIntegrationApp.js";
import type { Pool } from "pg";

// vi.hoisted ensures the mock factory runs before any module import so that
// getSessionUser is intercepted on every import path (requireSession →
// getSessionUser → Better Auth). Pattern mirrors transcribe-usd-cap.e2e.test.ts.
const { getSessionUserMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
}));

vi.mock("../auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth.js")>();
  return { ...actual, getSessionUser: getSessionUserMock };
});

const TEST_USER_ID = "user_auth_session_me_int";
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
    await seedIntegrationUser(pool, TEST_USER_ID, TEST_USER_EMAIL);
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[auth-session-me integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(() => {
  getSessionUserMock.mockReset();
  // Default: no session — individual tests override when authentication needed.
  getSessionUserMock.mockResolvedValue(null);
});

describe("GET /api/me — auth session integration", () => {
  it("authenticated user (mocked session) → 200 + correct user id in response", async (ctx) => {
    if (!dockerAvailable || !app) return ctx.skip();

    getSessionUserMock.mockResolvedValue({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      name: "Auth Session Test",
      image: null,
      emailVerified: true,
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer test-session-token");

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(TEST_USER_ID);
    expect(res.body.user.email).toBe(TEST_USER_EMAIL);
    expect(res.body.user.emailVerified).toBe(true);
    // Hard Rule #1: id must be a string (not bigint-leaked)
    expect(typeof res.body.user.id).toBe("string");
  });

  it("unauthenticated request (getSessionUser returns null) → 401 UNAUTHORIZED", async (ctx) => {
    if (!dockerAvailable || !app) return ctx.skip();

    // getSessionUserMock returns null by default (set in beforeEach).
    const res = await request(app).get("/api/me");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("Bearer token header → requireSession resolves → 200 + user shape", async (ctx) => {
    if (!dockerAvailable || !app) return ctx.skip();

    getSessionUserMock.mockResolvedValue({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      name: "Bearer Token User",
      image: "https://example.com/avatar.png",
      emailVerified: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer valid-bearer-token");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      emailVerified: false,
    });
    // createdAt must be serialized as ISO string, never as Date object
    expect(typeof res.body.user.createdAt).toBe("string");
    expect(res.body.user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("invalid/expired session (getSessionUser returns null) → 401", async (ctx) => {
    if (!dockerAvailable || !app) return ctx.skip();

    // Simulate expired or invalid token: getSessionUser returns null.
    getSessionUserMock.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer expired-or-invalid-token");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    // H8: requireSession sets CORP=same-origin before resolving auth,
    // so even 401 responses carry the header.
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });
});
