import { aggregateCurrentSnapshot } from "./coachSnapshot";

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

function ts(value: string): number {
  return new Date(value).getTime();
}

describe("aggregateCurrentSnapshot", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-23T12:00:00Z"));
    jest.clearAllMocks();
    mockGetCachedFinykMonoMirrorState.mockReturnValue({ transactions: [] });
    mockGetCachedFinykSqliteState.mockReturnValue({
      txCategories: {},
      hiddenTransactions: [],
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

  it("summarizes warmed module caches for the current week", () => {
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
        groceries: "food",
        transfer: "internal_transfer",
      },
      hiddenTransactions: ["hidden"],
    });
    mockGetCachedFizrukSqliteState.mockReturnValue({
      refreshedAt: "2026-07-23T12:00:00Z",
      workouts: [
        {
          startedAt: "2026-07-23T08:00:00Z",
          endedAt: "2026-07-23T09:00:00Z",
          items: [
            {
              sets: [
                { weightKg: 50, reps: 5 },
                { weightKg: 60, reps: 5 },
              ],
            },
          ],
        },
        {
          startedAt: "2026-07-15T08:00:00Z",
          endedAt: "2026-07-15T09:00:00Z",
          items: [{ sets: [{ weightKg: 100, reps: 1 }] }],
        },
        {
          startedAt: "2026-07-24T08:00:00Z",
          endedAt: null,
          items: [{ sets: [{ weightKg: 70, reps: 3 }] }],
        },
      ],
    });
    mockGetCachedNutritionSqliteState.mockReturnValue({
      refreshedAt: "2026-07-23T12:00:00Z",
      prefs: { dailyTargetKcal: 2300 },
      log: {
        "2026-07-21": {
          meals: [
            { macros: { kcal: 800, protein_g: 40 } },
            { macros: { kcal: 600, protein_g: 20 } },
          ],
        },
        "2026-07-22": {
          meals: [{ macros: { kcal: 1000, protein_g: 50 } }],
        },
      },
    });
    mockGetCachedSqliteRoutineState.mockReturnValue({
      refreshedAt: "2026-07-23T12:00:00Z",
      habits: [
        { id: "water" },
        { id: "sleep" },
        { id: "archived", archived: true },
      ],
    });
    mockGetCachedSqliteCompletions.mockReturnValue({
      refreshedAt: "2026-07-23T12:00:00Z",
      completions: {
        water: ["2026-07-20", "2026-07-21", "2026-07-22"],
        sleep: ["2026-07-20"],
        archived: ["2026-07-20", "2026-07-21"],
      },
    });

    expect(aggregateCurrentSnapshot()).toEqual({
      finyk: {
        totalSpent: 123,
        totalIncome: 5000,
        txCount: 2,
        topCategories: [{ name: "food", amount: 123 }],
      },
      fizruk: {
        workoutsCount: 1,
        totalVolume: 550,
        recoveryLabel: "Відновлення",
      },
      nutrition: {
        avgKcal: 1200,
        avgProtein: 55,
        targetKcal: 2300,
        daysLogged: 2,
      },
      routine: {
        habitCount: 2,
        overallRate: 29,
      },
    });
  });

  it("keeps optional module snapshots null for cold caches", () => {
    expect(aggregateCurrentSnapshot()).toEqual({
      finyk: {
        totalSpent: 0,
        totalIncome: 0,
        txCount: 0,
        topCategories: [],
      },
      fizruk: null,
      nutrition: null,
      routine: null,
    });
  });

  it("treats optional reader failures as non-fatal", () => {
    mockGetCachedFizrukSqliteState.mockImplementation(() => {
      throw new Error("fizruk cache unavailable");
    });
    mockGetCachedNutritionSqliteState.mockImplementation(() => {
      throw new Error("nutrition cache unavailable");
    });
    mockGetCachedSqliteRoutineState.mockImplementation(() => {
      throw new Error("routine cache unavailable");
    });

    expect(aggregateCurrentSnapshot()).toEqual({
      finyk: {
        totalSpent: 0,
        totalIncome: 0,
        txCount: 0,
        topCategories: [],
      },
      fizruk: null,
      nutrition: null,
      routine: null,
    });
  });
});
