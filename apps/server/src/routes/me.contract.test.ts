import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import {
  meFixtures,
  type MeFixtureCase,
  type MeResponse,
} from "@sergeant/shared";

/**
 * Producer-side contract test for `GET /api/me` / `GET /api/v1/me`.
 *
 * **Goal:** prove that the route's response builder, given a typical
 * Better Auth session-user shape, emits the same wire JSON as the
 * canonical fixtures in `@sergeant/shared/contract-fixtures/me`. The
 * matching consumer test lives in
 * `apps/web/src/test/contract/me.contract.test.ts`.
 *
 * Together these two files form the minimum viable contract:
 *
 *   server-user-row → route serializer → fixture
 *   fixture         → api-client       → typed UI value
 *
 * If the schema gets a new required field, BOTH tests must update —
 * consumer test fails on missing field in the fixture, producer test
 * fails on missing field in the response.
 *
 * Closes diagnostic §7.4 (`docs/diagnostics/2026-05-03-web-deep-dive/04-security-observability-testing-devx.md`).
 */

const { mockPool, queryMock, getSessionUserMock } = vi.hoisted(() => {
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
  return { mockPool, queryMock, getSessionUserMock };
});

vi.mock("./../db.js", () => ({
  default: mockPool,
  pool: mockPool,
  query: queryMock,
  ensureSchema: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./../auth.js", () => ({
  auth: { handler: async () => new Response(null, { status: 404 }) },
  getSessionUser: getSessionUserMock,
  getSessionUserSoft: vi.fn().mockResolvedValue(null),
}));

import { createApp } from "./../app.js";

const ENV_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_EMAIL"];
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

/**
 * Translate a contract fixture into the shape Better Auth's
 * `getSessionUser()` would return for the same user. The route's job is
 * to flatten that into the canonical fixture; this helper is what the
 * test feeds the auth mock.
 *
 * `createdAt` from Better Auth comes as a `Date` (or sometimes a
 * stringified ISO when the adapter has already serialised it). We
 * exercise both paths: numbered fixtures alternate between Date and
 * string.
 */
function authedUserFromFixture(
  fixture: MeResponse,
  variant: "date" | "string" | "missing",
): Record<string, unknown> {
  const { user } = fixture;
  const base: Record<string, unknown> = {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
  };
  if (variant === "missing" || user.createdAt === null) {
    return base;
  }
  if (variant === "string") {
    base["createdAt"] = user.createdAt;
  } else {
    base["createdAt"] = new Date(user.createdAt);
  }
  return base;
}

const NAMES: readonly MeFixtureCase[] = [
  "minimal",
  "full",
  "legacyNoCreatedAt",
  "unverified",
] as const;

describe("contract producer: GET /api/v1/me", () => {
  it.each(NAMES)(
    "fixture %s — Date `createdAt` round-trips through the route",
    async (name) => {
      const fixture = meFixtures[name];
      const authed = authedUserFromFixture(fixture, "date");
      getSessionUserMock.mockResolvedValueOnce(authed);

      const app = createApp();
      const res = await request(app)
        .get("/api/v1/me")
        .set("Authorization", "Bearer contract-stub");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fixture);
    },
  );

  it.each(NAMES)(
    "fixture %s — string `createdAt` round-trips through the route",
    async (name) => {
      const fixture = meFixtures[name];
      const authed = authedUserFromFixture(fixture, "string");
      getSessionUserMock.mockResolvedValueOnce(authed);

      const app = createApp();
      const res = await request(app)
        .get("/api/v1/me")
        .set("Authorization", "Bearer contract-stub");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(fixture);
    },
  );

  it("legacyNoCreatedAt — missing field on the auth user → null on the wire", async () => {
    // Older accounts may not have `createdAt` at all in the auth row.
    // The route normalises this to `null`, matching the
    // `legacyNoCreatedAt` fixture exactly.
    const fixture = meFixtures.legacyNoCreatedAt;
    const authed = authedUserFromFixture(fixture, "missing");
    getSessionUserMock.mockResolvedValueOnce(authed);

    const app = createApp();
    const res = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer contract-stub");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(fixture);
    expect(res.body.user.createdAt).toBeNull();
  });

  it("response is byte-stable between /api/me and /api/v1/me for the same fixture", async () => {
    // Hard Rule: legacy and v1 prefixes must emit IDENTICAL bodies. If
    // they ever diverge, downstream code split between the two paths
    // would silently misbehave.
    const fixture = meFixtures.full;
    const authed = authedUserFromFixture(fixture, "date");
    getSessionUserMock.mockResolvedValue(authed);

    const app = createApp();
    const legacy = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer x");
    const v1 = await request(app)
      .get("/api/v1/me")
      .set("Authorization", "Bearer x");

    expect(legacy.status).toBe(200);
    expect(v1.status).toBe(200);
    expect(v1.body).toEqual(legacy.body);
    expect(v1.body).toEqual(fixture);
  });
});
