/**
 * Integration test for the REAL Better Auth email/password sign-up flow —
 * no `getSessionUser` mock anywhere in this file.
 *
 * Audit gap #1: every other server integration test (including the
 * sibling `auth-session-me.integration.test.ts`) stubs `getSessionUser`,
 * so the actual Better Auth wire path — `POST /api/auth/sign-up/email`
 * issuing a real session cookie → `requireSession` parsing that cookie →
 * `auth.api.getSession` hitting real Postgres → `/api/me` serializer —
 * has never been exercised end-to-end. This file closes that gap.
 *
 * Flow:
 *   1. Real sign-up via `POST /api/auth/sign-up/email` (Better Auth
 *      mounted at `/api/auth/{*splat}`, see `routes/auth.ts`).
 *   2. Authorized `GET /api/me` riding the real session cookie Better
 *      Auth just issued → 200 + `MeResponseSchema`-shaped user. The
 *      opaque Better Auth id is asserted as a 32-char alphanumeric
 *      string (see `docs/02-engineering/architecture/domain-invariants.md`)
 *      — deliberately NOT a UUID-format assertion.
 *   3. Negative control: same route, same server, no cookie → 401
 *      UNAUTHORIZED.
 *
 * CI: fails loudly if Docker is not available (no silent skip).
 * Local: skips when testcontainers cannot start.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  INTEGRATION_TIMEOUT_MS,
} from "../test/createIntegrationApp.js";

let app: Express | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

const TEST_EMAIL = "real-signup-flow-integ@test.local";
// NIST SP 800-63B minimum in this repo is 10 chars (env.MIN_PASSWORD_LENGTH
// default) — comfortably clear it so sign-up isn't rejected on policy.
const TEST_PASSWORD = "correct horse battery staple 42";
const TEST_NAME = "Real Signup Flow";

beforeAll(async () => {
  try {
    const harness = await bootIntegrationHarness();
    app = harness.app;
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[auth real-signup-flow integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

describe("Better Auth real sign-up → GET /api/me (no getSessionUser mock)", () => {
  it(
    "sign-up/email issues a real session cookie; GET /api/me with that cookie → 200 with correct user shape",
    async (ctx) => {
      if (!dockerAvailable || !app) return ctx.skip();

      // `request.agent()` persists Set-Cookie across requests, exactly
      // like a browser tab — no manual cookie-jar plumbing needed.
      const agent = request.agent(app);

      const signUpRes = await agent
        .post("/api/auth/sign-up/email")
        .set("Content-Type", "application/json")
        .send({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          name: TEST_NAME,
        });

      expect(signUpRes.status).toBe(200);
      // `emailAndPassword.autoSignIn` is not disabled in `auth.ts` (Better
      // Auth default = true) and `REQUIRE_EMAIL_VERIFICATION` defaults to
      // `false` (env.ts) — so sign-up sets a session cookie immediately,
      // no separate sign-in round trip needed.
      expect(signUpRes.headers["set-cookie"]).toBeDefined();
      expect(signUpRes.body.user).toMatchObject({
        email: TEST_EMAIL,
        name: TEST_NAME,
      });

      const meRes = await agent.get("/api/me");

      expect(meRes.status).toBe(200);
      const user = meRes.body.user as {
        id: string;
        email: string;
        name: string | null;
        emailVerified: boolean;
        createdAt: string | null;
      };
      expect(user.email).toBe(TEST_EMAIL);
      expect(user.name).toBe(TEST_NAME);

      // Better Auth user ids are opaque strings — Sergeant's domain
      // invariant is explicitly "not a UUID" (see domain-invariants.md).
      // Default generator: `createRandomStringGenerator("a-z","A-Z","0-9")(32)`
      // (@better-auth/core/utils/id.ts) — 32 alphanumeric chars.
      expect(typeof user.id).toBe("string");
      expect(user.id).toMatch(/^[a-zA-Z0-9]{32}$/);
      expect(user.id).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      // Hard Rule #1 spirit — no bigint/string leaks on boolean/date
      // fields either: assert the actual serialized JS types, not just
      // truthiness.
      expect(typeof user.emailVerified).toBe("boolean");
      expect(typeof user.createdAt).toBe("string");
      expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "negative control: the same protected route without a session cookie → 401 UNAUTHORIZED",
    async (ctx) => {
      if (!dockerAvailable || !app) return ctx.skip();

      // Fresh `request(app)` call — no agent, no cookie jar, no prior
      // sign-up on this connection.
      const res = await request(app).get("/api/me");

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ code: "UNAUTHORIZED" });
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
