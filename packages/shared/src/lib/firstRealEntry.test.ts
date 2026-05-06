import { describe, expect, it, vi } from "vitest";

import { createMemoryKVStore } from "../storage/kv";
import {
  FIRST_ACTION_STARTED_AT_KEY,
  FIRST_REAL_ENTRY_EVENTS,
  FIRST_REAL_ENTRY_SOURCES,
  detectFirstActionCompletedPerModule,
  detectFirstRealEntry,
  getFirstRealEntryModule,
  hasAnyRealEntry,
  moduleHasRealEntry,
} from "./firstRealEntry";
import {
  FIRST_ACTION_COMPLETED_KEY_PREFIX,
  FIRST_REAL_ENTRY_KEY,
  TTV_MS_KEY,
} from "./vibePicks";
import { ANALYTICS_EVENTS } from "./analyticsEvents";

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

describe("getFirstRealEntryModule", () => {
  it("returns null when no module has a real entry", () => {
    expect(getFirstRealEntryModule(createMemoryKVStore())).toBeNull();
  });

  it("ignores demo-only payloads", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "a", demo: true }],
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: [{ id: "w", demo: true }],
    });
    expect(getFirstRealEntryModule(s)).toBeNull();
  });

  it("identifies finyk via manual expenses", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
    });
    expect(getFirstRealEntryModule(s)).toBe("finyk");
  });

  it("identifies finyk via synced monobank cache", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE]: {
        transactions: [{ id: "tx" }],
      },
    });
    expect(getFirstRealEntryModule(s)).toBe("finyk");
  });

  it("identifies fizruk via bare-array workouts", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: [{ id: "w" }],
    });
    expect(getFirstRealEntryModule(s)).toBe("fizruk");
  });

  it("identifies fizruk via object-wrapped workouts", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: {
        workouts: [{ id: "w" }],
      },
    });
    expect(getFirstRealEntryModule(s)).toBe("fizruk");
  });

  it("identifies routine via real habits", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.ROUTINE]: {
        habits: [{ id: "h", demo: true }, { id: "real" }],
      },
    });
    expect(getFirstRealEntryModule(s)).toBe("routine");
  });

  it("identifies nutrition by scanning every day", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG]: {
        "2025-01-01": { meals: [{ id: "m", demo: true }] },
        "2025-01-02": { meals: [{ id: "real" }] },
      },
    });
    expect(getFirstRealEntryModule(s)).toBe("nutrition");
  });

  it("returns finyk first when multiple modules race", () => {
    // Documented contract: scan order finyk → fizruk → routine →
    // nutrition. If two modules flipped in the same tick the modal
    // copy stays predictable; analytics still records the actual
    // source via per-event payloads.
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: [{ id: "w" }],
    });
    expect(getFirstRealEntryModule(s)).toBe("finyk");
  });
});

describe("moduleHasRealEntry", () => {
  it("returns false on an empty store for every module", () => {
    const s = createMemoryKVStore();
    expect(moduleHasRealEntry(s, "finyk")).toBe(false);
    expect(moduleHasRealEntry(s, "fizruk")).toBe(false);
    expect(moduleHasRealEntry(s, "routine")).toBe(false);
    expect(moduleHasRealEntry(s, "nutrition")).toBe(false);
  });

  it("isolates modules — a finyk entry doesn't leak into fizruk", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
    });
    expect(moduleHasRealEntry(s, "finyk")).toBe(true);
    expect(moduleHasRealEntry(s, "fizruk")).toBe(false);
    expect(moduleHasRealEntry(s, "routine")).toBe(false);
    expect(moduleHasRealEntry(s, "nutrition")).toBe(false);
  });

  it("ignores demo-only payloads per module", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: [{ id: "w", demo: true }],
      [FIRST_REAL_ENTRY_SOURCES.ROUTINE]: {
        habits: [{ id: "h", demo: true }],
      },
    });
    expect(moduleHasRealEntry(s, "fizruk")).toBe(false);
    expect(moduleHasRealEntry(s, "routine")).toBe(false);
  });

  it("detects nutrition via any day in the meal log", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG]: {
        "2025-01-01": { meals: [{ id: "m", demo: true }] },
        "2025-01-02": { meals: [{ id: "real" }] },
      },
    });
    expect(moduleHasRealEntry(s, "nutrition")).toBe(true);
  });

  it("detects finyk via the synced monobank cache when no manual entries", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_TX_CACHE]: {
        transactions: [{ id: "tx" }],
      },
    });
    expect(moduleHasRealEntry(s, "finyk")).toBe(true);
  });
});

describe("detectFirstActionCompletedPerModule", () => {
  it("returns an empty list and fires no events on an empty store", () => {
    const s = createMemoryKVStore();
    const trackEvent = vi.fn();
    expect(detectFirstActionCompletedPerModule(s, { trackEvent })).toEqual([]);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("flips the per-module flag exactly once and fires first_action_completed", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
    });
    const trackEvent = vi.fn();

    expect(detectFirstActionCompletedPerModule(s, { trackEvent })).toEqual([
      "finyk",
    ]);
    expect(s.getString(`${FIRST_ACTION_COMPLETED_KEY_PREFIX}finyk`)).toBe("1");
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED,
      { module: "finyk" },
    );

    // Re-running with the flag already set is a cheap no-op — module
    // не повинен fire-ити подію вдруге, інакше PostHog funnel роздуме
    // активацію в N рендерів дашборду.
    trackEvent.mockClear();
    expect(detectFirstActionCompletedPerModule(s, { trackEvent })).toEqual([]);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("fires once per module when multiple modules race", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
      [FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS]: [{ id: "w" }],
      [FIRST_REAL_ENTRY_SOURCES.ROUTINE]: { habits: [{ id: "h" }] },
      [FIRST_REAL_ENTRY_SOURCES.NUTRITION_LOG]: {
        "2025-01-01": { meals: [{ id: "real" }] },
      },
    });
    const trackEvent = vi.fn();
    const flipped = detectFirstActionCompletedPerModule(s, { trackEvent });

    expect(flipped.sort()).toEqual(["finyk", "fizruk", "nutrition", "routine"]);
    expect(trackEvent).toHaveBeenCalledTimes(4);
    const modules = trackEvent.mock.calls.map(
      (c) => (c[1] as { module: string }).module,
    );
    expect(modules.sort()).toEqual(["finyk", "fizruk", "nutrition", "routine"]);
  });

  it("emits only for newly-flipped modules — adding fizruk later doesn't refire finyk", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: [{ id: "real" }],
    });
    const trackEvent = vi.fn();
    detectFirstActionCompletedPerModule(s, { trackEvent });
    trackEvent.mockClear();

    // Юзер додає fizruk-workout пізніше, на наступному рендері
    // дашборду. `finyk` уже flag-нутий, тож подія для нього НЕ
    // повинна повторитись — лише `fizruk` випущає `first_action_completed`.
    s.setString(
      FIRST_REAL_ENTRY_SOURCES.FIZRUK_WORKOUTS,
      JSON.stringify([{ id: "w" }]),
    );
    expect(detectFirstActionCompletedPerModule(s, { trackEvent })).toEqual([
      "fizruk",
    ]);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED,
      { module: "fizruk" },
    );
  });

  it("is safe when no trackEvent callback is provided", () => {
    const s = storeWith({
      [FIRST_REAL_ENTRY_SOURCES.ROUTINE]: { habits: [{ id: "h" }] },
    });
    expect(() => detectFirstActionCompletedPerModule(s)).not.toThrow();
    expect(s.getString(`${FIRST_ACTION_COMPLETED_KEY_PREFIX}routine`)).toBe(
      "1",
    );
  });

  it("is independent of FIRST_REAL_ENTRY_KEY — already-set global flag still fires per-module", () => {
    // PR-08 контракт: per-module event тримає своє джерело правди в
    // `hub_first_action_completed_v1:<module>`. Якщо global
    // FIRST_REAL_ENTRY_KEY уже стоїть (наприклад, акаунт мігрував з
    // pre-PR-08 версії), per-module прапори ще не існують — потрібно,
    // щоб подія однаково спрацювала на першому ж дашборд-рендері.
    const s = createMemoryKVStore({
      [FIRST_REAL_ENTRY_KEY]: "1",
      [FIRST_REAL_ENTRY_SOURCES.FINYK_MANUAL]: JSON.stringify([{ id: "r" }]),
    });
    const trackEvent = vi.fn();
    expect(detectFirstActionCompletedPerModule(s, { trackEvent })).toEqual([
      "finyk",
    ]);
    expect(trackEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED,
      { module: "finyk" },
    );
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
