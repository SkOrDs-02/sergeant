import { describe, it, expect } from "vitest";
import { LOCAL_ANON_USER_ID } from "../../../core/auth/localIdentity";
import { DEMO_LOCAL_USER_ID } from "../../../core/onboarding/onboardingGate";
import { resolveStrongIdNamespace } from "./strongIdNamespace";

describe("resolveStrongIdNamespace", () => {
  it("uses the account id for a signed-in user", () => {
    expect(resolveStrongIdNamespace("acct_abc123")).toBe("acct_abc123");
  });

  it("blocks import while the session is still resolving", () => {
    expect(resolveStrongIdNamespace(null)).toBeNull();
  });

  // Ядро фікса: `LOCAL_ANON_USER_ID` і `DEMO_LOCAL_USER_ID` — спільні
  // константи, тож солити ними означало б видавати однакові id різним людям.
  // Оскільки анонімна міграція переносить рядки в акаунт, НЕ перегенеровуючи
  // id, така колізія дожила б до сервера і з'їла б чужу історію.
  it("falls back to the per-install device id for shared local identities", () => {
    for (const shared of [LOCAL_ANON_USER_ID, DEMO_LOCAL_USER_ID]) {
      const a = resolveStrongIdNamespace(shared, {
        deviceId: () => "device-aaa",
      });
      const b = resolveStrongIdNamespace(shared, {
        deviceId: () => "device-bbb",
      });
      expect(a).not.toBe(shared);
      expect(a).not.toBe(b);
    }
  });

  it("keeps the anonymous namespace stable on one install", () => {
    const first = resolveStrongIdNamespace(LOCAL_ANON_USER_ID, {
      deviceId: () => "device-aaa",
    });
    const second = resolveStrongIdNamespace(LOCAL_ANON_USER_ID, {
      deviceId: () => "device-aaa",
    });
    expect(first).toBe(second);
  });

  it("never lets an anonymous namespace collide with a real account id", () => {
    const anon = resolveStrongIdNamespace(LOCAL_ANON_USER_ID, {
      deviceId: () => "acct_abc123",
    });
    expect(anon).not.toBe(resolveStrongIdNamespace("acct_abc123"));
  });
});
