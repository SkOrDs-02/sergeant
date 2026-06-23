// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for `DailyPlanGoalSelectors` (preset + TDEE dropdowns).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useBiometrics = vi.fn();
vi.mock("../../../core/profile/useBiometrics", () => ({
  useBiometrics: () => useBiometrics(),
}));

const computeTargets = vi.fn();
vi.mock("../lib/tdee", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/tdee")>("../lib/tdee");
  return {
    ...actual,
    NUTRITION_GOALS: ["cutting", "maintenance", "bulking"],
    computeNutritionTargetsFromBiometrics: (...a: unknown[]) =>
      computeTargets(...a),
  };
});

import { DailyPlanGoalSelectors, PRESETS } from "./DailyPlanGoalSelectors";

function renderSel(prefs: Record<string, unknown> = {}) {
  const setPrefs = vi.fn();
  render(<DailyPlanGoalSelectors prefs={prefs as never} setPrefs={setPrefs} />);
  return { setPrefs };
}

afterEach(() => vi.clearAllMocks());

describe("DailyPlanGoalSelectors — presets", () => {
  it("opens the preset menu and applies a preset", () => {
    useBiometrics.mockReturnValue({ biometrics: null });
    computeTargets.mockReturnValue(null);
    const { setPrefs } = renderSel();

    fireEvent.click(screen.getByText("Підказати з пресету"));
    fireEvent.click(screen.getByText(PRESETS[1]!.label));

    const updater = setPrefs.mock.calls.at(-1)?.[0];
    expect(updater({})).toMatchObject({
      dailyTargetKcal: PRESETS[1]!.kcal,
      dailyTargetProtein_g: PRESETS[1]!.protein_g,
    });
  });

  it("resets all targets via the reset menu item", () => {
    useBiometrics.mockReturnValue({ biometrics: null });
    computeTargets.mockReturnValue(null);
    const { setPrefs } = renderSel();

    fireEvent.click(screen.getByText("Підказати з пресету"));
    fireEvent.click(screen.getByText("Скинути вибір"));

    const updater = setPrefs.mock.calls.at(-1)?.[0];
    expect(updater({})).toMatchObject({
      dailyTargetKcal: null,
      dailyTargetProtein_g: null,
      dailyTargetFat_g: null,
      dailyTargetCarbs_g: null,
    });
  });

  it("labels the active preset when prefs match one", () => {
    useBiometrics.mockReturnValue({ biometrics: null });
    computeTargets.mockReturnValue(null);
    renderSel({
      dailyTargetKcal: PRESETS[0]!.kcal,
      dailyTargetProtein_g: PRESETS[0]!.protein_g,
      dailyTargetFat_g: PRESETS[0]!.fat_g,
      dailyTargetCarbs_g: PRESETS[0]!.carbs_g,
    });
    expect(
      screen.getByText(`Пресет: ${PRESETS[0]!.label}`),
    ).toBeInTheDocument();
  });
});

describe("DailyPlanGoalSelectors — TDEE", () => {
  it("shows the profile hint when biometrics are unavailable", () => {
    useBiometrics.mockReturnValue({ biometrics: null });
    computeTargets.mockReturnValue(null);
    renderSel();
    fireEvent.click(screen.getByText(/Розрахувати|profile|з профілю/i));
    // The menu opens with a profile link (hint branch).
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("applies computed TDEE targets when biometrics resolve", () => {
    useBiometrics.mockReturnValue({ biometrics: { weightKg: 80 } });
    computeTargets.mockReturnValue({
      kcal: 2100,
      protein_g: 160,
      fat_g: 70,
      carbs_g: 210,
    });
    const { setPrefs } = renderSel();

    // Open the first (TDEE) dropdown — its trigger is the first menu button.
    const triggers = screen.getAllByRole("button");
    fireEvent.click(triggers[0]!);
    const menuItems = screen.getAllByRole("menuitem");
    fireEvent.click(menuItems[0]!);

    const updater = setPrefs.mock.calls.at(-1)?.[0];
    expect(updater({})).toMatchObject({ dailyTargetKcal: 2100 });
  });
});
