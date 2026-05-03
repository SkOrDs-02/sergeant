import { describe, expect, it } from "vitest";

import { createMemoryKVStore } from "../storage/kv";
import {
  ALL_MODULES,
  FIRST_ACTION_PENDING_KEY,
  FIRST_ACTION_STARTED_AT_KEY,
  LAST_SESSION_DAY_KEY,
  SESSION_DAYS_KEY,
  SOFT_AUTH_DISMISSED_KEY,
  TTV_MS_KEY,
  VIBE_PICKS_KEY,
  clearFirstActionPending,
  dismissSoftAuth,
  getFirstActionStartedAt,
  getSessionDays,
  getTimeToValueMs,
  getVibePicks,
  isFirstActionPending,
  isFirstRealEntryDone,
  isSoftAuthDismissed,
  markFirstActionPending,
  markFirstActionStartedAt,
  markFirstRealEntryDone,
  recordSessionDay,
  sanitizePicks,
  saveTimeToValueMs,
  saveVibePicks,
  todayKey,
} from "./vibePicks";

describe("sanitizePicks", () => {
  it("filters unknown and duplicate ids, keeping order", () => {
    expect(
      sanitizePicks(["finyk", "bogus", "fizruk", "finyk", "routine"]),
    ).toEqual(["finyk", "fizruk", "routine"]);
  });

  it("returns [] for non-arrays", () => {
    expect(sanitizePicks(null)).toEqual([]);
    expect(sanitizePicks(undefined)).toEqual([]);
    expect(sanitizePicks("finyk")).toEqual([]);
    expect(sanitizePicks({ finyk: true })).toEqual([]);
  });

  it("drops non-string entries", () => {
    expect(sanitizePicks(["finyk", 42, null, "fizruk"])).toEqual([
      "finyk",
      "fizruk",
    ]);
  });

  it("ALL_MODULES matches the dashboard id set", () => {
    expect([...ALL_MODULES]).toEqual([
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ]);
  });
});

describe("getVibePicks / saveVibePicks", () => {
  it("reads an empty list when storage is blank", () => {
    expect(getVibePicks(createMemoryKVStore())).toEqual([]);
  });

  it("round-trips picks through storage", () => {
    const s = createMemoryKVStore();
    saveVibePicks(s, ["fizruk", "routine"]);
    expect(getVibePicks(s)).toEqual(["fizruk", "routine"]);
  });

  it("drops garbage ids on write", () => {
    const s = createMemoryKVStore();
    saveVibePicks(s, ["bogus", "finyk"] as never);
    expect(getVibePicks(s)).toEqual(["finyk"]);
  });

  it("returns [] when the stored blob is corrupted", () => {
    const s = createMemoryKVStore({ [VIBE_PICKS_KEY]: "{bad" });
    expect(getVibePicks(s)).toEqual([]);
  });
});

describe("first-action pending flag", () => {
  it("sets / clears / reads the 1-bit flag", () => {
    const s = createMemoryKVStore();
    expect(isFirstActionPending(s)).toBe(false);
    markFirstActionPending(s);
    expect(isFirstActionPending(s)).toBe(true);
    expect(s.getString(FIRST_ACTION_PENDING_KEY)).toBe("1");
    clearFirstActionPending(s);
    expect(isFirstActionPending(s)).toBe(false);
  });
});

describe("first-real-entry flag", () => {
  it("flips the flag on mark and is read by isFirstRealEntryDone", () => {
    const s = createMemoryKVStore();
    expect(isFirstRealEntryDone(s)).toBe(false);
    markFirstRealEntryDone(s);
    expect(isFirstRealEntryDone(s)).toBe(true);
  });
});

describe("soft-auth dismissal", () => {
  it("reads / writes the dismissal flag", () => {
    const s = createMemoryKVStore();
    expect(isSoftAuthDismissed(s)).toBe(false);
    dismissSoftAuth(s);
    expect(isSoftAuthDismissed(s)).toBe(true);
    expect(s.getString(SOFT_AUTH_DISMISSED_KEY)).toBe("1");
  });
});

describe("FTUX timestamp helpers", () => {
  it("markFirstActionStartedAt is idempotent", () => {
    const s = createMemoryKVStore();
    markFirstActionStartedAt(s, () => 1_000);
    markFirstActionStartedAt(s, () => 2_000);
    expect(s.getString(FIRST_ACTION_STARTED_AT_KEY)).toBe("1000");
    expect(getFirstActionStartedAt(s)).toBe(1_000);
  });

  it("getFirstActionStartedAt returns null for missing / zero / negative values", () => {
    const s = createMemoryKVStore();
    expect(getFirstActionStartedAt(s)).toBeNull();
    s.setString(FIRST_ACTION_STARTED_AT_KEY, "0");
    expect(getFirstActionStartedAt(s)).toBeNull();
    s.setString(FIRST_ACTION_STARTED_AT_KEY, "bogus");
    expect(getFirstActionStartedAt(s)).toBeNull();
  });

  it("saveTimeToValueMs rejects negative / NaN values", () => {
    const s = createMemoryKVStore();
    saveTimeToValueMs(s, -1);
    saveTimeToValueMs(s, Number.NaN);
    expect(s.getString(TTV_MS_KEY)).toBeNull();
  });

  it("saveTimeToValueMs rounds and getTimeToValueMs reads back", () => {
    const s = createMemoryKVStore();
    saveTimeToValueMs(s, 12_345.7);
    expect(s.getString(TTV_MS_KEY)).toBe("12346");
    expect(getTimeToValueMs(s)).toBe(12346);
  });

  it("getTimeToValueMs returns null for invalid payloads", () => {
    const s = createMemoryKVStore({ [TTV_MS_KEY]: "abc" });
    expect(getTimeToValueMs(s)).toBeNull();
  });
});

describe("recordSessionDay / getSessionDays", () => {
  it("increments the counter once per calendar day", () => {
    const s = createMemoryKVStore();
    const day1 = new Date("2025-01-15T10:00:00Z");
    const day1b = new Date("2025-01-15T22:30:00Z");
    const day2 = new Date("2025-01-16T03:00:00Z");

    expect(recordSessionDay(s, () => day1)).toBe(1);
    expect(recordSessionDay(s, () => day1b)).toBe(1);
    expect(recordSessionDay(s, () => day2)).toBe(2);
    expect(getSessionDays(s)).toBe(2);
    expect(s.getString(LAST_SESSION_DAY_KEY)).toBe(todayKey(day2));
  });

  it("handles corrupted counter payload by falling back to 0", () => {
    const s = createMemoryKVStore({
      [SESSION_DAYS_KEY]: "abc",
      [LAST_SESSION_DAY_KEY]: "2020-01-01",
    });
    expect(getSessionDays(s)).toBe(0);
    const next = recordSessionDay(s, () => new Date("2025-02-10T00:00:00Z"));
    expect(next).toBe(1);
  });
});
