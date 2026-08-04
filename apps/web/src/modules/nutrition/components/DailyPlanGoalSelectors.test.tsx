// @vitest-environment jsdom
/**
 * Last validated: 2026-08-03
 * Status: Active
 * Unit tests for `DailyPlanGoalSelectors` (single merged preset/TDEE dropdown).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const useBiometrics = vi.fn();
vi.mock("../../../core/profile/useBiometrics", () => ({
  useBiometrics: () => useBiometrics(),
}));

const toastSuccess = vi.fn();
vi.mock("@shared/hooks/useToast", () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn() }),
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

import { DailyPlanGoalSelectors } from "./DailyPlanGoalSelectors";

function renderSel(prefs: Record<string, unknown> = {}) {
  const setPrefs = vi.fn();
  render(
    <MemoryRouter>
      <DailyPlanGoalSelectors prefs={prefs as never} setPrefs={setPrefs} />
    </MemoryRouter>,
  );
  return { setPrefs };
}

afterEach(() => vi.clearAllMocks());

describe("DailyPlanGoalSelectors — biometrics incomplete", () => {
  it("shows the profile hint instead of any preset numbers", () => {
    useBiometrics.mockReturnValue({ biometrics: null });
    computeTargets.mockReturnValue(null);
    renderSel();

    fireEvent.click(screen.getByText("Підказати з пресету"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    // No hardcoded fallback goal options — only the "Скинути вибір" reset
    // item plus the profile-completion prompt, never a static preset ladder.
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByText("Заповнити в профілі")).toBeInTheDocument();
  });
});

describe("DailyPlanGoalSelectors — biometrics complete", () => {
  it("shows personalized targets annotated as calculated from profile, and applies them", () => {
    useBiometrics.mockReturnValue({ biometrics: { weightKg: 80 } });
    computeTargets.mockReturnValue({
      kcal: 2100,
      protein_g: 160,
      fat_g: 70,
      carbs_g: 210,
    });
    const { setPrefs } = renderSel();

    fireEvent.click(screen.getByText("Підказати з пресету"));
    expect(screen.getAllByText("розраховано з профілю").length).toBeGreaterThan(
      0,
    );

    const menuItems = screen.getAllByRole("menuitem");
    fireEvent.click(menuItems[0]!);

    const updater = setPrefs.mock.calls.at(-1)?.[0];
    expect(updater({})).toMatchObject({ dailyTargetKcal: 2100 });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("labels the trigger with the active goal when prefs match a computed target", () => {
    useBiometrics.mockReturnValue({ biometrics: { weightKg: 80 } });
    computeTargets.mockReturnValue({
      kcal: 2100,
      protein_g: 160,
      fat_g: 70,
      carbs_g: 210,
    });
    renderSel({
      dailyTargetKcal: 2100,
      dailyTargetProtein_g: 160,
      dailyTargetFat_g: 70,
      dailyTargetCarbs_g: 210,
    });
    expect(screen.getByText(/^Пресет: /)).toBeInTheDocument();
  });

  it("resets all targets via the reset menu item", () => {
    useBiometrics.mockReturnValue({ biometrics: { weightKg: 80 } });
    computeTargets.mockReturnValue({
      kcal: 2100,
      protein_g: 160,
      fat_g: 70,
      carbs_g: 210,
    });
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
});
