/**
 * Contract test (consumer side) for `GET /api/auth/get-session`.
 *
 * **Goal:** prove that the canonical wire-shape fixtures in
 * `@sergeant/shared/contract-fixtures/auth` are accepted by the web
 * consumer's parser (`AuthSessionResponseSchema`) byte-for-byte. The
 * matching producer-side test lives in
 * `apps/server/src/routes/auth.contract.test.ts`.
 *
 * The web app does NOT consume `/api/auth/get-session` through
 * `@sergeant/api-client` — Better Auth's React client (`createAuthClient`)
 * handles the wiring directly. But the wire shape still needs a
 * contract gate, because any web code that imports `AuthSessionResponse`
 * (e.g. server-render guards, mobile-shell bridges) relies on the
 * fixtures being legal under the schema.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

import { describe, expect, it } from "vitest";
import {
  authActiveFixtures,
  authActiveRawFixtures,
  authLoggedOutFixture,
  assertAuthFixturesValid,
  AuthSessionResponseSchema,
  AuthSessionActiveSchema,
  type AuthActiveFixtureCase,
} from "@sergeant/shared";

const FIXTURE_NAMES: readonly AuthActiveFixtureCase[] = [
  "webCookieSession",
  "bearerMobileSession",
  "unverifiedEmailSession",
] as const;

describe("contract: /api/auth/get-session", () => {
  it("every named fixture parses through AuthSessionResponseSchema (sanity)", () => {
    expect(() => assertAuthFixturesValid()).not.toThrow();
  });

  it.each(FIXTURE_NAMES)(
    "fixture %s — raw JSON view parses to the typed fixture",
    (name) => {
      const raw = authActiveRawFixtures[name];
      const parsed = AuthSessionResponseSchema.parse(raw);
      expect(parsed).toEqual(authActiveFixtures[name]);
    },
  );

  it("active envelope fixtures also match AuthSessionActiveSchema directly", () => {
    // `AuthSessionActiveSchema` is the non-null arm of the union. Web
    // code that already knows the user is authenticated (e.g. behind a
    // session guard) should be able to parse against the narrower
    // schema without going through the union.
    for (const name of FIXTURE_NAMES) {
      const parsed = AuthSessionActiveSchema.parse(authActiveFixtures[name]);
      expect(parsed).toEqual(authActiveFixtures[name]);
    }
  });

  it("`null` (logged-out) is a valid AuthSessionResponse", () => {
    // Logged-out is the literal JSON `null` — verifying it stays a
    // first-class arm guards against a future refactor that drops the
    // union and forces consumers to branch on a different signal.
    expect(authLoggedOutFixture).toBeNull();
    expect(AuthSessionResponseSchema.parse(authLoggedOutFixture)).toBeNull();
  });

  it("rejects a payload missing a required field (drift detection)", () => {
    // Drop `token` from the session arm — a regression where the
    // route's serializer omits the rotating cookie token would let
    // unauthenticated reads silently look authenticated until first
    // /api/me call.
    const sessionMinusToken = {
      ...authActiveFixtures.webCookieSession.session,
    } as Record<string, unknown>;
    delete sessionMinusToken["token"];
    const broken = {
      user: authActiveFixtures.webCookieSession.user,
      session: sessionMinusToken,
    };
    expect(() => AuthSessionResponseSchema.parse(broken)).toThrow();
  });

  it("rejects a payload with malformed ISO `expiresAt` (drift detection)", () => {
    // Better Auth's wire format is ISO-8601 with offset. A regression
    // that moves to numeric epoch (e.g. `1716000000000`) would silently
    // break the consumer's `new Date(expiresAt)` arithmetic; the schema
    // must reject it.
    const broken = {
      ...authActiveFixtures.webCookieSession,
      session: {
        ...authActiveFixtures.webCookieSession.session,
        expiresAt: 1716000000000 as unknown as string,
      },
    };
    expect(() => AuthSessionResponseSchema.parse(broken)).toThrow();
  });

  it("schema accepts unverifiedEmail edge — verify-email flow lives off this flag", () => {
    // Explicit assertion that the schema does not gate on
    // `emailVerified === true` — the verify-email banner depends on
    // seeing `false` here, so silently rejecting unverified sessions
    // would break onboarding.
    const fixture = authActiveFixtures.unverifiedEmailSession;
    expect(fixture.user.emailVerified).toBe(false);
    expect(() => AuthSessionResponseSchema.parse(fixture)).not.toThrow();
  });
});
