// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Habit } from "@sergeant/routine-domain";
import type { Workout as FizrukWorkout } from "@sergeant/fizruk-domain";

// `fizruk_workouts_v1` is tombstoned — `workoutsByDay` reads via
// `readFizrukWorkouts` (SQLite cache). Fake it in-memory for the workout seed.
const mem = vi.hoisted(() => ({ workouts: [] as unknown[] }));
vi.mock("./fizrukActions/shared", async (orig) => {
  const actual = await orig<typeof import("./fizrukActions/shared")>();
  return {
    ...actual,
    readFizrukWorkouts: vi.fn(() => mem.workouts as FizrukWorkout[]),
  };
});

import { handleQueryRoutineAction } from "./queryRoutineActions";
import {
  __setRoutineSqliteStateCacheForTests,
  __setRoutineSqliteCompletionsCacheForTests,
  clearSqliteRoutineStateCache,
  clearSqliteCompletionsCache,
} from "../../../modules/routine/lib/sqliteReader";
import { __setFinykSqliteStateCacheForTests } from "../../../modules/finyk/lib/sqliteReader";
import type { ChatAction } from "./types";

beforeEach(() => {
  // Stage 8 PR #057r-tombstone — routine state is backed by the SQLite warm
  // cache, not the retired `hub_routine_v1` LS key. Reset both caches so each
  // spec starts clean.
  localStorage.clear();
  mem.workouts = [];
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  vi.useFakeTimers();
  // 2026-04-22 is a Wednesday (Kyiv).
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  __setFinykSqliteStateCacheForTests({});
  clearSqliteRoutineStateCache();
  clearSqliteCompletionsCache();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleQueryRoutineAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

/**
 * Seed the canonical SQLite-backed routine state (the source `readRoutine`
 * now reads via `loadRoutineState`). Replaces the pre-tombstone
 * `localStorage.setItem("hub_routine_v1", …)` round-trip — that key is deleted
 * on boot in production, which is the bug this suite now guards against.
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

// ---------------------------------------------------------------------------
// query_habits
// ---------------------------------------------------------------------------
describe("query_habits", () => {
  it("happy: completion rate + best/worst weekday for one habit", () => {
    // Mark 2026-04-22 (Wed), 2026-04-20 (Mon), 2026-04-15 (Wed).
    seedRoutine([{ id: "h1", name: "Медитація", emoji: "🧘" }], {
      h1: ["2026-04-22", "2026-04-20", "2026-04-15"],
    });
    const out = call({
      name: "query_habits",
      input: { habit: "медитація", period_days: 30 },
    });
    expect(out).toContain("Медитація");
    expect(out).toContain("Виконано: 3/30");
    expect(out).toMatch(/Найкращий день/);
  });

  it("happy: resolves habit by id", () => {
    seedRoutine([{ id: "h_water", name: "Вода" }], {
      h_water: ["2026-04-22"],
    });
    const out = call({
      name: "query_habits",
      input: { habit: "h_water" },
    });
    expect(out).toContain("Вода");
    expect(out).toContain("Виконано: 1/30");
  });

  it("happy: aggregates all active habits when no filter", () => {
    seedRoutine(
      [
        { id: "h1", name: "Вода" },
        { id: "h2", name: "Біг" },
        { id: "h3", name: "Старе", archived: true },
      ],
      { h1: ["2026-04-22"], h2: ["2026-04-21"] },
    );
    const out = call({ name: "query_habits", input: {} });
    expect(out).toContain("2 активних звичок");
  });

  it("error: empty journal", () => {
    const out = call({ name: "query_habits", input: { habit: "вода" } });
    expect(out).toContain("Немає звичок");
  });

  it("error: unknown habit", () => {
    seedRoutine([{ id: "h1", name: "Вода" }], {});
    const out = call({
      name: "query_habits",
      input: { habit: "плавання" },
    });
    expect(out).toContain("не знайдено");
  });

  it("shape: result is a non-empty string", () => {
    seedRoutine([{ id: "h1", name: "Вода" }], { h1: ["2026-04-22"] });
    const out = call({
      name: "query_habits",
      input: { period_days: 365 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// habit_correlation
// ---------------------------------------------------------------------------
describe("habit_correlation", () => {
  function seedWorkouts(
    items: Array<{ startedAt: string; ended: boolean }>,
  ): void {
    mem.workouts = items.map((w, i) => ({
      id: `w${i}`,
      startedAt: w.startedAt,
      endedAt: w.ended ? w.startedAt : null,
      items: [],
    }));
  }

  it("happy: correlates habit with spending (with vs without days)", () => {
    seedRoutine([{ id: "h1", name: "Біг" }], {
      h1: ["2026-04-22", "2026-04-21"],
    });
    // Витрати сідаємо ручними записами через канонічний SQLite-кеш Фініка.
    // До 2026-08-24 тут стояв `localStorage["finyk_tx_cache"]` — ключ,
    // виведений з експлуатації разом із переїздом дзеркала в SQLite. Тест
    // проходив на НУЛЯХ: він перевіряв лише підписи («Витрати», «Дні зі
    // звичкою»), а не числа, тож не помітив, що всесвіт витрат порожній.
    // Саме ця сліпа пляма пропустила F-11 у прод.
    __setFinykSqliteStateCacheForTests({
      manualExpenses: [
        // день зі звичкою — 100 грн
        {
          id: "m1",
          date: "2026-04-22T12:00:00.000Z",
          amount: 100,
          category: "cafe",
          kind: "expense",
        },
        // день без звички — 500 грн
        {
          id: "m2",
          date: "2026-04-20T12:00:00.000Z",
          amount: 500,
          category: "cafe",
          kind: "expense",
        },
      ],
    } as never);
    const out = call({
      name: "habit_correlation",
      input: { habit: "біг", against: "spending", period_days: 7 },
    });
    expect(out).toContain("Витрати");
    expect(out).toContain("Дні зі звичкою");
    expect(out).toContain("Дні без неї");
    // Числа, а не лише підписи: без цього тест знову осліпне.
    expect(out).toMatch(/Дні зі звичкою \(\d+\): (?!0 )/);
    expect(out).toContain("Різниця:");
  });

  it("happy: correlates habit with workouts", () => {
    seedRoutine([{ id: "h1", name: "Медитація" }], {
      h1: ["2026-04-22"],
    });
    seedWorkouts([
      { startedAt: "2026-04-22T10:00:00", ended: true },
      { startedAt: "2026-04-20T10:00:00", ended: true },
    ]);
    const out = call({
      name: "habit_correlation",
      input: { habit: "медитація", against: "workouts", period_days: 7 },
    });
    expect(out).toContain("Тренування");
    expect(out).toMatch(/тренувань\/день/);
  });

  it("error: habit done every day → no contrast", () => {
    const completions = Array.from({ length: 7 }, (_, i) => {
      const d = new Date("2026-04-22T12:00:00");
      d.setDate(d.getDate() - i);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    seedRoutine([{ id: "h1", name: "Вода" }], { h1: completions });
    const out = call({
      name: "habit_correlation",
      input: { habit: "вода", period_days: 7 },
    });
    expect(out).toContain("усі");
  });

  it("error: habit never done → nothing to correlate", () => {
    seedRoutine([{ id: "h1", name: "Вода" }], {});
    const out = call({
      name: "habit_correlation",
      input: { habit: "вода", period_days: 7 },
    });
    expect(out).toContain("Немає днів");
  });

  it("shape: result is a non-empty string", () => {
    seedRoutine([{ id: "h1", name: "Вода" }], { h1: ["2026-04-21"] });
    const out = call({
      name: "habit_correlation",
      input: { habit: "вода", period_days: 30 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
describe("handleQueryRoutineAction router", () => {
  it("returns undefined for non-routine-query actions", () => {
    const out = handleQueryRoutineAction({
      name: "query_transactions",
      input: { query: "АТБ" },
    } as ChatAction);
    expect(out).toBeUndefined();
  });
});
