/**
 * Render + interaction tests for the mobile `DailyPlanCard` (Phase 7).
 *
 * Покриває:
 *  - Рендер заголовка та секції цілей навіть з default prefs.
 *  - Goal-preset chip натискання викликає `updatePrefs` з пресет-значеннями
 *    (контракт «пресет → MMKV» з web parity).
 *  - `GoalRangeWarning` показується для занадто низького kcal (м'які
 *    наукові межі з `@sergeant/nutrition-domain`).
 *  - Прогрес-бар і `MacroBadge` для журналу рендеряться коли є kcal-ціль.
 *  - `DailyPlanMealRow` рендериться для AI-плану (опційний `dayPlan`).
 */
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

describe("DailyPlanCard", () => {
  it("рендериться з заголовком і блоком цілей", () => {
    const { getByText, getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs()}
        updatePrefs={jest.fn()}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    expect(getByText("Денний план")).toBeTruthy();
    expect(getByText("Цілі на день")).toBeTruthy();
    expect(getByTestId("daily-plan-card")).toBeTruthy();
    expect(getByTestId("daily-plan-goal-presets")).toBeTruthy();
  });

  it("натискання пресету викликає updatePrefs з цільовими значеннями", () => {
    const updatePrefs = jest.fn();
    const { getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs()}
        updatePrefs={updatePrefs}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    fireEvent.press(getByTestId("daily-plan-goal-preset-maintenance"));

    expect(updatePrefs).toHaveBeenCalledWith({
      dailyTargetKcal: 2000,
      dailyTargetProtein_g: 130,
      dailyTargetFat_g: 65,
      dailyTargetCarbs_g: 230,
    });
  });

  it("показує warning для занадто низького kcal-цілі (домен GOAL_BOUNDS)", () => {
    const { getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs({ dailyTargetKcal: 500 })}
        updatePrefs={jest.fn()}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    expect(getByTestId("goal-range-warning")).toBeTruthy();
  });

  it("рендерить прогрес-бар коли є kcal-ціль і журнал має прийом", () => {
    const log: NutritionLog = {
      "2026-05-13": {
        meals: [
          {
            id: "m1",
            name: "Куряча грудка з рисом",
            time: "12:00",
            mealType: "lunch",
            label: "Обід",
            macros: {
              kcal: 600,
              protein_g: 50,
              fat_g: 15,
              carbs_g: 60,
            },
            source: "manual",
            macroSource: "manual",
            amount_g: null,
            foodId: null,
          },
        ],
      },
    };

    const { getByTestId, getByText } = render(
      <DailyPlanCard
        prefs={makePrefs({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 130,
          dailyTargetFat_g: 65,
          dailyTargetCarbs_g: 230,
        })}
        updatePrefs={jest.fn()}
        nutritionLog={log}
        selectedDate="2026-05-13"
      />,
    );

    expect(getByTestId("daily-plan-progress")).toBeTruthy();
    expect(getByText("600 / 2000 ккал")).toBeTruthy();
    expect(getByTestId("daily-plan-progress-fill")).toBeTruthy();
  });

  it("рендерить meal-row коли передано dayPlan з прийомами", () => {
    const onAdd = jest.fn();
    const { getByText, getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs({ dailyTargetKcal: 2000 })}
        updatePrefs={jest.fn()}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
        onAddMealToLog={onAdd}
        dayPlan={{
          totalKcal: 1900,
          note: "Збалансований день",
          meals: [
            {
              type: "breakfast",
              label: "Сніданок",
              name: "Вівсянка з ягодами",
              description: "150 г вівсянки, чорниця, мед",
              kcal: 420,
              protein_g: 15,
              fat_g: 8,
              carbs_g: 70,
              ingredients: ["вівсянка", "ягоди", "мед"],
            },
          ],
        }}
      />,
    );

    expect(getByTestId("daily-plan-meals")).toBeTruthy();
    expect(getByText("Вівсянка з ягодами")).toBeTruthy();
    expect(getByText("~1900 ккал разом")).toBeTruthy();
    fireEvent.press(getByTestId("daily-plan-meal-0-add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("ховає preset selectors і progress-bar, але рендерить заголовок коли цілей нема", () => {
    const { queryByTestId, getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs()}
        updatePrefs={jest.fn()}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    expect(getByTestId("daily-plan-goal-presets")).toBeTruthy();
    // Жодних цілей → нема ні прогрес-бару, ні badge-рядка з скиданням.
    expect(queryByTestId("daily-plan-progress")).toBeNull();
    expect(queryByTestId("daily-plan-reset-goals")).toBeNull();
  });

  it("«Скинути цілі» вимагає подвійний tap і потім чистить усі чотири поля", () => {
    const updatePrefs = jest.fn();
    const { getByTestId } = render(
      <DailyPlanCard
        prefs={makePrefs({ dailyTargetKcal: 2000, dailyTargetProtein_g: 130 })}
        updatePrefs={updatePrefs}
        nutritionLog={EMPTY_LOG}
        selectedDate="2026-05-13"
      />,
    );

    const resetBtn = getByTestId("daily-plan-reset-goals");
    fireEvent.press(resetBtn);
    expect(updatePrefs).not.toHaveBeenCalled();

    fireEvent.press(resetBtn);
    expect(updatePrefs).toHaveBeenCalledWith({
      dailyTargetKcal: null,
      dailyTargetProtein_g: null,
      dailyTargetFat_g: null,
      dailyTargetCarbs_g: null,
    });
  });
});
