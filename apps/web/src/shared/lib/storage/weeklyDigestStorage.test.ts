// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadDigest, hasLiveWeeklyDigest } from "./weeklyDigestStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("loadDigest", () => {
  it("повертає null коли ключ відсутній", () => {
    expect(loadDigest("2025-W24")).toBeNull();
  });

  it("повертає null для невалідного JSON", () => {
    localStorage.setItem("weekly_digest_2025-W24", "broken{json");
    expect(loadDigest("2025-W24")).toBeNull();
  });
});

describe("hasLiveWeeklyDigest", () => {
  it("повертає false коли дайджестів немає", () => {
    expect(hasLiveWeeklyDigest(new Date("2025-06-15"))).toBe(false);
  });
});
