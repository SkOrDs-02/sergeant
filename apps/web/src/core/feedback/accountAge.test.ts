import { describe, it, expect } from "vitest";
import { accountAgeDays } from "./accountAge";

describe("accountAgeDays", () => {
  const NOW = new Date("2026-07-10T12:00:00.000Z");

  it("returns whole days elapsed since createdAt", () => {
    expect(accountAgeDays("2026-07-03T12:00:00.000Z", NOW)).toBe(7);
    expect(accountAgeDays("2026-07-03T12:00:00.001Z", NOW)).toBe(6);
    expect(accountAgeDays("2026-07-10T09:00:00.000Z", NOW)).toBe(0);
  });

  it("returns null for missing createdAt (legacy accounts)", () => {
    expect(accountAgeDays(null, NOW)).toBeNull();
    expect(accountAgeDays(undefined, NOW)).toBeNull();
    expect(accountAgeDays("", NOW)).toBeNull();
  });

  it("returns null for malformed dates", () => {
    expect(accountAgeDays("not-a-date", NOW)).toBeNull();
  });

  it("returns null for createdAt in the future (clock skew)", () => {
    expect(accountAgeDays("2026-07-11T00:00:00.000Z", NOW)).toBeNull();
  });
});
