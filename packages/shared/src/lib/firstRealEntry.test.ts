import { describe, expect, it, vi } from "vitest";

import { createMemoryKVStore } from "../storage/kv";
import {
  FIRST_ACTION_STARTED_AT_KEY,
  FIRST_REAL_ENTRY_EVENTS,
  FIRST_REAL_ENTRY_SOURCES,
  detectFirstRealEntry,
  hasAnyRealEntry,
} from "./firstRealEntry";
import { FIRST_REAL_ENTRY_KEY, TTV_MS_KEY } from "./vibePicks";

function storeWith(data: Record<string, unknown>) {
  const s = createMemoryKVStore();
  for (const [k, v] of Object.entries(data)) {
    s.setString(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  return s;
}

describe("hasAnyRealEntry", () => {
  it("returns false on an empty store", () => {
    expect(hasAnyRealEntry(createMemoryKVStore())).toBe(false);
  });

  it("ignores demo-only manual expenses", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "a", demo: true }],
    });
    expect(hasAnyRealEntry(s)).toBe(false);
  });

  it("treats non-demo manual expenses as real", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [
        { id: "a", demo: true },
        { id: "b" },
      ],
    });
    expect(hasAnyRealEntry(s)).toBe(true);
  });

  it("detects a synced monobank cache with transactions", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE]: {
        transactions: [{ id: "tx" }],
      },
    });
    expect(hasAnyRealEntry(s)).toBe(true);
  });

  it("ignores an empty monobank transactions cache", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE]: { transactions: [] },
    });
    expect(hasAnyRealEntry(s)).toBe(false);
  });

  it("accepts a bare-array fizruk workouts payload", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: [{ id: "w", demo: true }],
    });
    expect(hasAnyRealEntry(s)).toBe(false);

    const s2 = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: [{ id: "w" }],
    });
    expect(hasAnyRealEntry(s2)).toBe(true);
  });

  it("accepts an object-wrapped fizruk workouts payload", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: {
        workouts: [{ id: "w" }],
      },
    });
    expect(hasAnyRealEntry(s)).toBe(true);
  });

  it("detects real routine habits", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.ROUTINE]: {
        habits: [{ id: "h", demo: true }, { id: "real" }],
      },
    });
    expect(hasAnyRealEntry(s)).toBe(true);
  });

  it("scans every day of the nutrition log", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG]: {
        "2025-01-01": { meals: [{ id: "m", demo: true }] },
        "2025-01-02": { meals: [{ id: "real" }] },
      },
    });
    expect(hasAnyRealEntry(s)).toBe(true);
  });

  it("survives corrupted JSON in any slot", () => {
    const s = createMemoryKVStore({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: "{bad",
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: "nope",
    });
    expect(hasAnyRealEntry(s)).toBe(false);
  });
});

describe("detectFirstRealEntry", () => {
  it("returns true immediately if the flag is already set", () => {
    const s = createMemoryKVStore({ [FIRST_REAL_ENTRY_KEY]: "1" });
    const trackEvent = vi.fn();
    expect(detectFirstRealEntry(s, { trackEvent })).toBe(true);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("returns false without side effects when no real entry exists", () => {
    const s = createMemoryKVStore();
    const trackEvent = vi.fn();
    expect(detectFirstRealEntry(s, { trackEvent })).toBe(false);
    expect(s.getString(FIRST_REAL_ENTRY_KEY)).toBeNull();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("flips the flag and fires first_real_entry", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
    });
    const trackEvent = vi.fn();
    expect(detectFirstRealEntry(s, { trackEvent })).toBe(true);
    expect(s.getString(FIRST_REAL_ENTRY_KEY)).toBe("1");
    expect(trackEvent).toHaveBeenCalledWith(
      FIRST_REAL_ENTRY_EVENTS.FIRST_REAL_ENTRY,
    );
  });

  it("computes TTV when the origin timestamp is set", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
      [FIRST_ACTION_STARTED_AT_KEY]: "1000",
    });
    const trackEvent = vi.fn();
    detectFirstRealEntry(s, { trackEvent, now: () => 9_500 });
    expect(s.getString(TTV_MS_KEY)).toBe("8500");
    expect(trackEvent).toHaveBeenCalledWith(
      FIRST_REAL_ENTRY_EVENTS.FTUX_TIME_TO_VALUE,
      { durationMs: 8_500, durationSec: 9 },
    );
  });

  it("skips the TTV event when no origin timestamp exists", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
    });
    const trackEvent = vi.fn();
    detectFirstRealEntry(s, { trackEvent });
    expect(s.getString(TTV_MS_KEY)).toBeNull();
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("clamps negative TTV to zero", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
      [FIRST_ACTION_STARTED_AT_KEY]: "9000",
    });
    const trackEvent = vi.fn();
    detectFirstRealEntry(s, { trackEvent, now: () => 1_000 });
    expect(s.getString(TTV_MS_KEY)).toBe("0");
  });

  it("is safe when no trackEvent callback is provided", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
    });
    expect(() => detectFirstRealEntry(s)).not.toThrow();
    expect(s.getString(FIRST_REAL_ENTRY_KEY)).toBe("1");
  });
});
