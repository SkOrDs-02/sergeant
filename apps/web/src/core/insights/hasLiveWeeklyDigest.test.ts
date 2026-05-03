// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import { hasLiveWeeklyDigest } from "./WeeklyDigestCard";
import { getWeekKey } from "./useWeeklyDigest";

const PREFIX = STORAGE_KEYS.WEEKLY_DIGEST_PREFIX;

function setDigest(weekKey: string, data: unknown) {
  localStorage.setItem(`${PREFIX}${weekKey}`, JSON.stringify(data));
}

describe("hasLiveWeeklyDigest", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns true on Monday regardless of digest state", () => {
    // 2026-04-20 is a Monday
    const monday = new Date("2026-04-20T10:00:00");
    expect(hasLiveWeeklyDigest(monday)).toBe(true);
  });

  it("returns true when a digest exists for the current week", () => {
    const wed = new Date("2026-04-22T10:00:00");
    setDigest(getWeekKey(wed), { generatedAt: Date.now() });
    expect(hasLiveWeeklyDigest(wed)).toBe(true);
  });

  it("returns true when last week's digest was generated within 48h", () => {
    const wed = new Date("2026-04-22T10:00:00"); // Wed
    const prev = new Date(wed);
    prev.setDate(wed.getDate() - 7);
    const freshAt = wed.getTime() - 12 * 60 * 60 * 1000; // 12h ago
    setDigest(getWeekKey(prev), {
      generatedAt: new Date(freshAt).toISOString(),
    });
    expect(hasLiveWeeklyDigest(wed)).toBe(true);
  });

  it("returns false mid-week with no current digest and stale previous one", () => {
    const fri = new Date("2026-04-24T10:00:00"); // Fri
    const prev = new Date(fri);
    prev.setDate(fri.getDate() - 7);
    const staleAt = fri.getTime() - 5 * 24 * 60 * 60 * 1000; // 5d ago
    setDigest(getWeekKey(prev), {
      generatedAt: new Date(staleAt).toISOString(),
    });
    expect(hasLiveWeeklyDigest(fri)).toBe(false);
  });

  it("returns false with no digests at all on a non-Monday", () => {
    const fri = new Date("2026-04-24T10:00:00");
    expect(hasLiveWeeklyDigest(fri)).toBe(false);
  });
});
