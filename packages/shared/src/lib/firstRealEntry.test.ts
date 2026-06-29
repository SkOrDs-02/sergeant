import { describe, expect, it, vi } from "vitest";
import { createMemoryKVStore } from "../test-utils";
import {
  countRealEntries,
  detectFirstActionCompletedPerModule,
  detectFirstRealEntry,
  FIRST_ACTION_STARTED_AT_KEY,
  FIRST_REAL_ENTRY_EVENTS,
  FIRST_REAL_ENTRY_SOURCES,
  getFirstRealEntryModule,
  hasAnyRealEntry,
  moduleHasRealEntry,
  TTV_MS_KEY,
} from "./firstRealEntry";
import { ANALYTICS_EVENTS } from "./analyticsEvents";
import { MULTI_MODULE_ACTIVATED_FIRED_KEY } from "./vibePicks";

function writeJson(
  store: ReturnType<typeof createMemoryKVStore>,
  key: string,
  value: unknown,
) {
  store.setString(key, JSON.stringify(value));
}

describe("first real entry detection", () => {
  it("detects real entries per module source", () => {
    const store = createMemoryKVStore();

    expect(hasAnyRealEntry(store)).toBe(false);
    expect(getFirstRealEntryModule(store)).toBeNull();
    expect(moduleHasRealEntry(store, "finyk")).toBe(false);

    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL, [{ demo: true }]);
    expect(moduleHasRealEntry(store, "finyk")).toBe(false);
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL, [
      { demo: true },
      { amount: 100 },
    ]);
    expect(moduleHasRealEntry(store, "finyk")).toBe(true);
    expect(getFirstRealEntryModule(store)).toBe("finyk");

    const finykCacheStore = createMemoryKVStore();
    writeJson(finykCacheStore, FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE, {
      transactions: [{ id: "mono-1" }],
    });
    expect(moduleHasRealEntry(finykCacheStore, "finyk")).toBe(true);

    const fizrukStore = createMemoryKVStore();
    writeJson(fizrukStore, FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS, {
      workouts: [{ demo: true }, { title: "Run" }],
    });
    expect(moduleHasRealEntry(fizrukStore, "fizruk")).toBe(true);
    expect(getFirstRealEntryModule(fizrukStore)).toBe("fizruk");

    const routineStore = createMemoryKVStore();
    writeJson(routineStore, FIRST_REAL_ENTRY_SOURCES.ROUTINE, {
      habits: [{ demo: false }],
    });
    expect(moduleHasRealEntry(routineStore, "routine")).toBe(true);
    expect(getFirstRealEntryModule(routineStore)).toBe("routine");

    const nutritionStore = createMemoryKVStore();
    writeJson(nutritionStore, FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG, []);
    expect(moduleHasRealEntry(nutritionStore, "nutrition")).toBe(false);
    writeJson(nutritionStore, FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG, {
      "2026-06-25": { meals: [{ demo: true }, { name: "Breakfast" }] },
    });
    expect(moduleHasRealEntry(nutritionStore, "nutrition")).toBe(true);
    expect(getFirstRealEntryModule(nutritionStore)).toBe("nutrition");
  });

  it("counts non-demo entries across every source", () => {
    const store = createMemoryKVStore();
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL, [
      { demo: true },
      { id: "manual-1" },
    ]);
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE, {
      transactions: [{ id: "mono-1" }, { id: "mono-2" }],
    });
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS, [
      { demo: true },
      { id: "workout-1" },
    ]);
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.ROUTINE, {
      habits: [{ id: "habit-1" }, { demo: true }],
    });
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG, {
      "2026-06-25": { meals: [{ id: "meal-1" }, { demo: true }] },
    });

    expect(countRealEntries(store)).toBe(6);
    expect(hasAnyRealEntry(store)).toBe(true);
  });

  it("flips first real entry once and records time-to-value", () => {
    const store = createMemoryKVStore();
    const trackEvent = vi.fn();
    store.setString(FIRST_ACTION_STARTED_AT_KEY, "1000");
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.ROUTINE, {
      habits: [{ id: "habit-1" }],
    });

    expect(detectFirstRealEntry(store, { trackEvent, now: () => 2500 })).toBe(
      true,
    );
    expect(store.getString(TTV_MS_KEY)).toBe("1500");
    expect(trackEvent).toHaveBeenCalledWith(
      FIRST_REAL_ENTRY_EVENTS.FIRST_REAL_ENTRY,
    );
    expect(trackEvent).toHaveBeenCalledWith(
      FIRST_REAL_ENTRY_EVENTS.FTUX_TIME_TO_VALUE,
      { durationMs: 1500, durationSec: 2 },
    );

    trackEvent.mockClear();
    expect(detectFirstRealEntry(store, { trackEvent })).toBe(true);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("returns false without real entries and clamps negative TTV", () => {
    const empty = createMemoryKVStore();
    expect(detectFirstRealEntry(empty)).toBe(false);

    const store = createMemoryKVStore();
    const trackEvent = vi.fn();
    store.setString(FIRST_ACTION_STARTED_AT_KEY, "5000");
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE, {
      transactions: [{ id: "mono-1" }],
    });

    expect(detectFirstRealEntry(store, { trackEvent, now: () => 1000 })).toBe(
      true,
    );
    expect(store.getString(TTV_MS_KEY)).toBe("0");
  });

  it("flips first action completion per module once", () => {
    const store = createMemoryKVStore();
    const trackEvent = vi.fn();
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL, [{ id: "m1" }]);
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS, {
      workouts: [{ id: "w1" }],
    });
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.ROUTINE, {
      habits: [{ id: "h1" }],
    });
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG, {
      "2026-06-25": { meals: [{ id: "meal-1" }] },
    });

    expect(detectFirstActionCompletedPerModule(store, { trackEvent })).toEqual([
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ]);
    // 4 per-module events + 1 multi-module event (count 4 ≥ threshold 2).
    expect(trackEvent).toHaveBeenCalledTimes(5);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.MULTI_MODULE_ACTIVATED,
      {
        module_count: 4,
        modules: ["finyk", "fizruk", "routine", "nutrition"],
        days_since_first_action: null,
      },
    );

    trackEvent.mockClear();
    expect(detectFirstActionCompletedPerModule(store, { trackEvent })).toEqual(
      [],
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("does not fire multi_module_activated for a single activated module", () => {
    const store = createMemoryKVStore();
    const trackEvent = vi.fn();
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL, [{ id: "m1" }]);

    expect(detectFirstActionCompletedPerModule(store, { trackEvent })).toEqual([
      "finyk",
    ]);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED,
      { module: "finyk" },
    );
    expect(trackEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.MULTI_MODULE_ACTIVATED,
      expect.anything(),
    );
    expect(store.getString(MULTI_MODULE_ACTIVATED_FIRED_KEY)).toBeNull();
  });

  it("fires multi_module_activated once when the second module crosses the threshold", () => {
    const store = createMemoryKVStore();
    const trackEvent = vi.fn();
    const day = 24 * 60 * 60 * 1000;
    // Non-zero stamp: getFirstActionStartedAt rejects "0" (n > 0 guard).
    store.setString(FIRST_ACTION_STARTED_AT_KEY, String(day));
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL, [{ id: "m1" }]);

    // First module — below threshold, no multi-module event.
    detectFirstActionCompletedPerModule(store, { trackEvent });
    expect(trackEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.MULTI_MODULE_ACTIVATED,
      expect.anything(),
    );

    // Second module three days later — crosses the threshold.
    trackEvent.mockClear();
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS, {
      workouts: [{ id: "w1" }],
    });
    expect(
      detectFirstActionCompletedPerModule(store, {
        trackEvent,
        now: () => 4 * day,
      }),
    ).toEqual(["fizruk"]);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.MULTI_MODULE_ACTIVATED,
      {
        module_count: 2,
        modules: ["finyk", "fizruk"],
        days_since_first_action: 3,
      },
    );
    expect(store.getString(MULTI_MODULE_ACTIVATED_FIRED_KEY)).toBe("1");

    // Third module later — flag already set, no second multi-module event.
    trackEvent.mockClear();
    writeJson(store, FIRST_REAL_ENTRY_SOURCES.ROUTINE, {
      habits: [{ id: "h1" }],
    });
    expect(detectFirstActionCompletedPerModule(store, { trackEvent })).toEqual([
      "routine",
    ]);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).not.toHaveBeenCalledWith(
      ANALYTICS_EVENTS.MULTI_MODULE_ACTIVATED,
      expect.anything(),
    );
  });
});
