// @vitest-environment jsdom
/**
 * Branch coverage for `aggregateCurrentSnapshot` inside `useCoachInsight`.
 *
 * The sibling `useCoachInsight.test.ts` exercises the hook surface (fetch /
 * cache / refresh / retry) with empty domain snapshots. This file mocks the
 * fizruk / nutrition / routine readers with *populated* data so the three
 * optional snapshot branches — and the finyk `topCategories` sort — all run,
 * then asserts the assembled snapshot is what `coachApi.postInsight`
 * receives. We read the snapshot off the `postInsight` mock rather than
 * exporting internals, keeping the test black-box.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const mockGetMemory = vi.fn<() => Promise<unknown>>();
const mockPostInsight = vi.fn<(arg: unknown) => Promise<unknown>>();

vi.mock("@shared/api", () => ({
  coachApi: {
    getMemory: () => mockGetMemory(),
    postInsight: (arg: unknown) => mockPostInsight(arg),
  },
  isApiError: (err: unknown): boolean =>
    typeof err === "object" && err !== null && "kind" in err,
}));

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: vi.fn(() => null),
  safeWriteLS: vi.fn(),
  safeReadStringLS: vi.fn(() => null),
}));

vi.mock("@shared/lib/api/queryKeys", () => ({
  coachKeys: {
    all: ["coach"],
    insight: (key: string) => ["coach", "insight", key],
  },
}));

// ── Finyk: real aggregate over a couple of categories ────────────────────────
vi.mock("@finyk/lib/lsStats", () => ({
  readFinykStatsContext: () => ({
    txs: [],
    excludedTxIds: new Set<string>(),
    txSplits: {},
    txCategories: {},
    customCategories: [],
  }),
}));

vi.mock("@sergeant/finyk-domain", () => ({
  // More than 5 categories so the `.slice(0, 5)` top-categories cap runs.
  calcFinykPeriodAggregate: () => ({
    totalSpent: 1234,
    totalIncome: 5678,
    txCount: 9,
    byCategory: { a: 10, b: 60, c: 30, d: 50, e: 20, f: 5 },
  }),
}));

// ── Fizruk: one in-week completed workout with volume + recovery ─────────────
const recentIso = new Date(Date.now() - 2 * 3_600_000).toISOString(); // 2h ago
vi.mock("@fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => ({
    refreshedAt: new Date().toISOString(),
    workouts: [
      {
        startedAt: recentIso,
        endedAt: recentIso,
        items: [{ sets: [{ weightKg: 100, reps: 5 }] }],
      },
    ],
  }),
}));

// ── Nutrition: a logged day inside the current week ──────────────────────────
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const todayKey = localDateKey(new Date());

vi.mock("@nutrition/lib/nutritionStorage", () => ({
  loadNutritionLog: () => ({
    [todayKey]: { meals: [{ macros: { kcal: 600, protein_g: 40 } }] },
  }),
  loadNutritionPrefs: () => ({ dailyTargetKcal: 2200 }),
}));

// ── Routine: one active habit completed today ────────────────────────────────
vi.mock("@routine/lib/routineStorage", () => ({
  loadRoutineState: () => ({
    habits: [{ id: "h1", archived: false }],
    completions: { h1: [todayKey] },
  }),
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe("useCoachInsight — aggregateCurrentSnapshot branches", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, retryDelay: 0, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    mockGetMemory.mockResolvedValue({ memory: "mem" });
    mockPostInsight.mockResolvedValue({ insight: "ok" });
  });

  it("assembles finyk + fizruk + nutrition + routine into the posted snapshot", async () => {
    const { useCoachInsight } = await import("./useCoachInsight");
    const { result } = renderHook(() => useCoachInsight(), {
      wrapper: makeWrapper(qc),
    });

    await waitFor(() => expect(result.current.insight).toBe("ok"));

    expect(mockPostInsight).toHaveBeenCalledTimes(1);
    const arg = mockPostInsight.mock.calls[0]![0] as {
      snapshot: {
        finyk: { topCategories: Array<{ name: string; amount: number }> };
        fizruk: {
          workoutsCount: number;
          totalVolume: number;
          recoveryLabel: string;
        } | null;
        nutrition: {
          avgKcal: number;
          avgProtein: number;
          targetKcal: number;
          daysLogged: number;
        } | null;
        routine: { habitCount: number; overallRate: number } | null;
        dateContext: {
          dayOfWeekIso: number;
          weekDayUk: string;
          todayKey: string;
        };
      };
      memory: string | null;
    };
    const snap = arg.snapshot;

    // Finyk: top-5 categories, sorted desc by amount, capped at 5.
    expect(snap.finyk.topCategories).toHaveLength(5);
    expect(snap.finyk.topCategories[0]).toEqual({ name: "b", amount: 60 });
    expect(snap.finyk.topCategories.map((c) => c.amount)).toEqual([
      60, 50, 30, 20, 10,
    ]);

    // Fizruk: 1 in-week workout, volume = 100×5, recent → «Відновлення».
    expect(snap.fizruk).not.toBeNull();
    expect(snap.fizruk!.workoutsCount).toBe(1);
    expect(snap.fizruk!.totalVolume).toBe(500);
    expect(snap.fizruk!.recoveryLabel).toBe("Відновлення");

    // Nutrition: one logged day with averaged macros + prefs target.
    expect(snap.nutrition).not.toBeNull();
    expect(snap.nutrition!.avgKcal).toBe(600);
    expect(snap.nutrition!.avgProtein).toBe(40);
    expect(snap.nutrition!.targetKcal).toBe(2200);
    expect(snap.nutrition!.daysLogged).toBe(1);

    // Routine: 1 habit, completed 1 of 7 possible days → ~14%.
    expect(snap.routine).not.toBeNull();
    expect(snap.routine!.habitCount).toBe(1);
    expect(snap.routine!.overallRate).toBe(Math.round((1 / 7) * 100));

    // Date context built from host-local parts.
    expect(snap.dateContext.todayKey).toBe(todayKey);
    expect(snap.dateContext.dayOfWeekIso).toBeGreaterThanOrEqual(1);
    expect(snap.dateContext.dayOfWeekIso).toBeLessThanOrEqual(7);
    expect(snap.dateContext.weekDayUk.length).toBeGreaterThan(0);

    // Memory threaded through from getMemory.
    expect(arg.memory).toBe("mem");
  });
});
