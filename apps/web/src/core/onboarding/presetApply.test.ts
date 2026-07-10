/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routineState = { current: null as Record<string, unknown> | null };

vi.mock("@routine/lib/routineStorage", () => ({
  loadRoutineState: () => routineState.current,
  saveRoutineState: (next: Record<string, unknown>) => {
    routineState.current = next;
  },
}));

import { applyPreset } from "./presetApply";

describe("applyPreset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    routineState.current = null;
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-0000-0000-000000000000",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores an unknown module id", () => {
    // @ts-expect-error invalid module id intentionally
    applyPreset("unknown", { name: "x" });
    expect(routineState.current).toBeNull();
  });

  it("is a no-op for finyk / nutrition / fizruk (PresetSheet config.action path)", () => {
    applyPreset("finyk", { description: "Coffee", amount: 5000 });
    applyPreset("nutrition", { name: "Apple", kcal: 100 });
    applyPreset("fizruk", { name: "Run", durationMin: 30 });
    expect(routineState.current).toBeNull();
  });

  it("creates a routine habit via saveRoutineState", () => {
    applyPreset("routine", { name: "Stretch", emoji: "🤸" });
    const state = routineState.current as {
      habits: Array<{ name: string; emoji: string; demo: boolean }>;
      habitOrder: string[];
      schemaVersion: number;
    };
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]).toMatchObject({
      name: "Stretch",
      emoji: "🤸",
      demo: false,
      recurrence: "daily",
    });
    expect(state.habitOrder).toHaveLength(1);
    expect(state.schemaVersion).toBe(3);
  });

  it("falls back to a default emoji and appends to existing routine habits", () => {
    routineState.current = {
      habits: [{ id: "h0" }],
      habitOrder: ["h0"],
      prefs: { custom: true },
    };
    applyPreset("routine", { name: "Walk" });
    const state = routineState.current as {
      habits: Array<{ emoji: string }>;
      habitOrder: string[];
      prefs: { custom: boolean };
    };
    expect(state.habits).toHaveLength(2);
    expect(state.habits[1]!.emoji).toBe("✓");
    expect(state.habitOrder).toHaveLength(2);
    expect(state.prefs).toEqual({ custom: true });
  });
});
