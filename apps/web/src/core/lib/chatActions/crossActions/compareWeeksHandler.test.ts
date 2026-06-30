import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../insights/useWeeklyDigest", () => ({
  aggregateFinyk: vi.fn(),
  aggregateFizruk: vi.fn(),
  aggregateNutrition: vi.fn(),
  aggregateRoutine: vi.fn(),
  getWeekKey: vi.fn(),
}));
vi.mock("./helpers", () => ({
  weekLabelToMondayKey: vi.fn(),
  previousWeekKey: vi.fn(),
  formatWeekRangeLabel: vi.fn(),
  diffLine: vi.fn(),
}));

import {
  aggregateFinyk,
  aggregateFizruk,
  aggregateNutrition,
  aggregateRoutine,
  getWeekKey,
} from "../../../insights/useWeeklyDigest";
import {
  diffLine,
  formatWeekRangeLabel,
  previousWeekKey,
  weekLabelToMondayKey,
} from "./helpers";
import { compareWeeks } from "./compareWeeksHandler";

const mockWeekLabel = vi.mocked(weekLabelToMondayKey);
const mockPrevWeek = vi.mocked(previousWeekKey);
const mockFormatRange = vi.mocked(formatWeekRangeLabel);
const mockDiffLine = vi.mocked(diffLine);
const mockGetWeekKey = vi.mocked(getWeekKey);
const mockFinyk = vi.mocked(aggregateFinyk);
const mockFizruk = vi.mocked(aggregateFizruk);
const mockRoutine = vi.mocked(aggregateRoutine);
const mockNutrition = vi.mocked(aggregateNutrition);

function defaultMocks() {
  mockWeekLabel.mockReturnValue("2026-04-20");
  mockPrevWeek.mockReturnValue("2026-04-13");
  mockFormatRange.mockImplementation((k: string) => `Range(${k})`);
  mockDiffLine.mockImplementation(
    (label, a, b, unit) =>
      `${label}: ${a}${unit} vs ${b}${unit} (${a - b > 0 ? "+" : ""}${a - b}${unit})`,
  );
  mockGetWeekKey.mockReturnValue("2026-04-20");
  mockFinyk.mockReturnValue({
    totalSpent: 1000,
    totalIncome: 0,
    txCount: 5,
    topCategories: [],
    monthlyBudget: null,
  });
  mockFizruk.mockReturnValue({
    workoutsCount: 3,
    totalVolume: 1500,
    recoveryLabel: "",
    topExercises: [],
  });
  mockRoutine.mockReturnValue({ overallRate: 80, habitCount: 4, habits: [] });
  mockNutrition.mockReturnValue({
    avgKcal: 2000,
    avgProtein: 0,
    avgFat: 0,
    avgCarbs: 0,
    targetKcal: 0,
    daysLogged: 7,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultMocks();
});

describe("compareWeeks", () => {
  it("returns error for invalid week_a label", () => {
    mockWeekLabel.mockReturnValue(null);
    const result = compareWeeks({
      name: "compare_weeks",
      input: { week_a: "bad", modules: ["finyk"] },
    });
    expect(result).toContain("Некоректний week_a");
  });

  it("returns error for invalid week_b label", () => {
    mockWeekLabel.mockReturnValueOnce("2026-04-20");
    mockWeekLabel.mockReturnValueOnce(null);
    const result = compareWeeks({
      name: "compare_weeks",
      input: { week_a: "2026-W17", week_b: "bad", modules: ["finyk"] },
    });
    expect(result).toContain("Некоректний week_b");
  });

  it("returns error when no valid modules provided", () => {
    const result = compareWeeks({
      name: "compare_weeks",
      input: { modules: ["unknown_module" as "finyk"] },
    });
    expect(result).toContain("жодного валідного модуля");
  });

  it("uses all modules by default when modules not specified", () => {
    const result = compareWeeks({ name: "compare_weeks", input: {} });
    expect(result).toContain("Фінік");
    expect(result).toContain("Фізрук");
    expect(result).toContain("Рутина");
    expect(result).toContain("Харчування");
  });

  it("includes only finyk section when modules=[finyk]", () => {
    const result = compareWeeks({
      name: "compare_weeks",
      input: { modules: ["finyk"] },
    });
    expect(result).toContain("Фінік");
    expect(result).not.toContain("Фізрук");
    expect(result).not.toContain("Рутина");
    expect(result).not.toContain("Харчування");
  });

  it("shows 'no workouts' message when fizruk aggregates are both null", () => {
    mockFizruk.mockReturnValue(null);
    const result = compareWeeks({
      name: "compare_weeks",
      input: { modules: ["fizruk"] },
    });
    expect(result).toContain("Немає тренувань");
  });

  it("shows 'no habits' message when routine aggregates are both null", () => {
    mockRoutine.mockReturnValue(null);
    const result = compareWeeks({
      name: "compare_weeks",
      input: { modules: ["routine"] },
    });
    expect(result).toContain("Немає активних звичок");
  });

  it("shows 'no food logs' message when nutrition aggregates are both null", () => {
    mockNutrition.mockReturnValue(null);
    const result = compareWeeks({
      name: "compare_weeks",
      input: { modules: ["nutrition"] },
    });
    expect(result).toContain("Немає логів їжі");
  });

  it("formats header with week range labels", () => {
    mockFormatRange.mockImplementation((k: string) => `Week(${k})`);
    const result = compareWeeks({
      name: "compare_weeks",
      input: { week_a: "2026-W17", modules: ["finyk"] },
    });
    expect(result).toContain("Week(2026-04-20)");
  });

  it("shows top category when finyk returns one", () => {
    mockFinyk.mockReturnValue({
      totalSpent: 2000,
      totalIncome: 0,
      txCount: 8,
      topCategories: [{ name: "Їжа", amount: 800 }],
      monthlyBudget: null,
    });
    mockFinyk.mockReturnValueOnce({
      totalSpent: 2000,
      totalIncome: 0,
      txCount: 8,
      topCategories: [{ name: "Їжа", amount: 800 }],
      monthlyBudget: null,
    });
    mockFinyk.mockReturnValueOnce({
      totalSpent: 1500,
      totalIncome: 0,
      txCount: 5,
      topCategories: [{ name: "Транспорт", amount: 400 }],
      monthlyBudget: null,
    });
    const result = compareWeeks({
      name: "compare_weeks",
      input: { modules: ["finyk"] },
    });
    expect(result).toContain("Топ категорія");
  });

  it("uses previous week for bKey when week_b not specified", () => {
    compareWeeks({
      name: "compare_weeks",
      input: { week_a: "2026-W17", modules: ["finyk"] },
    });
    expect(mockPrevWeek).toHaveBeenCalledWith("2026-04-20");
  });
});
