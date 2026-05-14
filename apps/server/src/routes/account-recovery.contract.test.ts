import { describe, it, expect } from "vitest";
import {
  AccountRecoveryInitiateRequestSchema,
  AccountRecoveryInitiateResponseSchema,
  AccountRecoveryConfirmRequestSchema,
  AccountRecoveryConfirmResponseSchema,
  AccountRecoveryErrorSchema,
  accountRecoveryInitiateRequestFixtures,
  accountRecoveryInitiateResponseFixtures,
  accountRecoveryConfirmRequestFixtures,
  accountRecoveryConfirmRequestNegativeFixtures,
  accountRecoveryConfirmResponseFixtures,
  accountRecoveryErrorFixtures,
  assertAccountRecoveryFixturesValid,
} from "@sergeant/shared";

/**
 * Producer-side contract test for the planned `POST /api/account/recovery`
 * and `POST /api/account/recovery/confirm` endpoints.
 *
 * **Status:** the routes do not exist yet — they're referenced in the
 * Sentry sampling table (`apps/server/src/sentry.ts:42`, 100% trace
 * rate) and the fail-closed limiter policy
 * (`docs/initiatives/stack-pulse-2026-05/pr-02-rate-limit-fail-closed.md`)
 * as a future security-critical surface, but no handler has been
 * landed. This file pins the wire contract **before** implementation so
 * the eventual route can be reviewed against an already-agreed shape.
 *
 * **What this test asserts:**
 *   1. Every positive fixture round-trips through its schema unchanged.
 *   2. Negative fixtures (weak password, short token, extra fields) are
 *      rejected by the request schemas — a serializer that accidentally
 *      relaxed the schema would fail CI here.
 *   3. The success response is byte-identical for the "registered" and
 *      "unregistered" code paths — the anti-account-enumeration
 *      invariant from OWASP ASVS § 2.2.1 is encoded into the fixture
 *      set itself.
 *
 * When the route lands, this file will gain a supertest block that
 * round-trips each fixture against the real handler (mirroring the
 * pattern in `auth.contract.test.ts` / `me.contract.test.ts`). Until
 * then the schema-acceptance suite is the contract.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

describe("contract producer: POST /api/account/recovery (planned)", () => {
  it("fixtures self-check — every positive fixture parses through its schema", () => {
    expect(() => assertAccountRecoveryFixturesValid()).not.toThrow();
  });

  describe("initiate: request shape", () => {
    it.each(
      Object.entries(accountRecoveryInitiateRequestFixtures) as Array<
        [string, { email: string }]
      >,
    )("fixture %s — schema accepts canonical request body", (_name, body) => {
      const parsed = AccountRecoveryInitiateRequestSchema.safeParse(body);
      expect(parsed.success).toBe(true);
    });

    it("rejects unknown fields (strict schema)", () => {
      // The route MUST reject extra fields — otherwise a future client
      // could smuggle `userId` or similar identity-hint params that
      // re-enable enumeration via differential responses.
      const result = AccountRecoveryInitiateRequestSchema.safeParse({
        email: "user@example.com",
        rememberMe: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects malformed email", () => {
      const result = AccountRecoveryInitiateRequestSchema.safeParse({
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });

    it("rejects email longer than 254 chars (RFC 5321 SMTP cap)", () => {
      const longLocal = "a".repeat(250);
      const result = AccountRecoveryInitiateRequestSchema.safeParse({
        email: `${longLocal}@x.io`,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("initiate: response shape (anti-enumeration)", () => {
    it("registered + unregistered emails MUST produce byte-identical fixture", () => {
      // The contract: registered and unregistered emails return the SAME
      // `{ ok: true }`. Keeping ONE fixture (`accepted`) is itself the
      // invariant — if a future PR adds a `userExists` flag, that
      // fixture set has to grow and this assertion catches it.
      const cases = Object.keys(accountRecoveryInitiateResponseFixtures);
      expect(cases).toEqual(["accepted"]);
      expect(accountRecoveryInitiateResponseFixtures.accepted).toEqual({
        ok: true,
      });
    });

    it("schema rejects any response variant other than `{ ok: true }`", () => {
      const drifted = { ok: true, userExists: true };
      const result = AccountRecoveryInitiateResponseSchema.safeParse(drifted);
      // strict() — extra fields are a contract violation.
      expect(result.success).toBe(false);
    });
  });

  describe("confirm: request shape", () => {
    it.each(
      Object.entries(accountRecoveryConfirmRequestFixtures) as Array<
        [string, { token: string; newPassword: string }]
      >,
    )("fixture %s — schema accepts canonical request body", (_name, body) => {
      const parsed = AccountRecoveryConfirmRequestSchema.safeParse(body);
      expect(parsed.success).toBe(true);
    });

    it.each([
      [
        "weakPassword",
        accountRecoveryConfirmRequestNegativeFixtures.weakPassword,
      ],
      ["shortToken", accountRecoveryConfirmRequestNegativeFixtures.shortToken],
      ["extraField", accountRecoveryConfirmRequestNegativeFixtures.extraField],
    ])("negative fixture %s — schema MUST reject", (_name, body) => {
      const result = AccountRecoveryConfirmRequestSchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    it("accepts token at the upper length boundary (512 chars)", () => {
      const result = AccountRecoveryConfirmRequestSchema.safeParse({
        token: "t".repeat(512),
        newPassword: "correct horse battery staple",
      });
      expect(result.success).toBe(true);
    });

    it("rejects token over the upper length boundary (513 chars)", () => {
      const result = AccountRecoveryConfirmRequestSchema.safeParse({
        token: "t".repeat(513),
        newPassword: "correct horse battery staple",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("confirm: response shape (post-recovery re-auth)", () => {
    it("success fixture is `{ ok: true }` and does NOT carry session/token fields", () => {
      // The route must NOT issue a fresh session in the confirm response.
      // Forcing a follow-up `/api/auth/sign-in` defeats token-replay
      // mid-flow — even if an attacker intercepts the confirmation body
      // they can't ride the recovery to an authenticated session.
      expect(accountRecoveryConfirmResponseFixtures.rotated).toEqual({
        ok: true,
      });
      const parsed = AccountRecoveryConfirmResponseSchema.safeParse(
        accountRecoveryConfirmResponseFixtures.rotated,
      );
      expect(parsed.success).toBe(true);
    });

    it("schema rejects responses that smuggle a session token", () => {
      const drifted = { ok: true, sessionToken: "tok_smuggled" };
      const result = AccountRecoveryConfirmResponseSchema.safeParse(drifted);
      expect(result.success).toBe(false);
    });
  });

  describe("error envelope (uniform across failure modes)", () => {
    it.each(
      Object.entries(accountRecoveryErrorFixtures) as Array<
        [string, { error: string }]
      >,
    )("fixture %s — schema accepts canonical error body", (_name, body) => {
      const parsed = AccountRecoveryErrorSchema.safeParse(body);
      expect(parsed.success).toBe(true);
    });

    it("error fixtures stay generic — no token-state distinction leaks", () => {
      // The strings can change, but none of the canonical fixtures must
      // hint at the failure mode (e.g. "token expired" vs "token wrong"
      // would enable existence-probing). This assertion is the closest
      // we can get to that without natural-language analysis.
      const allMessages = Object.values(accountRecoveryErrorFixtures).map((e) =>
        e.error.toLowerCase(),
      );
      for (const msg of allMessages) {
        expect(msg).not.toMatch(/\bexpired\b.*\bvs\b/);
        expect(msg).not.toMatch(/\b(found|exists)\b/);
      }
    });
  });
});
