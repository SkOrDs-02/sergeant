import { fireEvent, render } from "@testing-library/react-native";

import {
  defaultNutritionPrefs,
  type NutritionLog,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";

import { DailyPlanCard } from "../DailyPlanCard";

function makePrefs(overrides: Partial<NutritionPrefs> = {}): NutritionPrefs {
  return { ...defaultNutritionPrefs(), ...overrides };
}

const EMPTY_LOG: NutritionLog = {};

describe("DailyPlanCard interactions", () => {
  it("auto-recalculates kcal when macro grams change and kcal was derived", () => {
    const updatePrefs = jest.fn();
    const { getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs({
          dailyTargetKcal: 900,
          dailyTargetProtein_g: 100,
          dailyTargetFat_g: 20,
          dailyTargetCarbs_g: 80,
        })}
        updatePrefs={updatePrefs}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    fireEvent.changeText(getByTestId("daily-plan-dailyTargetProtein_g"), "120");

    expect(updatePrefs).toHaveBeenCalledWith({
      dailyTargetProtein_g: 120,
      dailyTargetKcal: 980,
    });
  });

  it("does not overwrite manually pinned kcal when macro grams change", () => {
    const updatePrefs = jest.fn();
    const { getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 100,
          dailyTargetFat_g: 20,
          dailyTargetCarbs_g: 80,
        })}
        updatePrefs={updatePrefs}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    fireEvent.changeText(getByTestId("daily-plan-dailyTargetFat_g"), "40");

    expect(updatePrefs).toHaveBeenCalledWith({ dailyTargetFat_g: 40 });
  });

  it("applies suggested macros from the missing-macros hint", () => {
    const updatePrefs = jest.fn();
    const { getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs({ dailyTargetKcal: 1800 })}
        updatePrefs={updatePrefs}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    fireEvent.press(getByTestId("missing-macros-hint-apply"));

    expect(updatePrefs).toHaveBeenCalledWith({
      dailyTargetProtein_g: 135,
      dailyTargetFat_g: 50,
      dailyTargetCarbs_g: 202,
    });
  });

  it("lets warning actions recalculate kcal or clear macro targets", () => {
    const updatePrefs = jest.fn();
    const prefs = makePrefs({
      dailyTargetKcal: 1200,
      dailyTargetProtein_g: 160,
      dailyTargetFat_g: 80,
      dailyTargetCarbs_g: 180,
    });
    const { getByTestId } = render(
      <DailyPlanCard
        prefs={prefs}
        updatePrefs={updatePrefs}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    fireEvent.press(getByTestId("macro-kcal-warning-recalc"));
    fireEvent.press(getByTestId("macro-kcal-warning-reset-macros"));

    expect(updatePrefs).toHaveBeenCalledWith({ dailyTargetKcal: 2080 });
    expect(updatePrefs).toHaveBeenCalledWith({
      dailyTargetProtein_g: null,
      dailyTargetFat_g: null,
      dailyTargetCarbs_g: null,
    });
  });

  it("expands meal ingredients and calls regen with the meal type", () => {
    const onRegen = jest.fn();
    const { getByTestId, getByText, queryByText } = render(
      <DailyPlanCard
        prefs={makePrefs({ dailyTargetKcal: 2000 })}
        updatePrefs={jest.fn()}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
        onRegenMeal={onRegen}
        dayPlan={{
          totalKcal: 500,
          meals: [
            {
              type: "snack",
              name: "Грецький йогурт",
              ingredients: ["йогурт", "чорниця"],
              kcal: 220,
            },
          ],
        }}
      />,
    );

    expect(queryByText("• йогурт")).toBeNull();
    fireEvent.press(getByTestId("daily-plan-meal-0-toggle-ingredients"));
    expect(getByText("• йогурт")).toBeTruthy();

    fireEvent.press(getByTestId("daily-plan-meal-0-regen"));
    expect(onRegen).toHaveBeenCalledWith("snack");
  });

  it("disables the generate CTA while the day plan request is busy", () => {
    const onFetch = jest.fn();
    const { getByTestId, getByText } = render(
      <DailyPlanCard
        prefs={makePrefs()}
        updatePrefs={jest.fn()}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
        onFetchDayPlan={onFetch}
        dayPlanBusy
      />,
    );

    const button = getByTestId("daily-plan-fetch-button");
    fireEvent.press(button);

    expect(getByText("Генерую план…")).toBeTruthy();
    expect(onFetch).not.toHaveBeenCalled();
  });
});
