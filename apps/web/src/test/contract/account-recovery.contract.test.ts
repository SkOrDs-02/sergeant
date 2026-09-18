/**
 * Contract test (consumer side) for the planned
 * `POST /api/account/recovery` / `POST /api/account/recovery/confirm`
 * endpoints.
 *
 * **Status:** routes are not yet implemented (see
 * `apps/server/src/sentry.ts:42` and
 * `docs/initiatives/stack-pulse-2026-05/pr-02-rate-limit-fail-closed.md`
 * for the planning references). This file pins the wire schema so the
 * eventual web client can be built against an already-tested contract.
 *
 * The matching producer-side test (also schema-only until the route
 * lands) lives in
 * `apps/server/src/routes/account-recovery.contract.test.ts`.
 *
 * Closes audit `docs/audits/2026-05-13-security-observability-roast.md`
 * § S7 (Contract test expansion — auth, csp-report, account-recovery).
 */

import { describe, expect, it } from "vitest";
import {
  accountRecoveryInitiateRequestFixtures,
  accountRecoveryInitiateResponseFixtures,
  accountRecoveryConfirmRequestFixtures,
  accountRecoveryConfirmRequestNegativeFixtures,
  accountRecoveryConfirmResponseFixtures,
  accountRecoveryErrorFixtures,
  assertAccountRecoveryFixturesValid,
  AccountRecoveryInitiateRequestSchema,
  AccountRecoveryInitiateResponseSchema,
  AccountRecoveryConfirmRequestSchema,
  AccountRecoveryConfirmResponseSchema,
  AccountRecoveryErrorSchema,
} from "@sergeant/shared";

describe("contract: /api/account/recovery (planned)", () => {
  it("every positive fixture parses through its schema (sanity)", () => {
    expect(() => assertAccountRecoveryFixturesValid()).not.toThrow();
  });

  describe("initiate: request shape", () => {
    it.each(Object.entries(accountRecoveryInitiateRequestFixtures))(
      "fixture %s — consumer-side schema accepts the request body",
      (_name, body) => {
        const parsed = AccountRecoveryInitiateRequestSchema.parse(body);
        expect(parsed).toEqual(body);
      },
    );

    it("rejects request bodies that drift from the canonical shape", () => {
      // The same defensive set used on the producer side, mirrored here
      // so a regression in the schema can be caught from either
      // direction.
      expect(() =>
        AccountRecoveryInitiateRequestSchema.parse({
          email: "user@example.com",
          smuggledFlag: true,
        }),
      ).toThrow();
      expect(() =>
        AccountRecoveryInitiateRequestSchema.parse({ email: "not-email" }),
      ).toThrow();
      expect(() => AccountRecoveryInitiateRequestSchema.parse({})).toThrow();
    });
  });

  describe("initiate: response shape (anti-enumeration invariant)", () => {
    it("ONE canonical accepted response — anti-enumeration is a single fixture", () => {
      // If a future PR adds a second initiate-response fixture (e.g.
      // `userExists`), this assertion catches the contract drift —
      // because two responses means the route can differentiate, which
      // defeats account-enumeration protection.
      expect(Object.keys(accountRecoveryInitiateResponseFixtures)).toEqual([
        "accepted",
      ]);
      const parsed = AccountRecoveryInitiateResponseSchema.parse(
        accountRecoveryInitiateResponseFixtures.accepted,
      );
      expect(parsed).toEqual({ ok: true });
    });

    it("schema is strict — extra fields fail", () => {
      expect(() =>
        AccountRecoveryInitiateResponseSchema.parse({
          ok: true,
          email: "echo@example.com",
        }),
      ).toThrow();
    });
  });

  describe("confirm: request shape", () => {
    it.each(Object.entries(accountRecoveryConfirmRequestFixtures))(
      "fixture %s — consumer-side schema accepts the request body",
      (_name, body) => {
        const parsed = AccountRecoveryConfirmRequestSchema.parse(body);
        expect(parsed).toEqual(body);
      },
    );

    it.each(Object.entries(accountRecoveryConfirmRequestNegativeFixtures))(
      "negative fixture %s — consumer-side schema MUST reject",
      (_name, body) => {
        expect(() => AccountRecoveryConfirmRequestSchema.parse(body)).toThrow();
      },
    );

    it("password length lower-bound: 7 chars rejected, 8 chars accepted", () => {
      // Lower bound matches Better Auth's `password.min` floor. If
      // Better Auth bumps the minimum, this assertion fails and forces
      // the schema + fixture to move in lockstep (Hard Rule #3).
      expect(() =>
        AccountRecoveryConfirmRequestSchema.parse({
          token: "tok_recovery_bound_001",
          newPassword: "1234567",
        }),
      ).toThrow();
      const parsed = AccountRecoveryConfirmRequestSchema.parse({
        token: "tok_recovery_bound_002",
        newPassword: "12345678",
      });
      expect(parsed.newPassword.length).toBe(8);
    });
  });

  describe("confirm: response shape (post-recovery re-auth)", () => {
    it("only `{ ok: true }` is accepted — schema must not allow session-token smuggling", () => {
      const parsed = AccountRecoveryConfirmResponseSchema.parse(
        accountRecoveryConfirmResponseFixtures.rotated,
      );
      expect(parsed).toEqual({ ok: true });
      expect(() =>
        AccountRecoveryConfirmResponseSchema.parse({
          ok: true,
          sessionToken: "tok_smuggled",
        }),
      ).toThrow();
    });
  });

  describe("error envelope", () => {
    it.each(Object.entries(accountRecoveryErrorFixtures))(
      "fixture %s — schema accepts canonical error body",
      (_name, body) => {
        const parsed = AccountRecoveryErrorSchema.parse(body);
        expect(parsed).toEqual(body);
      },
    );

    it("schema rejects error bodies that leak token-state hints", () => {
      // The shape says nothing about contents — but adding fields like
      // `tokenState: "expired"` would re-enable existence probing. The
      // schema is `.strict()` and only allows `{ error }`, so extras
      // are caught here even if the string is generic.
      expect(() =>
        AccountRecoveryErrorSchema.parse({
          error: "invalid token",
          tokenState: "expired",
        }),
      ).toThrow();
    });
  });
});
