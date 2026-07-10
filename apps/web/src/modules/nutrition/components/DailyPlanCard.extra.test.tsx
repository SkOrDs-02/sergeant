// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Component-level tests for DailyPlanCard covering rendering branches not
 * exercised by the pure-function tests in DailyPlanCard.test.tsx:
 *   • Basic render structure
 *   • firstRunHint banner
 *   • Macro input onChange (protein → auto kcal recalc)
 *   • "Скинути" targets button
 *   • "Згенерувати денний план" button
 *   • weekPlan days section
 *   • weekPlanRaw diagnostic details
 *   • dayPlan meals section with progress bar
 *   • Empty pantry hint
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";

// ─── Stub heavy sub-components ────────────────────────────────────────────

vi.mock("@shared/components/ui/Card", () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

vi.mock("@shared/components/ui/Input", () => ({
  Input: ({
    "aria-label": ariaLabel,
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    "aria-label"?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      data-testid={`input-${ariaLabel}`}
    />
  ),
}));

vi.mock("../../../core/onboarding/FirstRunHintBanner", () => ({
  FirstRunHintBanner: ({
    title,
    onDismiss,
  }: {
    title: string;
    onDismiss: () => void;
  }) => (
    <div data-testid="first-run-hint">
      <span>{title}</span>
      <button type="button" onClick={onDismiss}>
        Закрити
      </button>
    </div>
  ),
}));

vi.mock("./DailyPlanWarnings", () => ({
  GoalRangeWarning: () => <div data-testid="goal-range-warning" />,
  MacroKcalWarning: () => <div data-testid="macro-kcal-warning" />,
  MissingMacrosHint: () => <div data-testid="missing-macros-hint" />,
}));

vi.mock("./DailyPlanMacros", () => ({
  MacroRatioBar: () => <div data-testid="macro-ratio-bar" />,
}));

vi.mock("./DailyPlanMealRow", () => ({
  DailyPlanMealRow: ({
    meal,
    onAddToLog,
    onRegen,
  }: {
    meal: { type: string; name: string };
    onAddToLog: (m: unknown) => void;
    onRegen: (t: string) => void;
  }) => (
    <div data-testid={`meal-row-${meal.type}`}>
      <span>{meal.name}</span>
      <button type="button" onClick={() => onAddToLog(meal)}>
        Додати
      </button>
      <button type="button" onClick={() => onRegen(meal.type)}>
        Регенерувати
      </button>
    </div>
  ),
  MEAL_TYPE_ORDER: ["breakfast", "lunch", "dinner"],
}));

vi.mock("./DailyPlanGoalSelectors", () => ({
  DailyPlanGoalSelectors: () => <div data-testid="goal-selectors" />,
}));

// ─── Import under test (after all mocks) ──────────────────────────────────

import { DailyPlanCard } from "./DailyPlanCard";

// ─── Helpers ──────────────────────────────────────────────────────────────

const EMPTY_PREFS: NutritionPrefs = {
  goal: "balanced",
  servings: 2,
  timeMinutes: 30,
  exclude: [],
} as unknown as NutritionPrefs;

function withPrefs(patch: Partial<NutritionPrefs>): NutritionPrefs {
  return { ...EMPTY_PREFS, ...patch } as NutritionPrefs;
}

const defaultHandlers = {
  setPrefs: vi.fn(),
  fetchDayPlan: vi.fn(),
  regenMeal: vi.fn(),
  addMealToLog: vi.fn(),
  fetchWeekPlan: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("DailyPlanCard — basic render", () => {
  it("renders the 'Денний план' heading", () => {
    render(<DailyPlanCard prefs={EMPTY_PREFS} {...defaultHandlers} />);
    expect(screen.getByText("Денний план")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    render(<DailyPlanCard prefs={EMPTY_PREFS} {...defaultHandlers} />);
    expect(
      screen.getByText(/AI генерує персоналізований план/i),
    ).toBeInTheDocument();
  });

  it("renders the 'Згенерувати денний план' button and calls fetchDayPlan on click", () => {
    render(<DailyPlanCard prefs={EMPTY_PREFS} {...defaultHandlers} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Згенерувати денний план/ }),
    );
    expect(defaultHandlers.fetchDayPlan).toHaveBeenCalledTimes(1);
  });

  it("renders 'Генерую план…' label when dayPlanBusy=true", () => {
    render(
      <DailyPlanCard prefs={EMPTY_PREFS} {...defaultHandlers} dayPlanBusy />,
    );
    expect(screen.getByText("Генерую план…")).toBeInTheDocument();
  });

  it("renders the 'План на тиждень + покупки' button", () => {
    render(<DailyPlanCard prefs={EMPTY_PREFS} {...defaultHandlers} />);
    fireEvent.click(screen.getByRole("button", { name: /План на тиждень/ }));
    expect(defaultHandlers.fetchWeekPlan).toHaveBeenCalledTimes(1);
  });

  it("shows the empty pantry hint when pantryItems is empty", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        pantryItems={[]}
      />,
    );
    expect(screen.getByText(/Додай продукти на склад/i)).toBeInTheDocument();
  });
});

describe("DailyPlanCard — firstRunHint", () => {
  it("shows FirstRunHintBanner when firstRunHint=true", () => {
    const onDismiss = vi.fn();
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        firstRunHint
        onDismissFirstRunHint={onDismiss}
      />,
    );
    expect(screen.getByTestId("first-run-hint")).toBeInTheDocument();
    expect(screen.getByText(/це попередня ціль/i)).toBeInTheDocument();
  });

  it("calls onDismissFirstRunHint when the hint is dismissed", () => {
    const onDismiss = vi.fn();
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        firstRunHint
        onDismissFirstRunHint={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Закрити" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT show FirstRunHintBanner when firstRunHint=false", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        firstRunHint={false}
      />,
    );
    expect(screen.queryByTestId("first-run-hint")).not.toBeInTheDocument();
  });
});

describe("DailyPlanCard — macro inputs and kcal recalc", () => {
  it("renders four macro inputs", () => {
    render(<DailyPlanCard prefs={EMPTY_PREFS} {...defaultHandlers} />);
    expect(screen.getByLabelText("Ккал/день")).toBeInTheDocument();
    expect(screen.getByLabelText("Білки (г)")).toBeInTheDocument();
    expect(screen.getByLabelText("Жири (г)")).toBeInTheDocument();
    expect(screen.getByLabelText("Вуглеводи (г)")).toBeInTheDocument();
  });

  it("changing protein input auto-recalculates kcal when kcal is null", () => {
    const setPrefs = vi.fn();
    render(
      <DailyPlanCard
        prefs={withPrefs({
          dailyTargetProtein_g: 0,
          dailyTargetFat_g: 0,
          dailyTargetCarbs_g: 0,
          dailyTargetKcal: null,
        })}
        {...defaultHandlers}
        setPrefs={setPrefs}
      />,
    );
    fireEvent.change(screen.getByLabelText("Білки (г)"), {
      target: { value: "100" },
    });
    expect(setPrefs).toHaveBeenCalled();
    // Invoke the setter callback to verify kcal recalc: 100g protein = 400 kcal
    const updater = setPrefs.mock.calls[0]![0] as (
      p: NutritionPrefs,
    ) => NutritionPrefs;
    const result = updater(
      withPrefs({
        dailyTargetKcal: null,
        dailyTargetProtein_g: 0,
        dailyTargetFat_g: 0,
        dailyTargetCarbs_g: 0,
      }),
    );
    expect(result.dailyTargetKcal).toBe(400);
  });

  it("changing protein to empty string sets value to null", () => {
    const setPrefs = vi.fn();
    render(
      <DailyPlanCard
        prefs={withPrefs({ dailyTargetProtein_g: 100 })}
        {...defaultHandlers}
        setPrefs={setPrefs}
      />,
    );
    fireEvent.change(screen.getByLabelText("Білки (г)"), {
      target: { value: "" },
    });
    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0] as (
      p: NutritionPrefs,
    ) => NutritionPrefs;
    const result = updater(withPrefs({ dailyTargetProtein_g: 100 }));
    expect(result.dailyTargetProtein_g).toBeNull();
  });
});

describe("DailyPlanCard — targets row and Скинути", () => {
  it("shows target badges when prefs has dailyTargetKcal set", () => {
    render(
      <DailyPlanCard
        prefs={withPrefs({ dailyTargetKcal: 2000, dailyTargetProtein_g: 150 })}
        {...defaultHandlers}
      />,
    );
    expect(screen.getByText("2000 ккал")).toBeInTheDocument();
    expect(screen.getByText(/Б: 150г/)).toBeInTheDocument();
  });

  it("'✕ Скинути' button clears all target fields", () => {
    const setPrefs = vi.fn();
    render(
      <DailyPlanCard
        prefs={withPrefs({
          dailyTargetKcal: 2000,
          dailyTargetProtein_g: 150,
          dailyTargetFat_g: 70,
          dailyTargetCarbs_g: 200,
        })}
        {...defaultHandlers}
        setPrefs={setPrefs}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /✕ Скинути/ }));
    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0] as (
      p: NutritionPrefs,
    ) => NutritionPrefs;
    const result = updater(
      withPrefs({ dailyTargetKcal: 2000, dailyTargetProtein_g: 150 }),
    );
    expect(result.dailyTargetKcal).toBeNull();
    expect(result.dailyTargetProtein_g).toBeNull();
    expect(result.dailyTargetFat_g).toBeNull();
    expect(result.dailyTargetCarbs_g).toBeNull();
  });
});

describe("DailyPlanCard — weekPlan section", () => {
  const weekPlanWithDays = {
    days: [
      {
        label: "Понеділок",
        note: "Легка прогулянка",
        meals: ["Вівсянка", "Куряча грудка"],
      },
      { label: "Вівторок", meals: ["Омлет"] },
    ],
    shoppingList: ["Молоко", "Яйця"],
  } as unknown as import("../hooks/useNutritionUiState").NutritionWeekPlan;

  it("renders weekly plan days when weekPlan.days is populated", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        weekPlan={weekPlanWithDays}
      />,
    );
    expect(screen.getByText("Тижневий план")).toBeInTheDocument();
    expect(screen.getByText("Понеділок")).toBeInTheDocument();
    expect(screen.getByText("Вівторок")).toBeInTheDocument();
    expect(screen.getByText("Вівсянка")).toBeInTheDocument();
  });

  it("renders the shopping list when weekPlan.shoppingList is populated", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        weekPlan={weekPlanWithDays}
      />,
    );
    expect(screen.getByText("Список покупок")).toBeInTheDocument();
    expect(screen.getByText("Молоко")).toBeInTheDocument();
    expect(screen.getByText("Яйця")).toBeInTheDocument();
  });

  it("renders weekPlanRaw diagnostic section when weekPlan has no days", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        weekPlanRaw="raw diagnostic text"
        weekPlan={null}
      />,
    );
    expect(screen.getByText("Діагностика плану (raw)")).toBeInTheDocument();
    expect(screen.getByText("raw diagnostic text")).toBeInTheDocument();
  });
});

describe("DailyPlanCard — dayPlan meals section", () => {
  const dayPlanWithMeals = {
    meals: [
      { type: "lunch", name: "Курятина з рисом", kcal: 500 },
      { type: "breakfast", name: "Вівсянка", kcal: 300 },
    ],
    totalKcal: 800,
    note: "Збалансований план",
  } as unknown as import("../hooks/useNutritionUiState").NutritionDayPlan;

  it("renders sorted meal rows when dayPlan has meals", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        dayPlan={dayPlanWithMeals}
      />,
    );
    expect(screen.getByText("Ваш план на сьогодні")).toBeInTheDocument();
    // Both meal rows should appear
    expect(screen.getByTestId("meal-row-breakfast")).toBeInTheDocument();
    expect(screen.getByTestId("meal-row-lunch")).toBeInTheDocument();
  });

  it("renders totalKcal summary when dayPlan has totalKcal", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        dayPlan={dayPlanWithMeals}
      />,
    );
    expect(screen.getByText(/~800 ккал разом/)).toBeInTheDocument();
  });

  it("renders progress bar when both totalKcal and dailyTargetKcal are set", () => {
    render(
      <DailyPlanCard
        prefs={withPrefs({ dailyTargetKcal: 2000 })}
        {...defaultHandlers}
        dayPlan={dayPlanWithMeals}
      />,
    );
    expect(screen.getByText("Прогрес до цілі")).toBeInTheDocument();
    expect(screen.getByText(/800 \/ 2000 ккал/)).toBeInTheDocument();
  });

  it("renders the dayPlan note when present", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        dayPlan={dayPlanWithMeals}
      />,
    );
    expect(screen.getByText("Збалансований план")).toBeInTheDocument();
  });

  it("calls addMealToLog when a meal row Додати button is clicked", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        dayPlan={dayPlanWithMeals}
      />,
    );
    const addButtons = screen.getAllByRole("button", { name: "Додати" });
    fireEvent.click(addButtons[0]!);
    expect(defaultHandlers.addMealToLog).toHaveBeenCalledTimes(1);
  });

  it("calls regenMeal when a meal row Регенерувати button is clicked", () => {
    render(
      <DailyPlanCard
        prefs={EMPTY_PREFS}
        {...defaultHandlers}
        dayPlan={dayPlanWithMeals}
      />,
    );
    const regenButtons = screen.getAllByRole("button", {
      name: "Регенерувати",
    });
    fireEvent.click(regenButtons[0]!);
    expect(defaultHandlers.regenMeal).toHaveBeenCalledTimes(1);
  });
});
