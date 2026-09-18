// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { morningBriefing, weeklySummary } from "./briefingHandlers";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../../../modules/routine/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../../../modules/nutrition/lib/sqliteReader";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../../../modules/fizruk/lib/sqliteReader";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../../../modules/finyk/lib/monoMirrorReader";

const SYS = new Date("2026-06-15T12:00:00");

function localDayKey(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function clearAll() {
  localStorage.clear();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  clearNutritionSqliteCache();
  clearFizrukSqliteCache();
  clearFinykMonoMirrorCache();
}

beforeEach(() => {
  clearAll();
  vi.useFakeTimers();
  vi.setSystemTime(SYS);
});
afterEach(() => {
  clearAll();
  vi.useRealTimers();
});

describe("morningBriefing — habit branch", () => {
  it("reports habit completion counts from routine cache", () => {
    const todayKey = localDayKey(SYS);
    __setRoutineSqliteStateCacheForTests({
      habits: [
        { id: "h1", name: "Біг", archived: false },
        { id: "h2", name: "Вода", archived: false },
        { id: "h3", name: "Старе", archived: true },
      ] as never,
    });
    __setRoutineSqliteCompletionsCacheForTests({
      completions: { h1: [todayKey] },
    });
    const out = morningBriefing();
    // archived habit excluded → 2 active, 1 done
    expect(out).toContain("Звички: 1/2 виконано");
  });
});

describe("weeklySummary — habit + spending branches", () => {
  it("reports weekly habit percentage and finyk spending", () => {
    const todayKey = localDayKey(SYS);
    __setRoutineSqliteStateCacheForTests({
      habits: [{ id: "h1", name: "Біг", archived: false }] as never,
    });
    __setRoutineSqliteCompletionsCacheForTests({
      completions: { h1: [todayKey] },
    });
    // finyk_tx_cache is tombstoned (Phase 3) — seed the canonical mirror cache.
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        {
          id: "t1",
          amount: -50000,
          time: Math.floor(SYS.getTime() / 1000) - 3600,
        } as never,
        {
          id: "t2",
          amount: 100000,
          time: Math.floor(SYS.getTime() / 1000) - 3600,
        } as never,
      ],
    });
    const out = weeklySummary();
    expect(out).toContain("Звички:");
    expect(out).toMatch(/Звички: \d+% \(\d+\/\d+\)/);
    expect(out).toContain("Витрати:");
  });

  it("aggregates weekly calories across days", () => {
    const todayKey = localDayKey(SYS);
    const y = new Date(SYS);
    y.setDate(y.getDate() - 2);
    __setNutritionSqliteCacheForTests({
      log: {
        [todayKey]: { meals: [{ macros: { kcal: 2000 } }] },
        [localDayKey(y)]: { meals: [{ macros: { kcal: 1800 } }] },
      } as never,
    });
    const out = weeklySummary();
    expect(out).toMatch(/Калорії: ~\d+ ккал\/день \(2 днів\)/);
  });
});
