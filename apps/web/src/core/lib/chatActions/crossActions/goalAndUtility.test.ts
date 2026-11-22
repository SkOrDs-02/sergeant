import { beforeEach, describe, expect, it, vi } from "vitest";

const prefs = vi.hoisted(() => ({
  state: { dailyTargetKcal: 1800 as number | null },
  hydrated: true,
}));

vi.mock("@nutrition/lib/nutritionStorage", () => ({
  loadLatestNutritionPrefs: () => ({ ...prefs.state }),
  patchNutritionPrefs: vi.fn((patch: { dailyTargetKcal?: number | null }) => {
    if (!prefs.hydrated) return false;
    Object.assign(prefs.state, patch);
    return true;
  }),
}));

import { setGoal } from "./goalAndUtility";
import type { SetGoalAction } from "../types";

const action = (daily_kcal: number): SetGoalAction =>
  ({ name: "set_goal", input: { daily_kcal } }) as SetGoalAction;

describe("set_goal undo (logic-03)", () => {
  beforeEach(() => {
    prefs.state = { dailyTargetKcal: 1800 };
    prefs.hydrated = true;
  });

  it("повертає undo, яке відновлює попередню денну норму", () => {
    const out = setGoal(action(2200));
    expect(typeof out).toBe("object");
    if (typeof out === "string") throw new Error("очікувався undo");
    expect(out.result).toMatch(/^Ціль збережено/);
    expect(prefs.state.dailyTargetKcal).toBe(2200);
    out.undo?.();
    expect(prefs.state.dailyTargetKcal).toBe(1800);
  });

  it("порожня попередня ціль відновлюється як порожня", () => {
    prefs.state = { dailyTargetKcal: null };
    const out = setGoal(action(2000));
    if (typeof out === "string") throw new Error("очікувався undo");
    out.undo?.();
    expect(prefs.state.dailyTargetKcal).toBeNull();
  });

  it("відмова без гідратованої Їжі лишається рядком без undo", () => {
    prefs.hydrated = false;
    const out = setGoal(action(2000));
    expect(typeof out).toBe("string");
  });
});
