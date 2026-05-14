/**
 * Canonical fixtures for the planned `POST /api/account/recovery` and
 * `POST /api/account/recovery/confirm` security-critical endpoints.
 *
 * Status: the routes are referenced by the Sentry sampling table
 * (`apps/server/src/sentry.ts` line 42, 100% trace rate) and the
 * fail-closed rate-limit policy in
 * `docs/initiatives/stack-pulse-2026-05/pr-02-rate-limit-fail-closed.md`,
 * but have no handler yet. Pinning the wire shape *before*
 * implementation means:
 *   - reviewers debate the contract once, not per-PR;
 *   - the fail-closed limiter can be wired with the canonical body
 *     already covered by the schema;
 *   - when the route lands, the producer test in
 *     `apps/server/src/routes/account-recovery.contract.test.ts`
 *     flips from "schema sanity" to "route round-trip" with one diff.
 *
 * Anti-account-enumeration is the hard contract here — see
 * `AccountRecoveryInitiateResponseSchema` rationale in
 * `../schemas/api.ts`. Both registered and unregistered emails MUST
 * receive the same `{ ok: true }` response.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

import {
  AccountRecoveryInitiateRequestSchema,
  AccountRecoveryInitiateResponseSchema,
  AccountRecoveryConfirmRequestSchema,
  AccountRecoveryConfirmResponseSchema,
  AccountRecoveryErrorSchema,
  type AccountRecoveryInitiateRequest,
  type AccountRecoveryInitiateResponse,
  type AccountRecoveryConfirmRequest,
  type AccountRecoveryConfirmResponse,
  type AccountRecoveryError,
} from "../schemas/api";

/**
 * Initiate-step request fixtures.
 *
 * - `registeredUser` — happy path: existing account requests recovery.
 * - `unregisteredEmail` — anti-enumeration probe: server MUST emit the
 *   same response as `registeredUser` even though no row matches.
 * - `plusAddressing` — edge case: RFC 5233 sub-addressing
 *   (`local+tag@host`). Many naïve regex validators reject the `+`; we
 *   keep this fixture so the schema can't be tightened past RFC-5322
 *   minimums without flagging the contract.
 */
export const accountRecoveryInitiateRequestFixtures = {
  registeredUser: {
    email: "user@example.com",
  },
  unregisteredEmail: {
    email: "noone@example.com",
  },
  plusAddressing: {
    email: "user+recovery@example.com",
  },
} as const satisfies Record<string, AccountRecoveryInitiateRequest>;

export type AccountRecoveryInitiateRequestFixtureCase =
  keyof typeof accountRecoveryInitiateRequestFixtures;

/**
 * Initiate-step response fixtures. Only ONE successful shape exists
 * because the route must not vary by account-existence — keeping a
 * single fixture is itself part of the contract.
 */
export const accountRecoveryInitiateResponseFixtures = {
  accepted: { ok: true },
} as const satisfies Record<string, AccountRecoveryInitiateResponse>;

export type AccountRecoveryInitiateResponseFixtureCase =
  keyof typeof accountRecoveryInitiateResponseFixtures;

/**
 * Confirm-step request fixtures.
 *
 * - `validToken` — happy path: legitimate token, strong password.
 * - `weakPassword` — schema-rejected edge: `newPassword` length < 8.
 *   Producer test uses this as a negative fixture.
 * - `tokenAtMaxLength` — boundary: 512-char token (the schema cap).
 *   Better Auth's token rotation occasionally pushes long opaque
 *   strings; the schema MUST accept the upper bound, not just typical
 *   16–64 char tokens.
 */
export const accountRecoveryConfirmRequestFixtures = {
  validToken: {
    token: "tok_recovery_canonical_001",
    newPassword: "correct horse battery staple",
  },
  tokenAtMaxLength: {
    token: "t".repeat(512),
    newPassword: "S3rgeant!Strong#Pass",
  },
} as const satisfies Record<string, AccountRecoveryConfirmRequest>;

export type AccountRecoveryConfirmRequestFixtureCase =
  keyof typeof accountRecoveryConfirmRequestFixtures;

/** Negative fixtures — must FAIL the schema. */
export const accountRecoveryConfirmRequestNegativeFixtures = {
  weakPassword: {
    token: "tok_recovery_weakpw_002",
    newPassword: "short",
  },
  shortToken: {
    token: "abc",
    newPassword: "correct horse battery staple",
  },
  extraField: {
    token: "tok_recovery_extra_003",
    newPassword: "correct horse battery staple",
    audit: "trying-to-add-fields",
  },
} as const;

export type AccountRecoveryConfirmRequestNegativeFixtureCase =
  keyof typeof accountRecoveryConfirmRequestNegativeFixtures;

/**
 * Confirm-step response fixtures. Same `{ ok: true }` discipline as the
 * initiate response.
 */
export const accountRecoveryConfirmResponseFixtures = {
  rotated: { ok: true },
} as const satisfies Record<string, AccountRecoveryConfirmResponse>;

export type AccountRecoveryConfirmResponseFixtureCase =
  keyof typeof accountRecoveryConfirmResponseFixtures;

/**
 * Error envelope fixtures. The error string is intentionally generic —
 * the route MUST NOT distinguish "token wrong" from "token expired"
 * from "token already used" to defeat token-existence probing.
 */
export const accountRecoveryErrorFixtures = {
  invalidToken: { error: "invalid or expired token" },
  rateLimited: { error: "too many requests" },
  passwordRejected: { error: "password does not meet policy" },
} as const satisfies Record<string, AccountRecoveryError>;

export type AccountRecoveryErrorFixtureCase =
  keyof typeof accountRecoveryErrorFixtures;

/**
 * Raw-typed views for `.safeParse()` exercises.
 */
export const accountRecoveryInitiateRequestRawFixtures: Record<
  AccountRecoveryInitiateRequestFixtureCase,
  unknown
> = accountRecoveryInitiateRequestFixtures;

export const accountRecoveryConfirmRequestRawFixtures: Record<
  AccountRecoveryConfirmRequestFixtureCase,
  unknown
> = accountRecoveryConfirmRequestFixtures;

/** Cheap self-check: every positive fixture must parse through its schema. */
export function assertAccountRecoveryFixturesValid(): void {
  for (const [name, fixture] of Object.entries(
    accountRecoveryInitiateRequestFixtures,
  )) {
    const result = AccountRecoveryInitiateRequestSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "accountRecovery.initiateRequest.${name}" no longer matches AccountRecoveryInitiateRequestSchema: ${result.error.message}`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(
    accountRecoveryInitiateResponseFixtures,
  )) {
    const result = AccountRecoveryInitiateResponseSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "accountRecovery.initiateResponse.${name}" no longer matches AccountRecoveryInitiateResponseSchema: ${result.error.message}`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(
    accountRecoveryConfirmRequestFixtures,
  )) {
    const result = AccountRecoveryConfirmRequestSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "accountRecovery.confirmRequest.${name}" no longer matches AccountRecoveryConfirmRequestSchema: ${result.error.message}`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(
    accountRecoveryConfirmResponseFixtures,
  )) {
    const result = AccountRecoveryConfirmResponseSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "accountRecovery.confirmResponse.${name}" no longer matches AccountRecoveryConfirmResponseSchema: ${result.error.message}`,
      );
    }
  }
  for (const [name, fixture] of Object.entries(accountRecoveryErrorFixtures)) {
    const result = AccountRecoveryErrorSchema.safeParse(fixture);
    if (!result.success) {
      throw new Error(
        `Contract fixture "accountRecovery.error.${name}" no longer matches AccountRecoveryErrorSchema: ${result.error.message}`,
      );
    }
  }
}
