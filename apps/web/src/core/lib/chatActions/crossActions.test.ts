// @vitest-environment jsdom
/**
 * Unit tests for `compare_weeks` handler in crossActions.ts.
 *
 * The handler delegates to `aggregateFinyk/Fizruk/Routine/Nutrition` from
 * `useWeeklyDigest.ts`, which read localStorage. Each test seeds the
 * relevant keys for two weeks and asserts the returned diff string.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Habit } from "@sergeant/routine-domain";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import type { NutritionLog } from "@sergeant/nutrition-domain";
import { handleCrossAction } from "./crossActions";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../../modules/routine/lib/sqliteReader";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../../../modules/fizruk/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../../../modules/nutrition/lib/sqliteReader";
import type { CompareWeeksAction } from "./types";

// 2026-W17 = Mon 2026-04-20 .. Sun 2026-04-26
// 2026-W16 = Mon 2026-04-13 .. Sun 2026-04-19

beforeEach(() => {
  localStorage.clear();
  // Stage 8 tombstone — routine / fizruk / nutrition state is backed by the
  // SQLite warm caches, not the retired `*_v1` LS keys. Reset every cache so
  // each spec starts clean (the empty-state specs rely on it).
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  clearFizrukSqliteCache();
  clearNutritionSqliteCache();
  vi.useFakeTimers();
  // Wednesday inside W17, so getWeekKey() picks W17 by default.
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  clearFizrukSqliteCache();
  clearNutritionSqliteCache();
  vi.useRealTimers();
});

function call(input: CompareWeeksAction["input"]): string {
  const out = handleCrossAction({ name: "compare_weeks", input });
  if (typeof out !== "string") {
    throw new Error("handler did not return a string");
  }
  return out;
}

/**
 * Seed the canonical SQLite-backed routine state (`aggregateRoutine` reads it
 * via `loadRoutineState`). Replaces the pre-tombstone
 * `localStorage.setItem("hub_routine_v1", …)` round-trip — that key is deleted
 * on boot in production, which is the bug this suite now guards against.
 */
function seedRoutine(
  habits: Array<{ id: string; name?: string; archived?: boolean }>,
  completions: Record<string, string[]>,
): void {
  __setRoutineSqliteStateCacheForTests({
    habits: habits as unknown as Habit[],
    habitOrder: habits.map((h) => h.id),
  });
  __setRoutineSqliteCompletionsCacheForTests({ completions });
}

/**
 * Seed the canonical fizruk SQLite cache — `aggregateFizruk` reads
 * `getCachedFizrukSqliteState()` instead of `localStorage["fizruk_workouts_v1"]`.
 * Maps the loose authoring shape onto the domain `Workout` (legacy
 * `exercises[].name` / `sets[].weight` → `items[].nameUk` / `sets[].weightKg`).
 */
function seedFizruk(
  workouts: Array<{
    startedAt: string;
    endedAt?: string | null;
    items?: Array<{
      nameUk?: string;
      sets?: Array<{ weightKg?: number; reps?: number }>;
    }>;
  }>,
): void {
  __setFizrukSqliteCacheForTests({
    workouts: workouts.map((w, wi) => ({
      id: `w${wi}`,
      startedAt: w.startedAt,
      endedAt: w.endedAt ?? null,
      note: "",
      groups: [],
      warmup: null,
      cooldown: null,
      items: (w.items ?? []).map((it, ii) => ({
        id: `w${wi}i${ii}`,
        exerciseId: "",
        nameUk: it.nameUk ?? "",
        primaryGroup: "",
        musclesPrimary: [],
        musclesSecondary: [],
        type: "strength" as const,
        sets: (it.sets ?? []).map((s) => ({
          weightKg: s.weightKg ?? 0,
          reps: s.reps ?? 0,
        })),
      })),
    })) as unknown as Workout[],
  });
}

/** Seed the canonical nutrition SQLite cache (`aggregateNutrition` reads it). */
function seedNutrition(log: unknown): void {
  __setNutritionSqliteCacheForTests({ log: log as NutritionLog });
}

describe("compare_weeks — параметри", () => {
  it("без параметрів використовує поточний vs попередній", () => {
    const out = call({});
    expect(out).toContain("Порівняння тижнів");
    // Both ranges should appear in the header (formatted as 'd MMM').
    // We only assert structural shape — exact locale strings depend on Node
    // ICU build, which differs across CI runners.
    expect(out).toMatch(/Порівняння тижнів: .* vs .*/);
  });

  it("приймає YYYY-Www і конвертує у Monday-key", () => {
    const out = call({ week_a: "2026-W17", week_b: "2026-W16" });
    expect(out).toContain("Порівняння тижнів");
  });

  it("приймає YYYY-MM-DD (snapping до Monday)", () => {
    // 2026-04-22 (Wed) має снапнутись до 2026-W17 Monday.
    const out = call({ week_a: "2026-04-22", week_b: "2026-04-15" });
    expect(out).toContain("Порівняння тижнів");
  });

  it("повертає помилку на некоректний week_a", () => {
    const out = call({ week_a: "not-a-week" });
    expect(out).toContain("Некоректний week_a");
    expect(out).toContain("YYYY-Www");
  });

  it("повертає помилку на некоректний week_b", () => {
    const out = call({ week_a: "2026-W17", week_b: "garbage" });
    expect(out).toContain("Некоректний week_b");
  });

  it("modules=[] — fallback на всі 4", () => {
    const out = call({ week_a: "2026-W17", week_b: "2026-W16", modules: [] });
    expect(out).toContain("Фінік:");
    expect(out).toContain("Фізрук:");
    expect(out).toContain("Рутина:");
    expect(out).toContain("Харчування:");
  });

  it("modules=['finyk'] — інші модулі не показуються", () => {
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["finyk"],
    });
    expect(out).toContain("Фінік:");
    expect(out).not.toContain("Фізрук:");
    expect(out).not.toContain("Рутина:");
    expect(out).not.toContain("Харчування:");
  });

  it("невалідні значення в modules ігноруються", () => {
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: [
        "finyk",
        // @ts-expect-error intentionally unknown module name
        "unknown",
      ],
    });
    expect(out).toContain("Фінік:");
    expect(out).not.toContain("Фізрук:");
  });
});

describe("compare_weeks — Фінік diff", () => {
  it("обчислює різницю витрат за два тижні", () => {
    // Seed Mono cache with manual transactions across both weeks.
    // Amount у minor units (kopiykas), negative = spend.
    const mkTx = (
      id: string,
      isoDate: string,
      grnAmount: number,
      desc: string,
    ) => ({
      id,
      time: Math.floor(new Date(`${isoDate}T12:00:00Z`).getTime() / 1000),
      amount: grnAmount * 100,
      description: desc,
      mcc: 5411,
    });
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({
        txs: [
          mkTx("a1", "2026-04-22", -200, "АТБ"),
          mkTx("a2", "2026-04-23", -300, "Сільпо"),
          mkTx("b1", "2026-04-15", -150, "АТБ"),
        ],
      }),
    );
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["finyk"],
    });
    expect(out).toContain("Фінік:");
    // Витрати W17 = 500, W16 = 150 → діфф +350
    expect(out).toMatch(/Витрати:.*500.*150.*\+350/);
    // Транзакцій W17 = 2, W16 = 1 → діфф +1
    expect(out).toMatch(/Транзакцій:.*2.*1.*\+1/);
  });

  it("працює коли в одному тижні нема даних", () => {
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({
        txs: [
          {
            id: "a1",
            time: Math.floor(new Date("2026-04-22T12:00:00Z").getTime() / 1000),
            amount: -10000,
            description: "АТБ",
            mcc: 5411,
          },
        ],
      }),
    );
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["finyk"],
    });
    expect(out).toContain("Фінік:");
    expect(out).toMatch(/Витрати:.*100.*0/);
  });
});

describe("compare_weeks — Рутина diff", () => {
  it("показує % виконання звичок за обидва тижні", () => {
    seedRoutine([{ id: "h1", name: "Біг" }], {
      h1: [
        // W17 — 4 з 7 днів
        "2026-04-20",
        "2026-04-21",
        "2026-04-23",
        "2026-04-25",
        // W16 — 2 з 7
        "2026-04-13",
        "2026-04-14",
      ],
    });
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["routine"],
    });
    expect(out).toContain("Рутина:");
    // 4/7 ≈ 57%, 2/7 ≈ 29% → дельта +28%
    expect(out).toMatch(/Виконання:.*57%.*29%/);
    expect(out).toContain("Звичок: 1 vs 1");
  });

  it("повертає 'Немає активних звичок' коли немає state", () => {
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["routine"],
    });
    expect(out).toContain("Рутина:");
    expect(out).toContain("Немає активних звичок");
  });
});

describe("compare_weeks — Харчування diff", () => {
  it("обчислює середні калорії за два тижні", () => {
    seedNutrition({
      "2026-04-21": { meals: [{ macros: { kcal: 2000 } }] },
      "2026-04-22": { meals: [{ macros: { kcal: 2200 } }] },
      "2026-04-14": { meals: [{ macros: { kcal: 1800 } }] },
    });
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["nutrition"],
    });
    expect(out).toContain("Харчування:");
    // W17 avg = (2000 + 2200) / 2 = 2100; W16 avg = 1800 → +300
    expect(out).toMatch(/Калорії\/день:.*2100.*1800.*\+300/);
    expect(out).toContain("Днів залоговано: 2 vs 1");
  });

  it("повертає 'Немає логів' коли обидва тижні порожні", () => {
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["nutrition"],
    });
    expect(out).toContain("Харчування:");
    expect(out).toContain("Немає логів їжі");
  });
});

describe("compare_weeks — Фізрук diff", () => {
  it("показує count і об'єм за два тижні", () => {
    seedFizruk([
      {
        startedAt: "2026-04-21T10:00:00Z",
        endedAt: "2026-04-21T11:00:00Z",
        items: [
          {
            nameUk: "Жим",
            sets: [
              { weightKg: 100, reps: 5 },
              { weightKg: 100, reps: 5 },
            ],
          },
        ],
      },
      {
        startedAt: "2026-04-23T10:00:00Z",
        endedAt: "2026-04-23T11:00:00Z",
        items: [{ nameUk: "Присід", sets: [{ weightKg: 80, reps: 8 }] }],
      },
      {
        startedAt: "2026-04-14T10:00:00Z",
        endedAt: "2026-04-14T11:00:00Z",
        items: [{ nameUk: "Жим", sets: [{ weightKg: 100, reps: 5 }] }],
      },
    ]);
    const out = call({
      week_a: "2026-W17",
      week_b: "2026-W16",
      modules: ["fizruk"],
    });
    expect(out).toContain("Фізрук:");
    // W17: 2 workouts; volume = 100*5 + 100*5 + 80*8 = 1640
    // W16: 1 workout; volume = 500
    expect(out).toMatch(/Тренувань:.*2.*1/);
    expect(out).toMatch(/Об'єм:.*1640.*500/);
  });
});
