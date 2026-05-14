import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import {
  authActiveFixtures,
  authLoggedOutFixture,
  AuthSessionResponseSchema,
  assertAuthFixturesValid,
  type AuthActiveFixtureCase,
} from "@sergeant/shared";

/**
 * Producer-side contract test for `GET /api/auth/get-session`.
 *
 * **Goal:** prove that the Better Auth `toNodeHandler(auth)` mount in
 * `apps/server/src/routes/auth.ts` forwards the canonical wire shapes
 * documented in `@sergeant/shared/contract-fixtures/auth` byte-for-byte
 * to the wire. The matching consumer test lives in
 * `apps/web/src/test/contract/auth.contract.test.ts`.
 *
 * Together these two files form the minimum viable contract for the
 * Better Auth session endpoint:
 *
 *   session-table-row → auth.handler → fixture
 *   fixture           → schema       → typed UI value
 *
 * If Better Auth ever changes the wire shape (e.g. moving `expiresAt`
 * from ISO string to numeric epoch), BOTH tests must update — consumer
 * test fails on schema mismatch in the fixture, producer test fails on
 * mismatch in the handler-emitted body.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 *
 * **Why mock `auth.handler` instead of letting Better Auth run live.**
 * The full Better Auth flow needs Postgres + the encrypting adapter +
 * the bearer + Expo plugins; running it inside a unit test reproduces
 * what the integration test in
 * `apps/server/src/__tests__/session-protection.integration.test.ts`
 * already covers. The *contract* is independent of Better Auth's
 * internals: it's about what bytes the route mount emits. Mocking
 * `auth.handler` to return the canonical fixture bytes is the smallest
 * possible test that locks the wire shape.
 */

const { mockPool, queryMock, getSessionUserMock, authHandlerMock } = vi.hoisted(
  () => {
    const queryMock = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const mockPool = {
      query: queryMock,
      connect: vi.fn(),
      on: vi.fn(),
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
    const getSessionUserMock = vi.fn().mockResolvedValue(null);
    const authHandlerMock = vi.fn(
      async () => new Response(null, { status: 404 }),
    );
    return { mockPool, queryMock, getSessionUserMock, authHandlerMock };
  },
);

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: authHandlerMock },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

// The `authSensitiveRateLimit` middleware does its own `pool.query(...)` to
// drive the Postgres-backed bucket. We're testing the wire-shape contract
// here, not the limiter (covered by `http/rateLimit.test.ts`), so swap it
// for a passthrough — otherwise `queryMock.mock.calls[0]` would point at
// the limiter's `INSERT INTO rate_limit_buckets`, not at the handler.
vi.mock("./../http/rateLimit.js", async () => {
  const actual = await vi.importActual<typeof import("./../http/rateLimit.js")>(
    "./../http/rateLimit.js",
  );
  return {
    ...actual,
    rateLimitExpress: () => (_req: unknown, _res: unknown, next: () => void) =>
      next(),
    authSensitiveRateLimit: (_req: unknown, _res: unknown, next: () => void) =>
      next(),
  };
});

import { createApp } from "./../app.js";

const ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_EMAIL"];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  authHandlerMock.mockReset();
  authHandlerMock.mockResolvedValue(new Response(null, { status: 404 }));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function jsonAuthResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const ACTIVE_NAMES: readonly AuthActiveFixtureCase[] = [
  "webCookieSession",
  "bearerMobileSession",
  "unverifiedEmailSession",
] as const;

describe("contract producer: GET /api/auth/get-session", () => {
  it("fixtures self-check — every named fixture parses through AuthSessionResponseSchema", () => {
    // Cheap sanity gate so the rest of the suite can rely on the fixtures
    // being byte-correct against the wire schema.
    expect(() => assertAuthFixturesValid()).not.toThrow();
  });

  it.each(ACTIVE_NAMES)(
    "fixture %s — Better Auth response round-trips through the route mount",
    async (name) => {
      const fixture = authActiveFixtures[name];
      authHandlerMock.mockResolvedValueOnce(jsonAuthResponse(fixture));

      const app = createApp();
      const res = await request(app).get("/api/auth/get-session");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fixture);
      // And: the body the wire emitted still parses through the same
      // schema the api-client uses. This catches the case where the mock
      // returns the right bytes but the schema has drifted underneath.
      expect(() => AuthSessionResponseSchema.parse(res.body)).not.toThrow();
    },
  );

  it("logged-out — Better Auth returns JSON `null`, route forwards it byte-for-byte", async () => {
    // `null` is the trickiest arm: supertest's `res.body` is `{}` for an
    // empty body but `null` for the JSON literal `null`. We verify both
    // the wire bytes (via `res.text`) and the parsed body, so a future
    // regression that swaps `null` for `{}` (or 401) fails loudly.
    authHandlerMock.mockResolvedValueOnce(
      jsonAuthResponse(authLoggedOutFixture),
    );

    const app = createApp();
    const res = await request(app).get("/api/auth/get-session");

    expect(res.status).toBe(200);
    expect(res.text).toBe("null");
    expect(res.body).toBeNull();
    expect(AuthSessionResponseSchema.parse(res.body)).toBeNull();
  });

  it("route forwards the request to `auth.handler` exactly once", async () => {
    // Negative guard for the mount: if a future PR splits the bearer +
    // cookie paths into two handlers, this assertion catches it before
    // the fan-out doubles every auth request.
    authHandlerMock.mockResolvedValueOnce(
      jsonAuthResponse(authActiveFixtures.webCookieSession),
    );

    const app = createApp();
    await request(app).get("/api/auth/get-session");

    expect(authHandlerMock).toHaveBeenCalledTimes(1);
  });
});
