import {
  aggregateFinyk,
  aggregateFizruk,
  aggregateNutrition,
  aggregateRoutine,
  buildWeeklyDigestPayload,
  getWeekRange,
} from "./weeklyDigestAggregates";

const mockGetCachedFinykSqliteState = jest.fn();
const mockGetCachedFinykMonoMirrorState = jest.fn();
const mockGetCachedFizrukSqliteState = jest.fn();
const mockGetCachedNutritionSqliteState = jest.fn();
const mockGetCachedSqliteRoutineState = jest.fn();
const mockGetCachedSqliteCompletions = jest.fn();

jest.mock("@/modules/finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: () => mockGetCachedFinykSqliteState(),
}));

jest.mock("@/modules/finyk/lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: () => mockGetCachedFinykMonoMirrorState(),
}));

jest.mock("@/modules/fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => mockGetCachedFizrukSqliteState(),
}));

jest.mock("@/modules/nutrition/lib/sqliteReader", () => ({
  getCachedNutritionSqliteState: () => mockGetCachedNutritionSqliteState(),
}));

jest.mock("@/modules/routine/lib/sqliteReader", () => ({
  getCachedSqliteRoutineState: () => mockGetCachedSqliteRoutineState(),
  getCachedSqliteCompletions: () => mockGetCachedSqliteCompletions(),
}));

const WEEK_KEY = "2026-07-20";

function ts(value: string): number {
  return new Date(value).getTime();
}

describe("weekly digest aggregates", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T12:00:00Z"));
    jest.clearAllMocks();
    mockGetCachedFinykMonoMirrorState.mockReturnValue({ transactions: [] });
    mockGetCachedFinykSqliteState.mockReturnValue({
      txCategories: {},
      hiddenTransactions: [],
      customCategories: [],
      monthlyPlan: null,
    });
    mockGetCachedFizrukSqliteState.mockReturnValue({
      refreshedAt: null,
      workouts: [],
    });
    mockGetCachedNutritionSqliteState.mockReturnValue({
      refreshedAt: null,
      log: {},
      prefs: null,
    });
    mockGetCachedSqliteRoutineState.mockReturnValue({
      refreshedAt: null,
      habits: [],
    });
    mockGetCachedSqliteCompletions.mockReturnValue({
      refreshedAt: null,
      completions: {},
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("aggregates visible finyk transactions and monthly budget", () => {
    mockGetCachedFinykMonoMirrorState.mockReturnValue({
      transactions: [
        {
          id: "groceries",
          amount: -12_345,
          time: ts("2026-07-21T10:00:00Z"),
          mcc: 5411,
        },
        {
          id: "salary",
          amount: 500_000,
          time: ts("2026-07-22T10:00:00Z"),
        },
        {
          id: "hidden",
          amount: -20_000,
          time: ts("2026-07-22T10:00:00Z"),
        },
        {
          id: "transfer",
          amount: -30_000,
          time: ts("2026-07-22T10:00:00Z"),
        },
        {
          id: "previous-week",
          amount: -99_999,
          time: ts("2026-07-18T10:00:00Z"),
        },
      ],
    });
    mockGetCachedFinykSqliteState.mockReturnValue({
      txCategories: {
        groceries: "custom-food",
        transfer: "internal_transfer",
      },
      hiddenTransactions: ["hidden"],
      customCategories: [{ id: "custom-food", label: "Продукти" }],
      monthlyPlan: { expense: 12_000 },
    });

    expect(aggregateFinyk(WEEK_KEY)).toEqual({
      totalSpent: 123,
      totalIncome: 5000,
      txCount: 2,
      topCategories: [{ name: "Продукти", amount: 123 }],
      monthlyBudget: 12_000,
    });
  });

  it("aggregates completed fizruk workouts for the selected week", () => {
    mockGetCachedFizrukSqliteState.mockReturnValue({
      refreshedAt: "2026-07-21T12:00:00Z",
      workouts: [
        {
          startedAt: "2026-07-21T06:00:00Z",
          endedAt: "2026-07-21T07:00:00Z",
          items: [
            {
              nameUk: "Присідання",
              sets: [
                { weightKg: 40, reps: 5 },
                { weightKg: 45, reps: 5 },
              ],
            },
          ],
        },
        {
          startedAt: "2026-07-23T06:00:00Z",
          endedAt: "2026-07-23T07:00:00Z",
          items: [
            {
              nameUk: "Жим",
              sets: [{ weightKg: 30, reps: 8 }],
            },
          ],
        },
        {
          startedAt: "2026-07-24T06:00:00Z",
          endedAt: null,
          items: [{ nameUk: "Тяга", sets: [{ weightKg: 70, reps: 3 }] }],
        },
        {
          startedAt: "2026-07-15T06:00:00Z",
          endedAt: "2026-07-15T07:00:00Z",
          items: [{ nameUk: "Минуле", sets: [{ weightKg: 100, reps: 1 }] }],
        },
      ],
    });

    expect(aggregateFizruk(WEEK_KEY)).toEqual({
      workoutsCount: 2,
      totalVolume: 665,
      recoveryLabel: "Відновлення",
      topExercises: [
        { name: "Присідання", totalVolume: 425 },
        { name: "Жим", totalVolume: 240 },
      ],
    });
  });

  it("returns null for cold fizruk cache or empty workout history", () => {
    expect(aggregateFizruk(WEEK_KEY)).toBeNull();

    mockGetCachedFizrukSqliteState.mockReturnValue({
      refreshedAt: "2026-07-21T12:00:00Z",
      workouts: [],
    });

    expect(aggregateFizruk(WEEK_KEY)).toBeNull();
  });

  it("averages nutrition days with logged meals only", () => {
    mockGetCachedNutritionSqliteState.mockReturnValue({
      refreshedAt: "2026-07-21T12:00:00Z",
      prefs: { dailyTargetKcal: 2400 },
      log: {
        "2026-07-20": {
          meals: [
            { macros: { kcal: 800, protein_g: 40, fat_g: 20, carbs_g: 90 } },
            { macros: { kcal: 600, protein_g: 30, fat_g: 15, carbs_g: 70 } },
          ],
        },
        "2026-07-22": {
          meals: [
            { macros: { kcal: 1000, protein_g: 50, fat_g: 25, carbs_g: 100 } },
          ],
        },
        "2026-07-28": {
          meals: [{ macros: { kcal: 500, protein_g: 20 } }],
        },
      },
    });

    expect(aggregateNutrition(WEEK_KEY)).toEqual({
      avgKcal: 1200,
      avgProtein: 60,
      avgFat: 30,
      avgCarbs: 130,
      targetKcal: 2400,
      daysLogged: 2,
    });
  });

  it("returns null for cold or empty nutrition cache", () => {
    expect(aggregateNutrition(WEEK_KEY)).toBeNull();

    mockGetCachedNutritionSqliteState.mockReturnValue({
      refreshedAt: "2026-07-21T12:00:00Z",
      prefs: null,
      log: {},
    });

    expect(aggregateNutrition(WEEK_KEY)).toBeNull();
  });

  it("aggregates routine habit completion for active habits", () => {
    mockGetCachedSqliteRoutineState.mockReturnValue({
      refreshedAt: "2026-07-21T12:00:00Z",
      habits: [
        { id: "water", name: "Вода" },
        { id: "sleep", name: "" },
        { id: "old", name: "Архів", archived: true },
      ],
    });
    mockGetCachedSqliteCompletions.mockReturnValue({
      refreshedAt: "2026-07-21T12:00:00Z",
      completions: {
        water: ["2026-07-20", "2026-07-21", "2026-07-22"],
        sleep: ["2026-07-20"],
        old: ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"],
      },
    });

    expect(aggregateRoutine(WEEK_KEY)).toEqual({
      habitCount: 2,
      overallRate: 29,
      habits: [
        { name: "Вода", done: 3, total: 7, completionRate: 43 },
        { name: "Звичка", done: 1, total: 7, completionRate: 14 },
      ],
    });
  });

  it("returns null for cold or habitless routine cache", () => {
    expect(aggregateRoutine(WEEK_KEY)).toBeNull();

    mockGetCachedSqliteRoutineState.mockReturnValue({
      refreshedAt: "2026-07-21T12:00:00Z",
      habits: [{ id: "old", archived: true }],
    });

    expect(aggregateRoutine(WEEK_KEY)).toBeNull();
  });

  it("builds a full digest payload from all aggregates", () => {
    mockGetCachedFinykMonoMirrorState.mockReturnValue({
      transactions: [
        {
          id: "coffee",
          amount: -5_000,
          time: ts("2026-07-21T10:00:00Z"),
          mcc: "other",
        },
      ],
    });

    const payload = buildWeeklyDigestPayload(WEEK_KEY);

    expect(payload.weekRange).toBe(getWeekRange(new Date("2026-07-20T12:00:00")));
    expect(payload.finyk.totalSpent).toBe(50);
    expect(payload.fizruk).toBeNull();
    expect(payload.nutrition).toBeNull();
    expect(payload.routine).toBeNull();
  });
});
