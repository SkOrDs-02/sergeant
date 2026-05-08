// @vitest-environment jsdom
//
// Render-test for the «Розрахувати з профілю» CTA on `DailyPlanCard`.
// The button is the user-visible end of `lib/tdee.ts` — once we know
// the maths is correct (`tdee.test.ts`), all that's left is to assert
// the dropdown:
//
//   - is hidden behind a hint when biometrics is incomplete,
//   - lists three goals with the computed kcal/macros when complete,
//   - calls `setPrefs` with the matching numbers when one is picked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  defaultNutritionPrefs,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";

import type { Biometrics } from "../../../core/profile/biometrics";
import { DailyPlanCard } from "./DailyPlanCard";
import { NUTRITION_GOALS, computeNutritionTargets } from "../lib/tdee";

const completeBiometrics: Biometrics = {
  heightCm: 180,
  birthDate: "1995-01-15",
  sex: "male",
  activityLevel: "moderate",
  weightKg: 80,
  weightUpdatedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function renderCard(overrides: { biometrics?: Biometrics } = {}) {
  if (overrides.biometrics) {
    localStorage.setItem(
      STORAGE_KEYS.HUB_BIOMETRICS,
      JSON.stringify(overrides.biometrics),
    );
  }
  const setPrefs =
    vi.fn<
      (
        updater: NutritionPrefs | ((p: NutritionPrefs) => NutritionPrefs),
      ) => void
    >();
  const prefs = defaultNutritionPrefs();
  render(
    <DailyPlanCard
      prefs={prefs}
      setPrefs={setPrefs}
      pantryItems={[]}
      busy={false}
      dayPlan={null}
      dayPlanBusy={false}
      fetchDayPlan={() => {}}
      regenMeal={() => {}}
      addMealToLog={() => {}}
      weekPlan={null}
      weekPlanBusy={false}
      fetchWeekPlan={() => {}}
    />,
  );
  return { setPrefs, prefs };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("DailyPlanCard «Розрахувати з профілю»", () => {
  it("shows the profile hint when biometrics is incomplete", () => {
    renderCard();

    fireEvent.click(
      screen.getByRole("button", { name: /Розрахувати з профілю/u }),
    );

    expect(
      screen.getByText(/Заповни біометрію в профілі/u),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Заповнити в профілі/u }),
    ).toBeInTheDocument();
  });

  it("lists every goal with computed kcal when biometrics is complete", () => {
    renderCard({ biometrics: completeBiometrics });

    fireEvent.click(
      screen.getByRole("button", { name: /Розрахувати з профілю/u }),
    );

    for (const goal of NUTRITION_GOALS) {
      const targets = computeNutritionTargets(
        {
          weightKg: 80,
          heightCm: 180,
          ageYears: 31,
          sex: "male",
          activityLevel: "moderate",
        },
        goal,
      );
      const items = screen.getAllByText(
        new RegExp(`${targets.kcal} ккал`, "u"),
      );
      expect(items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("applies the picked goal to setPrefs", () => {
    const { setPrefs } = renderCard({ biometrics: completeBiometrics });

    fireEvent.click(
      screen.getByRole("button", { name: /Розрахувати з профілю/u }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: /Підтримка/u }));

    expect(setPrefs).toHaveBeenCalledTimes(1);
    const updater = setPrefs.mock.calls[0]![0] as (
      p: NutritionPrefs,
    ) => NutritionPrefs;
    const next = updater(defaultNutritionPrefs());

    // The age depends on `Date.now()` at test time — anchor it the
    // same way `computeNutritionTargetsFromBiometrics` does and trust
    // that pure layer (covered exhaustively in `tdee.test.ts`).
    expect(next.dailyTargetKcal).toBeGreaterThan(0);
    expect(next.dailyTargetProtein_g).toBeGreaterThan(0);
    expect(next.dailyTargetFat_g).toBeGreaterThan(0);
    expect(next.dailyTargetCarbs_g).toBeGreaterThan(0);
    // Maintenance keeps protein at 1.6 g/kg of bodyweight (80 kg).
    expect(next.dailyTargetProtein_g).toBe(128);
    expect(next.dailyTargetFat_g).toBe(80);
  });
});
