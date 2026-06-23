import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeJSONMock } = vi.hoisted(() => ({ writeJSONMock: vi.fn() }));

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return { ...actual, writeJSON: writeJSONMock };
});

import { seedRoutine } from "./seedRoutine";

const ROUTINE_STATE_KEY = "hub_routine_v1";

interface SeededState {
  schemaVersion: number;
  habits: Array<{ id: string; demo: boolean; name: string }>;
  completions: Record<string, string[]>;
  pushupsByDate: Record<string, number>;
  habitOrder: string[];
}

describe("seedRoutine", () => {
  beforeEach(() => {
    writeJSONMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes 5 demo habits under the routine key", () => {
    seedRoutine();
    expect(writeJSONMock).toHaveBeenCalledTimes(1);
    const [key, state] = writeJSONMock.mock.calls[0]! as [string, SeededState];
    expect(key).toBe(ROUTINE_STATE_KEY);
    expect(state.habits).toHaveLength(5);
    expect(state.habits.every((h) => h.demo === true)).toBe(true);
  });

  it("seeds completions for every habit and 14 days of pushups", () => {
    seedRoutine();
    const [, state] = writeJSONMock.mock.calls[0]! as [string, SeededState];
    expect(Object.keys(state.completions)).toHaveLength(5);
    for (const dates of Object.values(state.completions)) {
      expect(dates.length).toBeGreaterThan(0);
      // YYYY-MM-DD Kyiv-local day key format
      expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(Object.keys(state.pushupsByDate)).toHaveLength(14);
  });

  it("derives habitOrder from the habit ids", () => {
    seedRoutine();
    const [, state] = writeJSONMock.mock.calls[0]! as [string, SeededState];
    expect(state.habitOrder).toEqual(state.habits.map((h) => h.id));
    expect(state.schemaVersion).toBe(1);
  });
});
