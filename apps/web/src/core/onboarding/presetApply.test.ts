/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
  __setRoutineSqliteStateCacheForTests,
} from "../../modules/routine/lib/sqliteReader";
import { loadRoutineState } from "../../modules/routine/lib/routineStorage";

// applyRoutinePreset reads the warm SQLite cache and writes through
// saveRoutineState (which updates the same cache). No localStorage round-trip
// for the routine module after Stage-8 tombstone. Other modules (finyk /
// fizruk / nutrition) have no direct write path — they are handled via the
// config.action flow in PresetSheet.tsx.

import { applyPreset } from "./presetApply";

describe("applyPreset", () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
    dispatchSpy = vi
      .spyOn(window, "dispatchEvent")
      .mockReturnValue(true) as never;
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-0000-0000-000000000000",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    dispatchSpy.mockRestore();
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
  });

  it("ignores an unknown module id", () => {
    // @ts-expect-error invalid module id intentionally
    applyPreset("unknown", { name: "x" });
    expect(loadRoutineState().habits).toHaveLength(0);
  });

  it("finyk / fizruk / nutrition are no-ops (handled via config.action)", () => {
    applyPreset("finyk", {
      description: "Coffee",
      amount: 5000,
      category: "food",
    });
    applyPreset("fizruk", { name: "Run", durationMin: 30 });
    applyPreset("nutrition", { name: "Apple", kcal: 100, mealType: "snack" });
    // Nothing written — routine state unchanged.
    expect(loadRoutineState().habits).toHaveLength(0);
  });

  it("creates a routine habit and dispatches the change event", () => {
    applyPreset("routine", { name: "Stretch", emoji: "🤸" });
    const state = loadRoutineState();
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]).toMatchObject({
      name: "Stretch",
      emoji: "🤸",
      demo: false,
      recurrence: "daily",
    });
    expect(state.habitOrder).toHaveLength(1);
    expect(state.schemaVersion).toBe(3);
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("falls back to a default emoji and appends to existing routine habits", () => {
    __setRoutineSqliteStateCacheForTests({
      habits: [{ id: "h0" } as never],
      habitOrder: ["h0"],
      prefs: { custom: true } as never,
    });
    applyPreset("routine", { name: "Walk" });
    const state = loadRoutineState();
    expect(state.habits).toHaveLength(2);
    expect(state.habits[1]!.emoji).toBe("✓");
    expect(state.habitOrder).toHaveLength(2);
    expect((state.prefs as Record<string, unknown>)["custom"]).toBe(true);
  });
});
