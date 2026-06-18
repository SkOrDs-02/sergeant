// @vitest-environment jsdom
/**
 * Focused unit-тести для `useWeeklyDigest` і допоміжних агрегаторів.
 *
 * Стратегія:
 * - Чисті функції (`aggregateFizruk`, `aggregateNutrition`, `aggregateRoutine`,
 *   `getWeekRange`, `getWeekKey`, `loadDigest`) — тестуємо з реальними вхідними
 *   даними, без моків.
 * - `useWeeklyDigest` hook — тестуємо через реальний QueryClient; мокаємо лише
 *   API transport і storage.
 * - Перевіряємо: generate → API → onSuccess → LS-write + QC setQueryData;
 *   помилка API → поле `error`; isCurrentWeek → generate доступний.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import type { Habit } from "@sergeant/routine-domain";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../modules/routine/lib/sqliteReader";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGenerateDigest = vi.fn<() => Promise<unknown>>();

vi.mock("@shared/api", () => ({
  coachApi: {
    postMemory: vi.fn().mockResolvedValue({}),
  },
  weeklyDigestApi: {
    generate: (...args: unknown[]) => mockGenerateDigest(...(args as [])),
  },
  isApiError: (err: unknown): boolean =>
    typeof err === "object" && err !== null && "kind" in err,
}));

const mockSafeReadLS = vi.fn<(key: string, fallback?: unknown) => unknown>();
const mockSafeWriteLS = vi.fn<(key: string, value: unknown) => void>();
const mockSafeListLSKeys = vi.fn<() => string[]>(() => []);

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: (...args: unknown[]) =>
    mockSafeReadLS(...(args as [string, unknown?])),
  safeWriteLS: (...args: unknown[]) =>
    mockSafeWriteLS(...(args as [string, unknown])),
  safeListLSKeys: () => mockSafeListLSKeys(),
  safeReadStringLS: vi.fn(() => null),
}));

vi.mock("@finyk/lib/lsStats", () => ({
  readFinykStatsContext: () => ({
    txs: [],
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
  }),
}));

vi.mock("@finyk/lib/sqliteReader", () => ({
  getCachedFinykSqliteState: () => ({ monthlyPlan: null }),
}));

vi.mock("@sergeant/finyk-domain", () => ({
  calcFinykPeriodAggregate: () => ({
    totalSpent: 0,
    totalIncome: 0,
    txCount: 0,
    byCategory: {},
  }),
}));

vi.mock("@sergeant/shared", () => ({
  STORAGE_KEYS: { WEEKLY_DIGEST_PREFIX: "hub_weekly_digest_v1_" },
  getWeekKey: () => "2025-04-07",
}));

vi.mock("@shared/lib/storage/weeklyDigestStorage", () => ({
  loadDigest: vi.fn((weekKey: string) => {
    if (weekKey === "2025-04-07") {
      return {
        weekKey: "2025-04-07",
        generatedAt: "t1",
        weekRange: "7-13 Apr",
      };
    }
    return null;
  }),
}));

vi.mock("@shared/lib/api/queryKeys", () => ({
  coachKeys: {
    all: ["coach"],
  },
  digestKeys: {
    byWeek: (wk: string) => ["digest", "week", wk],
    history: ["digest", "history"],
  },
}));

vi.mock("@finyk/constants", () => ({
  MCC_CATEGORIES: [],
  INCOME_CATEGORIES: [],
}));

vi.mock("@shared/lib", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@shared/lib/api/apiErrorFormat", () => ({
  formatApiError: (err: unknown, options?: { fallback?: string }) => {
    if (err instanceof Error) return err.message;
    return options?.fallback ?? "Помилка";
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Seed the canonical SQLite-backed routine state — the source `aggregateRoutine`
 * now reads via `loadRoutineState()`. Replaces the pre-tombstone
 * `safeReadLS("hub_routine_v1", …)` mock: that key is deleted on boot in
 * production, which is the regression this suite guards against. `habitOrder`
 * tracks the seeded ids so `loadRoutineState()`'s `ensureHabitOrder` pass does
 * not need to renormalize.
 */
function seedRoutine(
  habits: Array<{
    id: string;
    name?: string;
    emoji?: string;
    archived?: boolean;
    paused?: boolean;
  }>,
  completions: Record<string, string[]>,
): void {
  __setRoutineSqliteStateCacheForTests({
    habits: habits as unknown as Habit[],
    habitOrder: habits.map((h) => h.id),
  });
  __setRoutineSqliteCompletionsCacheForTests({ completions });
}

// ── Pure helper tests — no mocks needed ───────────────────────────────────────

describe("aggregateFizruk", () => {
  // These tests import the function after mocks are set up
  it("returns null when there are no workouts in LS", async () => {
    mockSafeReadLS.mockReturnValue(null);
    const { aggregateFizruk } = await import("./useWeeklyDigest");
    expect(aggregateFizruk("2025-04-07")).toBeNull();
  });

  it("counts only workouts in the target week (endedAt required)", async () => {
    mockSafeReadLS.mockImplementation((key: string) => {
      if (key === "fizruk_workouts_v1") {
        return [
          // у тижні 2025-04-07..2025-04-13
          {
            startedAt: "2025-04-08T10:00:00",
            endedAt: "2025-04-08T11:00:00",
            exercises: [{ name: "Bench", sets: [{ weight: 80, reps: 5 }] }],
          },
          // без endedAt — in-progress, не рахується
          { startedAt: "2025-04-09T07:00:00", endedAt: null },
          // поза тижнем
          {
            startedAt: "2025-04-01T10:00:00",
            endedAt: "2025-04-01T11:00:00",
            exercises: [],
          },
        ];
      }
      return null;
    });

    const { aggregateFizruk } = await import("./useWeeklyDigest");
    const result = aggregateFizruk("2025-04-07");

    expect(result).not.toBeNull();
    expect(result!.workoutsCount).toBe(1);
    expect(result!.totalVolume).toBe(400); // 80kg × 5 reps
    expect(result!.topExercises).toEqual([{ name: "Bench", totalVolume: 400 }]);
  });

  it("handles wrapped fizruk shape `{ workouts: […] }`", async () => {
    mockSafeReadLS.mockImplementation((key: string) => {
      if (key === "fizruk_workouts_v1") {
        return {
          workouts: [
            {
              startedAt: "2025-04-10T10:00:00",
              endedAt: "2025-04-10T11:00:00",
              exercises: [],
            },
          ],
        };
      }
      return null;
    });

    const { aggregateFizruk } = await import("./useWeeklyDigest");
    const result = aggregateFizruk("2025-04-07");

    expect(result).not.toBeNull();
    expect(result!.workoutsCount).toBe(1);
  });
});

describe("aggregateNutrition", () => {
  it("returns null when no meals logged in the week", async () => {
    mockSafeReadLS.mockReturnValue({});
    const { aggregateNutrition } = await import("./useWeeklyDigest");
    expect(aggregateNutrition("2025-04-07")).toBeNull();
  });

  it("averages macros over days with data (not over all 7 days)", async () => {
    const log = {
      "2025-04-07": {
        meals: [
          { macros: { kcal: 600, protein_g: 30, fat_g: 20, carbs_g: 80 } },
          { macros: { kcal: 400, protein_g: 20, fat_g: 10, carbs_g: 60 } },
        ],
      },
      "2025-04-09": {
        meals: [
          { macros: { kcal: 1500, protein_g: 60, fat_g: 40, carbs_g: 200 } },
        ],
      },
      // дні без даних не потрапляють у знаменник
    };
    mockSafeReadLS.mockImplementation((key: string) => {
      if (key === "nutrition_log_v1") return log;
      if (key === "nutrition_prefs_v1") return { dailyTargetKcal: 2000 };
      return null;
    });

    const { aggregateNutrition } = await import("./useWeeklyDigest");
    const result = aggregateNutrition("2025-04-07");

    expect(result).not.toBeNull();
    expect(result!.daysLogged).toBe(2);
    expect(result!.avgKcal).toBe(Math.round((1000 + 1500) / 2)); // 1250
    expect(result!.targetKcal).toBe(2000);
  });
});

describe("aggregateRoutine", () => {
  beforeEach(() => {
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
  });
  afterEach(() => {
    clearSqliteRoutineStateCache();
    clearSqliteCompletionsCache();
  });

  it("returns null when there is no routine state in the cache", async () => {
    // Caches cleared above → loadRoutineState() yields defaultRoutineState()
    // (no habits) — the same empty-journal signal the digest treats as null.
    const { aggregateRoutine } = await import("./useWeeklyDigest");
    expect(aggregateRoutine("2025-04-07")).toBeNull();
  });

  it("returns null when all habits are archived", async () => {
    seedRoutine([{ id: "h1", name: "Стара звичка", archived: true }], {});
    const { aggregateRoutine } = await import("./useWeeklyDigest");
    expect(aggregateRoutine("2025-04-07")).toBeNull();
  });

  it("calculates per-habit and overall completion rates correctly", async () => {
    seedRoutine(
      [
        { id: "h1", name: "Медитація" },
        { id: "h2", name: "Спорт", archived: false },
      ],
      {
        h1: [
          "2025-04-07",
          "2025-04-08",
          "2025-04-09",
          "2025-04-10",
          "2025-04-11",
          "2025-04-12",
          "2025-04-13",
        ],
        h2: ["2025-04-07", "2025-04-08", "2025-04-09"], // 3 з 7
      },
    );

    const { aggregateRoutine } = await import("./useWeeklyDigest");
    const result = aggregateRoutine("2025-04-07");

    expect(result).not.toBeNull();
    expect(result!.habitCount).toBe(2);

    const h1 = result!.habits.find((h) => h.name === "Медитація");
    expect(h1).toBeDefined();
    expect(h1!.done).toBe(7);
    expect(h1!.completionRate).toBe(100);

    const h2 = result!.habits.find((h) => h.name === "Спорт");
    expect(h2).toBeDefined();
    expect(h2!.done).toBe(3);
    expect(h2!.completionRate).toBe(43); // round(3/7*100)

    // Overall: (7 + 3) / 14 = 71%
    expect(result!.overallRate).toBe(71);
  });
});

describe("getWeekRange", () => {
  it("formats Ukrainian range Пн–Нд", async () => {
    const { getWeekRange } = await import("./useWeeklyDigest");
    // 2025-04-07 — понеділок
    const range = getWeekRange(new Date("2025-04-09T12:00:00")); // середа
    // Повинен містити Apr-дати
    expect(range).toMatch(/7/); // 7 квітня
    expect(range).toMatch(/13/); // 13 квітня
  });
});

// ── useWeeklyDigest hook tests ─────────────────────────────────────────────────

describe("useWeeklyDigest hook", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    qc = makeQueryClient();
    mockSafeReadLS.mockReturnValue(null);
    mockSafeListLSKeys.mockReturnValue([]);
  });

  afterEach(() => {
    qc.clear();
  });

  it("exposes digest from initialData (LS-stored digest)", async () => {
    const { useWeeklyDigest } = await import("./useWeeklyDigest");

    const { result } = renderHook(() => useWeeklyDigest("2025-04-07"), {
      wrapper: makeWrapper(qc),
    });

    // loadDigest mock returns { weekKey: "2025-04-07", ... } for this weekKey
    await waitFor(() => {
      expect(result.current.digest).not.toBeNull();
    });

    expect(result.current.digest!.weekKey).toBe("2025-04-07");
    expect(result.current.error).toBeNull();
  });

  it("generate() calls weeklyDigestApi.generate and writes to LS on success", async () => {
    const mockReport = {
      summary: "Великий тиждень!",
      highlights: [],
    };
    mockGenerateDigest.mockResolvedValue({
      report: mockReport,
      generatedAt: "2025-04-14T00:00:00Z",
    });

    const { useWeeklyDigest } = await import("./useWeeklyDigest");

    // isCurrentWeek: the hook compares weekKey to getWeekKey() — our mock
    // returns "2025-04-07", so we use that same key to get isCurrentWeek=true
    const { result } = renderHook(() => useWeeklyDigest("2025-04-07"), {
      wrapper: makeWrapper(qc),
    });

    await result.current.generate();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSafeWriteLS).toHaveBeenCalledWith(
      "hub_weekly_digest_v1_2025-04-07",
      expect.objectContaining({ generatedAt: "2025-04-14T00:00:00Z" }),
    );
  });

  it("error field is populated when generate() API fails", async () => {
    mockGenerateDigest.mockRejectedValue(new Error("server unavailable"));

    const { useWeeklyDigest } = await import("./useWeeklyDigest");

    const { result } = renderHook(() => useWeeklyDigest("2025-04-07"), {
      wrapper: makeWrapper(qc),
    });

    await result.current.generate();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(mockSafeWriteLS).not.toHaveBeenCalledWith(
      "hub_weekly_digest_v1_2025-04-07",
      expect.anything(),
    );
  });

  it("isCurrentWeek is true when weekKey matches getWeekKey()", async () => {
    const { useWeeklyDigest } = await import("./useWeeklyDigest");

    const { result } = renderHook(
      // "2025-04-07" matches our mock getWeekKey() = "2025-04-07"
      () => useWeeklyDigest("2025-04-07"),
      { wrapper: makeWrapper(qc) },
    );

    expect(result.current.isCurrentWeek).toBe(true);
  });

  it("isCurrentWeek is false for a past weekKey", async () => {
    const { useWeeklyDigest } = await import("./useWeeklyDigest");

    const { result } = renderHook(
      () => useWeeklyDigest("2024-01-01"), // past week
      { wrapper: makeWrapper(qc) },
    );

    expect(result.current.isCurrentWeek).toBe(false);
  });
});
