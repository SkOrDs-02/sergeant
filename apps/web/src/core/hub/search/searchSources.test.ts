/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import type { Habit } from "@sergeant/routine-domain";
import {
  __setRoutineSqliteStateCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "@routine/lib/sqliteReader";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@fizruk/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "@nutrition/lib/sqliteReader";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "@finyk/lib/monoMirrorReader";
import { performSearch } from "./searchSources";
import type { Hit } from "./searchTypes";

// Each test seeds a *distinct* localStorage payload before calling
// `performSearch`. Both the module-level `parseCache` and the `scoreLru`
// (searchCache.ts) key on a snapshot built from the raw stored strings, so
// different fixture content always produces a fresh snapshot → no cross-test
// cache bleed even though those caches persist for the module's lifetime.
beforeEach(() => {
  localStorage.clear();
  // Routine / Fizruk / Nutrition are SQLite-cache-backed now — reset the warm
  // caches so seeded fixtures never leak across specs.
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  clearFizrukSqliteCache();
  clearNutritionSqliteCache();
  clearFinykMonoMirrorCache();
});

function finykHit(results: Hit[]): Hit | undefined {
  return results.find((r) => r.module === "finyk" && r.id.startsWith("finyk_"));
}

// Tombstoned keys (hub_routine_v1 / nutrition_log_v1 / fizruk_*_v1) are read
// from the SQLite warm caches — seed those directly instead of localStorage.
function seedRoutine(
  habits: Array<{ id: string; name?: string; emoji?: string }>,
): void {
  __setRoutineSqliteStateCacheForTests({
    habits: habits as unknown as Habit[],
    habitOrder: habits.map((h) => h.id),
  });
}
function seedNutrition(log: unknown): void {
  __setNutritionSqliteCacheForTests({ log } as unknown as Parameters<
    typeof __setNutritionSqliteCacheForTests
  >[0]);
}
function seedFizruk(partial: {
  workouts?: unknown[];
  customExercises?: unknown[];
}): void {
  __setFizrukSqliteCacheForTests(
    partial as unknown as Parameters<typeof __setFizrukSqliteCacheForTests>[0],
  );
}

describe("searchSources.performSearch (audit 03 F22 — scoring)", () => {
  it("returns only the quick-add Actions for an empty query (launcher landing)", () => {
    const results = performSearch("");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.module === "actions")).toBe(true);
  });

  it("matches a Finyk transaction by description token", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        {
          id: "tx-coffee",
          amount: -4500,
          time: 1_700_000_000_000,
          description: "Кава на районі",
        },
        {
          id: "tx-rent",
          amount: -1_200_000,
          time: 1_700_000_100_000,
          description: "Оренда квартири",
        },
      ] as never[],
    });
    const results = performSearch("кава");
    const hit = finykHit(results);
    expect(hit).toBeDefined();
    expect(hit!.title).toBe("Кава на районі");
    // The non-matching transaction must be filtered out (score < 0).
    expect(results.some((r) => r.title === "Оренда квартири")).toBe(false);
  });

  it("scores a title-prefix match above a subtitle-only match", () => {
    localStorage.setItem(
      "finyk_subs",
      JSON.stringify([
        // "netflix" appears in the title → prefix/title bonus.
        { id: "sub-a", name: "Netflix", amount: 25_900 },
        // "netflix" appears only as a free word inside another title, so the
        // higher-scoring one must sort first.
        { id: "sub-b", name: "Подарунок netflix другу", amount: 50_000 },
      ]),
    );
    const results = performSearch("netflix");
    const subs = results.filter((r) => r.id.startsWith("finyk_sub_"));
    expect(subs).toHaveLength(2);
    expect(subs[0]!.title).toBe("Netflix");
    expect(subs[0]!._score).toBeGreaterThan(subs[1]!._score);
  });

  it("matches a Routine habit by name and skips non-matches", () => {
    seedRoutine([
      { id: "h1", name: "Медитація", emoji: "🧘" },
      { id: "h2", name: "Пробіжка", emoji: "🏃" },
    ]);
    const results = performSearch("медитація");
    const habit = results.find((r) => r.module === "routine");
    expect(habit).toBeDefined();
    expect(habit!.title).toContain("Медитація");
    expect(results.some((r) => r.title.includes("Пробіжка"))).toBe(false);
  });

  it("matches a Nutrition meal by name", () => {
    seedNutrition({
      "2026-06-14": {
        meals: [
          { id: "m1", name: "Овочевий салат", macros: { kcal: 220 } },
          { id: "m2", name: "Стейк", macros: { kcal: 600 } },
        ],
      },
    });
    const results = performSearch("салат");
    const meal = results.find((r) => r.module === "nutrition");
    expect(meal).toBeDefined();
    expect(meal!.title).toBe("Овочевий салат");
  });

  it("matches a Fizruk workout by exercise name (canonical SQLite cache)", () => {
    seedFizruk({
      workouts: [
        {
          id: "w1",
          startedAt: "2026-06-14T10:00:00.000Z",
          endedAt: "2026-06-14T11:00:00.000Z",
          items: [{ nameUk: "Жим лежачи" }],
          note: "",
        },
      ],
    });
    const results = performSearch("жим лежачи");
    const hit = results.find(
      (r) => r.module === "fizruk" && r.id.startsWith("fizruk_w_"),
    );
    expect(hit).toBeDefined();
    expect(hit!.title).toContain("Жим лежачи");
  });

  it("matches a Fizruk custom exercise by name (canonical SQLite cache)", () => {
    seedFizruk({
      customExercises: [
        {
          id: "ce1",
          name: { uk: "Жим Арнольда", en: "Arnold press" },
          primaryGroup: "shoulders",
          primaryGroupUk: "Плечі",
        },
      ],
    });
    const results = performSearch("арнольда");
    const hit = results.find(
      (r) => r.module === "fizruk" && r.id.startsWith("fizruk_ex_"),
    );
    expect(hit).toBeDefined();
    expect(hit!.title).toBe("Жим Арнольда");
  });

  it("always appends an ai-handoff fallback hit for a non-empty query", () => {
    // Empty storage → no structured module hits, but the launcher must still
    // offer the "ask the assistant" escape hatch.
    const results = performSearch("щось геть невідоме 12345");
    const ai = results.find((r) => r.target.kind === "ai-handoff");
    expect(ai).toBeDefined();
    if (ai && ai.target.kind === "ai-handoff") {
      expect(ai.target.query).toBe("щось геть невідоме 12345");
    }
  });

  it("returns the same cached result set for a repeated query (LRU hit)", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        {
          id: "tx-lru",
          amount: -1000,
          time: 1_700_000_200_000,
          description: "Унікальний кеш-маркер",
        },
      ] as never[],
    });
    const first = performSearch("маркер");
    const second = performSearch("маркер");
    // Same snapshot + query → identical array instance from the LRU.
    expect(second).toBe(first);
  });
});
