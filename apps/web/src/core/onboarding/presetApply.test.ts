/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routineState = { current: null as Record<string, unknown> | null };
/** Чи підтвердив SQLite запис. Кейс `false` — недоступний dual-write. */
const durable = { ok: true };

vi.mock("@routine/lib/routineStorage", () => ({
  loadRoutineState: () => routineState.current,
  saveRoutineStateDurable: (next: Record<string, unknown>) => {
    routineState.current = next;
    return Promise.resolve(durable.ok);
  },
}));

import { applyPreset } from "./presetApply";

describe("applyPreset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T10:00:00Z"));
    routineState.current = null;
    durable.ok = true;
    vi.stubGlobal("crypto", {
      randomUUID: () => "00000000-0000-0000-0000-000000000000",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ignores an unknown module id", async () => {
    // @ts-expect-error invalid module id intentionally
    await expect(applyPreset("unknown", { name: "x" })).resolves.toBe(false);
    expect(routineState.current).toBeNull();
  });

  it("is a no-op for finyk / nutrition / fizruk (PresetSheet config.action path)", async () => {
    // `false` тут не помилка, а «цей модуль не пише напряму» — реальний
    // запис станеться пізніше в add-sheet-і модуля, тож СТАРТ-блок не
    // можна вважати витраченим уже зараз.
    await expect(
      applyPreset("finyk", { description: "Coffee", amount: 5000 }),
    ).resolves.toBe(false);
    await expect(
      applyPreset("nutrition", { name: "Apple", kcal: 100 }),
    ).resolves.toBe(false);
    await expect(
      applyPreset("fizruk", { name: "Run", durationMin: 30 }),
    ).resolves.toBe(false);
    expect(routineState.current).toBeNull();
  });

  it("reports failure when SQLite did not confirm the write", async () => {
    durable.ok = false;
    await expect(
      applyPreset("routine", { name: "Stretch", emoji: "run" }),
    ).resolves.toBe(false);
  });

  it("creates a routine habit via saveRoutineStateDurable", async () => {
    await expect(
      applyPreset("routine", { name: "Stretch", emoji: "run" }),
    ).resolves.toBe(true);
    const state = routineState.current as {
      habits: Array<{ name: string; emoji: string; demo: boolean }>;
      habitOrder: string[];
      schemaVersion: number;
    };
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]).toMatchObject({
      name: "Stretch",
      emoji: "run",
      demo: false,
      recurrence: "daily",
    });
    expect(state.habitOrder).toHaveLength(1);
    expect(state.schemaVersion).toBe(3);
  });

  it("falls back to the default glyph and appends to existing routine habits", async () => {
    routineState.current = {
      habits: [{ id: "h0" }],
      habitOrder: ["h0"],
      prefs: { custom: true },
    };
    await applyPreset("routine", { name: "Walk" });
    const state = routineState.current as {
      habits: Array<{ emoji: string }>;
      habitOrder: string[];
      prefs: { custom: boolean };
    };
    expect(state.habits).toHaveLength(2);
    expect(state.habits[1]!.emoji).toBe("check");
    expect(state.habitOrder).toHaveLength(2);
    expect(state.prefs).toEqual({ custom: true });
  });
});
