import { describe, expect, it } from "vitest";
import {
  accountRecoveryConfirmRequestFixtures,
  accountRecoveryConfirmResponseFixtures,
  accountRecoveryErrorFixtures,
  accountRecoveryInitiateRequestFixtures,
  accountRecoveryInitiateResponseFixtures,
  assertAccountRecoveryFixturesValid,
} from "./accountRecovery";

function withPatched<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
  assertion: () => void,
): void {
  const original = target[key];
  target[key] = value;
  try {
    assertion();
  } finally {
    target[key] = original;
  }
}

describe("account recovery contract fixtures", () => {
  it("passes the canonical self-check", () => {
    expect(() => assertAccountRecoveryFixturesValid()).not.toThrow();
  });

  it("rejects invalid initiate requests", () => {
    const fixture = accountRecoveryInitiateRequestFixtures.registeredUser as {
      email: string;
    };
    withPatched(fixture, "email", "not-an-email", () => {
      expect(() => assertAccountRecoveryFixturesValid()).toThrow(
        /initiateRequest\.registeredUser/,
      );
    });
  });

  it("rejects invalid initiate responses", () => {
    const fixture = accountRecoveryInitiateResponseFixtures.accepted as {
      ok: unknown;
    };
    withPatched(fixture, "ok", false, () => {
      expect(() => assertAccountRecoveryFixturesValid()).toThrow(
        /initiateResponse\.accepted/,
      );
    });
  });

  it("rejects invalid confirm requests", () => {
    const fixture = accountRecoveryConfirmRequestFixtures.validToken as {
      token: string;
    };
    withPatched(fixture, "token", "abc", () => {
      expect(() => assertAccountRecoveryFixturesValid()).toThrow(
        /confirmRequest\.validToken/,
      );
    });
  });

  it("rejects invalid confirm responses", () => {
    const fixture = accountRecoveryConfirmResponseFixtures.rotated as {
      ok: unknown;
    };
    withPatched(fixture, "ok", false, () => {
      expect(() => assertAccountRecoveryFixturesValid()).toThrow(
        /confirmResponse\.rotated/,
      );
    });
  });

  it("rejects invalid error envelopes", () => {
    const fixture = accountRecoveryErrorFixtures.invalidToken as {
      error: unknown;
    };
    withPatched(fixture, "error", "", () => {
      expect(() => assertAccountRecoveryFixturesValid()).toThrow(
        /accountRecovery\.error\.invalidToken/,
      );
    });
  });
});
