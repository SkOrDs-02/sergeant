import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory store backing the mocked storage helpers. `safeReadLS` returns
// already-decoded values, `safeWriteLS` stores the raw value, mirroring the
// real helper's JSON round-trip semantics closely enough for this unit.
const store = new Map<string, unknown>();

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: <T>(key: string): T | null =>
    store.has(key) ? (store.get(key) as T) : null,
  safeWriteLS: (key: string, value: unknown): void => {
    store.set(key, value);
  },
  safeRemoveLS: (key: string): void => {
    store.delete(key);
  },
}));

import { runDemoCleanupOnce } from "./cleanupDemoData";

const CLEANUP_DONE_KEY = "hub_demo_cleanup_v1_done";
const LEGACY_SEEDED_FLAG_KEY = "hub_demo_seeded_v1";
const LEGACY_BANNER_DISMISSED_KEY = "hub_demo_banner_dismissed_v1";
const FINYK_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
const ROUTINE_STATE_KEY = "hub_routine_v1";
const NUTRITION_LOG_KEY = "nutrition_log_v1";

describe("runDemoCleanupOnce", () => {
  beforeEach(() => {
    store.clear();
  });

  it("is a no-op when the cleanup flag is already set", () => {
    store.set(CLEANUP_DONE_KEY, "1");
    store.set(FINYK_MANUAL_EXPENSES_KEY, [{ demo: true }]);
    runDemoCleanupOnce();
    // Untouched — guard short-circuits before any cleaner runs.
    expect(store.get(FINYK_MANUAL_EXPENSES_KEY)).toEqual([{ demo: true }]);
  });

  it("strips demo finyk expenses and keeps real ones", () => {
    store.set(FINYK_MANUAL_EXPENSES_KEY, [
      { id: "a", demo: true },
      { id: "b" },
      { id: "c", demo: false },
    ]);
    runDemoCleanupOnce();
    expect(store.get(FINYK_MANUAL_EXPENSES_KEY)).toEqual([
      { id: "b" },
      { id: "c", demo: false },
    ]);
  });

  it("leaves finyk untouched when nothing is demo", () => {
    const list = [{ id: "b" }];
    store.set(FINYK_MANUAL_EXPENSES_KEY, list);
    runDemoCleanupOnce();
    expect(store.get(FINYK_MANUAL_EXPENSES_KEY)).toBe(list);
  });

  it("strips demo fizruk workouts in array shape", () => {
    store.set(FIZRUK_WORKOUTS_KEY, [{ id: "a", demo: true }, { id: "b" }]);
    runDemoCleanupOnce();
    expect(store.get(FIZRUK_WORKOUTS_KEY)).toEqual([{ id: "b" }]);
  });

  it("strips demo fizruk workouts in object shape", () => {
    store.set(FIZRUK_WORKOUTS_KEY, {
      schemaVersion: 1,
      workouts: [{ id: "a", demo: true }, { id: "b" }],
    });
    runDemoCleanupOnce();
    expect(store.get(FIZRUK_WORKOUTS_KEY)).toEqual({
      schemaVersion: 1,
      workouts: [{ id: "b" }],
    });
  });

  it("strips demo routine habits, completions, and order", () => {
    store.set(ROUTINE_STATE_KEY, {
      habits: [{ id: "h1", demo: true }, { id: "h2" }],
      completions: { h1: ["2026-01-01"], h2: ["2026-01-02"] },
      habitOrder: ["h1", "h2"],
    });
    runDemoCleanupOnce();
    expect(store.get(ROUTINE_STATE_KEY)).toEqual({
      habits: [{ id: "h2" }],
      completions: { h2: ["2026-01-02"] },
      habitOrder: ["h2"],
    });
  });

  it("leaves routine untouched when there are no demo habits", () => {
    const state = { habits: [{ id: "h2" }] };
    store.set(ROUTINE_STATE_KEY, state);
    runDemoCleanupOnce();
    expect(store.get(ROUTINE_STATE_KEY)).toBe(state);
  });

  it("strips demo nutrition meals and drops emptied days", () => {
    store.set(NUTRITION_LOG_KEY, {
      "2026-01-01": { meals: [{ demo: true }] },
      "2026-01-02": { meals: [{ demo: true }, { id: "real" }] },
      "2026-01-03": { notMeals: true },
    });
    runDemoCleanupOnce();
    expect(store.get(NUTRITION_LOG_KEY)).toEqual({
      "2026-01-02": { meals: [{ id: "real" }] },
      "2026-01-03": { notMeals: true },
    });
  });

  it("clears legacy flags and sets the done flag", () => {
    store.set(LEGACY_SEEDED_FLAG_KEY, "1");
    store.set(LEGACY_BANNER_DISMISSED_KEY, "1");
    runDemoCleanupOnce();
    expect(store.has(LEGACY_SEEDED_FLAG_KEY)).toBe(false);
    expect(store.has(LEGACY_BANNER_DISMISSED_KEY)).toBe(false);
    expect(store.get(CLEANUP_DONE_KEY)).toBe("1");
  });

  it("is idempotent — a second call is a no-op (AI-DANGER guard)", () => {
    store.set(FINYK_MANUAL_EXPENSES_KEY, [{ id: "a", demo: true }]);
    runDemoCleanupOnce();
    const afterFirst = store.get(FINYK_MANUAL_EXPENSES_KEY);
    // Re-seed demo data; the second call must NOT touch it because the
    // done-flag short-circuits.
    store.set(FINYK_MANUAL_EXPENSES_KEY, [{ id: "b", demo: true }]);
    runDemoCleanupOnce();
    expect(store.get(FINYK_MANUAL_EXPENSES_KEY)).toEqual([
      { id: "b", demo: true },
    ]);
    expect(afterFirst).toEqual([]);
  });
});
