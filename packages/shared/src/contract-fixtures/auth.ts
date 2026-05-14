/**
 * Canonical fixtures for `GET /api/auth/get-session`.
 *
 * The route is mounted by `apps/server/src/routes/auth.ts` via
 * `toNodeHandler(auth)`; the wire shape is validated by
 * `AuthSessionResponseSchema` from `../schemas/api`. Each named case
 * represents a real shape the producer might emit:
 *
 * - `loggedOut` — no active session (cookie missing, expired, or
 *   unrecognised Bearer token). Better Auth returns `null`, status 200.
 * - `webCookieSession` — fully-populated web session: `ipAddress` is the
 *   truncated /24 prefix written by the `session.create.before` hook
 *   (`apps/server/src/auth.ts`, Hardening H3); `userAgent` is whatever
 *   the browser reported on the original sign-in.
 * - `bearerMobileSession` — mobile/expo session over the `bearer` plugin
 *   (`apps/server/src/auth.ts`). `ipAddress` is `null` because the
 *   adapter never set it (mobile clients hit the API directly from the
 *   device IP which we deliberately don't store post-truncation when the
 *   adapter omits it).
 * - `unverifiedEmailSession` — edge case: account exists, session is
 *   valid, but `emailVerified` is still `false`. The UI surfaces a
 *   verify-email banner off this flag and must NOT 401 such users.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

import {
  AuthSessionResponseSchema,
  type AuthSessionResponse,
} from "../schemas/api";

/**
 * "Active" envelope `{ user, session }`. The `loggedOut` arm is
 * separately exported below because `null` is awkward to express via
 * `Record<string, T>`.
 */
export const authActiveFixtures = {
  webCookieSession: {
    user: {
      id: "user_web_001",
      email: "web@example.com",
      name: "Web User",
      image: "https://avatars.example.com/web.png",
      emailVerified: true,
      createdAt: "2025-12-01T09:00:00.000Z",
    },
    session: {
      id: "sess_web_001",
      userId: "user_web_001",
      token: "tok_web_opaque_abcdef1234567890",
      expiresAt: "2026-05-20T09:00:00.000Z",
      createdAt: "2026-05-13T09:00:00.000Z",
      updatedAt: "2026-05-13T09:00:00.000Z",
      ipAddress: "203.0.113.0",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  },
  bearerMobileSession: {
    user: {
      id: "user_mobile_002",
      email: "mobile@example.com",
      name: "Mobile User",
      image: null,
      emailVerified: true,
      createdAt: "2026-02-14T15:42:00.000Z",
    },
    session: {
      id: "sess_mobile_002",
      userId: "user_mobile_002",
      token: "tok_mobile_opaque_0123456789abcdef",
      expiresAt: "2026-06-12T15:42:00.000Z",
      createdAt: "2026-05-13T15:42:00.000Z",
      updatedAt: "2026-05-13T15:42:00.000Z",
      ipAddress: null,
      userAgent: "Sergeant/1.0 (iPhone; iOS 18.4) Expo",
    },
  },
  unverifiedEmailSession: {
    user: {
      id: "user_unverified_003",
      email: "pending@example.com",
      name: null,
      image: null,
      emailVerified: false,
      createdAt: "2026-05-10T10:00:00.000Z",
    },
    session: {
      id: "sess_unverified_003",
      userId: "user_unverified_003",
      token: "tok_unverified_opaque_fedcba9876543210",
      expiresAt: "2026-05-17T10:00:00.000Z",
      createdAt: "2026-05-13T10:00:00.000Z",
      updatedAt: "2026-05-13T10:00:00.000Z",
      ipAddress: "198.51.100.0",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  },
} as const satisfies Record<string, Exclude<AuthSessionResponse, null>>;

export type AuthActiveFixtureCase = keyof typeof authActiveFixtures;

/**
 * "No session" arm: Better Auth returns the literal JSON `null` with a
 * 200 status. Kept as a separate export so consumers iterating over
 * `authActiveFixtures` don't have to type-narrow.
 */
export const authLoggedOutFixture: AuthSessionResponse = null;

/**
 * Same fixtures, but typed as `unknown` — feed these to the schema
 * `safeParse()` path to exercise the runtime parser. Mirrors the
 * `meRawFixtures` convention.
 */
export const authActiveRawFixtures: Record<AuthActiveFixtureCase, unknown> =
  authActiveFixtures;

/** Cheap self-check: every named fixture must parse through the schema. */
export function assertAuthFixturesValid(): void {
  for (const [name, fixture] of Object.entries(authActiveFixtures)) {
    const result = AuthSessionResponseSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "auth.active.${name}" no longer matches AuthSessionResponseSchema: ${result.error.message}`,
      );
    }
  }
  const nullResult = AuthSessionResponseSchema.safeParse(authLoggedOutFixture);
  if (!nullResult.success) {
    throw new Error(
      `Contract fixture "auth.loggedOut" no longer matches AuthSessionResponseSchema: ${nullResult.error.message}`,
    );
  }
}
