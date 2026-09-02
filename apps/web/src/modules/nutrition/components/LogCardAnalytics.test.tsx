// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the journal analytics/trends sub-card.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { flatMatch } from "@shared/testing/numberText";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/nutritionStats", () => ({
  getRowsForRange: vi.fn(),
  topMeals: vi.fn(),
  mealTypeBreakdown: vi.fn(),
}));
vi.mock("@sergeant/nutrition-domain", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@sergeant/nutrition-domain")>();
  return { ...actual, calcNutritionPeriodAverages: vi.fn() };
});

import { LogCardAnalytics } from "./LogCardAnalytics";
import {
  getRowsForRange,
  mealTypeBreakdown,
  topMeals,
} from "../lib/nutritionStats";
import { calcNutritionPeriodAverages } from "@sergeant/nutrition-domain";
import type { NutritionLog } from "@sergeant/nutrition-domain";

const log = {} as NutritionLog;
const getRows = getRowsForRange as unknown as ReturnType<typeof vi.fn>;
const avg = calcNutritionPeriodAverages as unknown as ReturnType<typeof vi.fn>;
const top = topMeals as unknown as ReturnType<typeof vi.fn>;
const breakdown = mealTypeBreakdown as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getRows.mockReturnValue([]);
  avg.mockReturnValue({
    avgKcal: 0,
    avgProtein: 0,
    avgFat: 0,
    avgCarbs: 0,
    daysLogged: 0,
  });
  top.mockReturnValue([]);
  breakdown.mockReturnValue({});
});
afterEach(() => vi.clearAllMocks());

describe("LogCardAnalytics", () => {
  // UX-2 (аудит 2026-09-01): без жодного залогованого дня (`daysLogged: 0`
  // з дефолтного `beforeEach`) чотири плитки з нулями і плаский графік
  // замінені на один Tier-2 `<EmptyState>` — див.
  // `docs/05-design/design/empty-states.md`.
  it("renders a single empty state with no dead-zero tiles when nothing is logged", () => {
    render(<LogCardAnalytics log={log} selectedDate="2026-06-20" />);
    expect(screen.getByText("Аналітика (тренди)")).toBeInTheDocument();
    expect(screen.getByText("Ще немає трендів")).toBeInTheDocument();
    // Ні нульових плиток, ні per-секційних "Поки що порожньо" — картка
    // показує ОДИН empty-state замість трьох "нічого немає" підряд.
    expect(screen.queryByText("Середні ккал")).not.toBeInTheDocument();
    expect(screen.queryByText("Поки що порожньо")).not.toBeInTheDocument();
    // Без дубльованого CTA-ґудзика: "+ Додати прийом їжі" вже видно на
    // сторінці `LogCard` нижче за цю картку (docs/05-design/design/empty-states.md
    // § «Не дублюйте action»).
    expect(
      screen.queryByRole("button", { name: /Додати/ }),
    ).not.toBeInTheDocument();
  });

  it("defaults to the 30-day range and refetches when switching to 90", () => {
    render(<LogCardAnalytics log={log} selectedDate="2026-06-20" />);
    // Default range = 30.
    expect(getRows).toHaveBeenCalledWith(log, "2026-06-20", 30);
    fireEvent.click(screen.getByText("90 днів"));
    expect(getRows).toHaveBeenCalledWith(log, "2026-06-20", 90);
    expect(topMeals).toHaveBeenCalledWith(log, "2026-06-20", 90, 8);
  });

  it("renders averages, the kcal sparkline, top meals and meal-type split", () => {
    getRows.mockReturnValue([{ kcal: 1800 }, { kcal: 2200 }]);
    avg.mockReturnValue({
      avgKcal: 2000,
      avgProtein: 100,
      avgFat: 60,
      avgCarbs: 220,
      daysLogged: 2,
    });
    top.mockReturnValue([{ name: "Курка", count: 4, kcal: 500 }]);
    breakdown.mockReturnValue({ lunch: { count: 3, kcal: 1200 } });

    render(<LogCardAnalytics log={log} selectedDate="2026-06-20" />);

    expect(screen.getByText("2000")).toBeInTheDocument(); // avg kcal
    expect(screen.getByText("Курка")).toBeInTheDocument();
    expect(screen.getByText(flatMatch("4× · 500 ккал"))).toBeInTheDocument();
    // meal-type split row for lunch
    expect(screen.getByText(flatMatch("3× · 1 200 ккал"))).toBeInTheDocument();
    // sparkline renders one bar per kcal row (with a title attribute)
    expect(screen.getByTitle("1800 ккал")).toBeInTheDocument();
    expect(screen.getByTitle("2200 ккал")).toBeInTheDocument();
    // empty-states are gone
    expect(screen.queryByText("Поки що порожньо")).not.toBeInTheDocument();
    expect(screen.queryByText("Ще немає трендів")).not.toBeInTheDocument();
  });

  // TXT-8 (аудит 2026-09-01): "Сер. Б/день" / "на N активн. днів" читались
  // як недороблені скорочення поруч із людською датою Рутини. Тайли тепер
  // повторюють повнослівну конвенцію, вже прийняту в модулі
  // (`NutritionDashboard.tsx`, `MacroRings.stories.tsx`: "Білки"/"Жири"/
  // "Вуглеводи" завжди пишуться повністю, ніколи як "Б"/"Ж"/"В").
  it("spells out macro/day labels in full instead of abbreviating them", () => {
    getRows.mockReturnValue([{ kcal: 1800 }]);
    avg.mockReturnValue({
      avgKcal: 1800,
      avgProtein: 90,
      avgFat: 55,
      avgCarbs: 200,
      daysLogged: 1,
    });

    render(<LogCardAnalytics log={log} selectedDate="2026-06-20" />);

    expect(screen.getByText("Середні ккал")).toBeInTheDocument();
    expect(screen.getByText("Середні білки")).toBeInTheDocument();
    expect(screen.getByText("Середні жири")).toBeInTheDocument();
    expect(screen.getByText("Середні вуглеводи")).toBeInTheDocument();
    expect(screen.getAllByText(flatMatch("за 1 активний день")).length).toBe(4);
    expect(screen.queryByText(/Сер\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/активн\./)).not.toBeInTheDocument();
  });
});
