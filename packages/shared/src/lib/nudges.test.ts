import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { createMemoryKVStore } from "../storage/kv";
import {
  getActiveNudge,
  dismissNudge,
  snoozeNudge,
  recordLastActiveDate,
  getDaysInactive,
  shouldShowReengagement,
  markReengagementShown,
  REENGAGEMENT_INACTIVE_DAYS,
} from "./nudges";

describe("getActiveNudge", () => {
  it("returns null for sessionDays < 2", () => {
    const store = createMemoryKVStore();
    expect(getActiveNudge(store, 0)).toBeNull();
    expect(getActiveNudge(store, 1)).toBeNull();
  });

  it("returns null for sessionDays > 7", () => {
    const store = createMemoryKVStore();
    expect(getActiveNudge(store, 8)).toBeNull();
    expect(getActiveNudge(store, 30)).toBeNull();
  });

  it("returns a nudge for day 2", () => {
    const store = createMemoryKVStore();
    const nudge = getActiveNudge(store, 2, {
      picks: ["routine", "finyk"],
    });
    expect(nudge).not.toBeNull();
    expect(nudge!.day).toBeLessThanOrEqual(2);
  });

  it("returns day7 nudge on day 7", () => {
    const store = createMemoryKVStore();
    // Dismiss earlier nudges
    dismissNudge(store, "day2_routine");
    dismissNudge(store, "day3_chat");
    dismissNudge(store, "day5_analytics");
    const nudge = getActiveNudge(store, 7);
    expect(nudge).not.toBeNull();
    expect(nudge!.id).toBe("day7_digest");
  });

  it("skips dismissed nudges", () => {
    const store = createMemoryKVStore();
    const first = getActiveNudge(store, 3, { picks: ["finyk"] });
    expect(first).not.toBeNull();
    dismissNudge(store, first!.id);
    const second = getActiveNudge(store, 3, { picks: ["finyk"] });
    expect(second === null || second.id !== first!.id).toBe(true);
  });

  it("skips routine nudge if routine not in picks", () => {
    const store = createMemoryKVStore();
    const nudge = getActiveNudge(store, 2, { picks: ["finyk"] });
    // Should skip day2_routine since routine not in picks
    expect(nudge === null || nudge.id !== "day2_routine").toBe(true);
  });

  it("skips routine nudge if routine already has entries", () => {
    const store = createMemoryKVStore();
    const nudge = getActiveNudge(store, 2, {
      picks: ["routine"],
      modulesWithEntries: new Set(["routine"]),
    });
    expect(nudge === null || nudge.id !== "day2_routine").toBe(true);
  });

  it("skips snoozed nudges while the window is open, re-surfaces them later", () => {
    const store = createMemoryKVStore();
    const first = getActiveNudge(store, 3, { picks: ["finyk"] });
    expect(first).not.toBeNull();
    snoozeNudge(store, first!.id, 7);
    const second = getActiveNudge(store, 3, { picks: ["finyk"] });
    expect(second === null || second.id !== first!.id).toBe(true);
    // Simulate the snooze window elapsing by writing an expired timestamp.
    const expired = Date.now() - 1000;
    const raw = JSON.stringify({ [first!.id]: expired });
    store.setString("hub_nudge_snooze_v1", raw);
    const third = getActiveNudge(store, 3, { picks: ["finyk"] });
    expect(third?.id).toBe(first!.id);
  });
});

describe("re-engagement", () => {
  it("getDaysInactive returns 0 when never recorded", () => {
    const store = createMemoryKVStore();
    expect(getDaysInactive(store)).toBe(0);
  });

  it("getDaysInactive counts days correctly", () => {
    const store = createMemoryKVStore();
    const past = new Date("2025-01-01T12:00:00Z");
    recordLastActiveDate(store, past);
    const now = new Date("2025-01-10T12:00:00Z");
    expect(getDaysInactive(store, now)).toBe(9);
  });

  it("shouldShowReengagement returns false on day 1 (still within active window)", () => {
    const store = createMemoryKVStore();
    const past = new Date("2025-01-07T12:00:00Z");
    recordLastActiveDate(store, past);
    const now = new Date("2025-01-08T12:00:00Z");
    const result = shouldShowReengagement(store, now);
    expect(result.show).toBe(false);
    expect(result.daysInactive).toBe(1);
  });

  it("shouldShowReengagement returns true on day 2 (early-loop threshold)", () => {
    const store = createMemoryKVStore();
    const past = new Date("2025-01-06T12:00:00Z");
    recordLastActiveDate(store, past);
    const now = new Date("2025-01-08T12:00:00Z");
    const result = shouldShowReengagement(store, now);
    expect(result.show).toBe(true);
    expect(result.daysInactive).toBe(2);
  });

  it("shouldShowReengagement still surfaces deep into the inactive window (>= 7 days)", () => {
    const store = createMemoryKVStore();
    const past = new Date("2025-01-01T12:00:00Z");
    recordLastActiveDate(store, past);
    const now = new Date("2025-01-10T12:00:00Z");
    const result = shouldShowReengagement(store, now);
    expect(result.show).toBe(true);
    expect(result.daysInactive).toBe(9);
  });

  it("shouldShowReengagement returns false after markReengagementShown", () => {
    const store = createMemoryKVStore();
    const past = new Date("2025-01-01T12:00:00Z");
    recordLastActiveDate(store, past);
    const now = new Date("2025-01-10T12:00:00Z");
    expect(shouldShowReengagement(store, now).show).toBe(true);
    markReengagementShown(store, now);
    expect(shouldShowReengagement(store, now).show).toBe(false);
  });
});

describe("re-engagement audit-guard (S6.9)", () => {
  it("REENGAGEMENT_INACTIVE_DAYS is the 2-day early-loop threshold", () => {
    // Audit-guard: changing this constant is a product decision
    // (re-engagement window). If you bump it, also update
    // `docs/launch/ftux-sprint-plan.md` S6.9 row and re-run baseline.
    expect(REENGAGEMENT_INACTIVE_DAYS).toBe(2);
  });

  it("nudges.ts source has no stale 7-day re-engagement threshold", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./nudges.ts", import.meta.url)),
      "utf-8",
    );
    // Audit-guard: pre-S6.9 code branched on `daysInactive < 7`. Block any
    // accidental rollback by failing if either the literal `< 7` or the
    // older comparison form re-appears in the same function.
    expect(src).not.toMatch(/daysInactive\s*<\s*7\b/);
    expect(src).toContain("REENGAGEMENT_INACTIVE_DAYS");
  });
});
