import { describe, expect, it } from "vitest";

import { assertMeFixturesValid, meFixtures, meRawFixtures } from "./me";

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

describe("me contract fixtures", () => {
  it("passes the canonical self-check and exposes raw fixtures by case", () => {
    expect(() => assertMeFixturesValid()).not.toThrow();
    expect(Object.keys(meRawFixtures)).toEqual(Object.keys(meFixtures));
  });

  it("rejects fixtures that drift from the MeResponse schema", () => {
    const user = meFixtures.minimal.user as { email: unknown };
    withPatched(user, "email", "not-an-email", () => {
      expect(() => assertMeFixturesValid()).toThrow(/me\.minimal/);
    });
  });
});
