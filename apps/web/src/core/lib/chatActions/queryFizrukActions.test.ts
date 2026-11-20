// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Workout as FizrukWorkout } from "@sergeant/fizruk-domain";

// `fizruk_workouts_v1` is tombstoned — `readFizrukWorkouts` reads the SQLite
// cache. Fake it in-memory so these read-only query specs can seed workouts.
const mem = vi.hoisted(() => ({ workouts: [] as unknown[] }));
vi.mock("./fizrukActions/shared", async (orig) => {
  const actual = await orig<typeof import("./fizrukActions/shared")>();
  return {
    ...actual,
    readFizrukWorkouts: vi.fn(() => mem.workouts as FizrukWorkout[]),
  };
});

import { handleQueryFizrukAction } from "./queryFizrukActions";
import type { ChatAction } from "./types";

beforeEach(() => {
  localStorage.clear();
  mem.workouts = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleQueryFizrukAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

function item(
  nameUk: string,
  primary: string[],
  sets: Array<{ weightKg: number; reps: number; done?: boolean }>,
) {
  return {
    id: `it_${nameUk}`,
    nameUk,
    type: "strength" as const,
    musclesPrimary: primary,
    musclesSecondary: [],
    sets,
    durationSec: 0,
    distanceM: 0,
  };
}

/** Seed completed (+ one planned/incomplete) workouts relative to 2026-04-22. */
function seed(): void {
  mem.workouts = [
    {
      id: "w1",
      startedAt: "2026-04-20T10:00:00",
      endedAt: "2026-04-20T11:00:00",
      items: [
        item(
          "Жим лежачи",
          ["Груди"],
          [
            { weightKg: 80, reps: 8 },
            { weightKg: 82.5, reps: 6 },
          ],
        ),
      ],
    },
    {
      id: "w2",
      startedAt: "2026-04-15T10:00:00",
      endedAt: "2026-04-15T11:00:00",
      items: [item("Присідання", ["Ноги"], [{ weightKg: 100, reps: 5 }])],
    },
    {
      id: "w3",
      startedAt: "2026-04-10T10:00:00",
      endedAt: "2026-04-10T11:00:00",
      items: [item("Жим лежачи", ["Груди"], [{ weightKg: 75, reps: 8 }])],
    },
    {
      id: "w_old",
      startedAt: "2026-01-01T10:00:00",
      endedAt: "2026-01-01T11:00:00",
      items: [item("Жим лежачи", ["Груди"], [{ weightKg: 70, reps: 8 }])],
    },
    {
      id: "w_planned",
      startedAt: "2026-04-21T10:00:00",
      endedAt: null,
      items: [item("Жим лежачи", ["Груди"], [{ weightKg: 90, reps: 5 }])],
    },
  ];
}

// ---------------------------------------------------------------------------
// query_workouts
// ---------------------------------------------------------------------------
describe("query_workouts", () => {
  it("happy: lists completed workouts in default window with volume", () => {
    seed();
    const out = call({ name: "query_workouts", input: {} });
    expect(out).toContain("Тренувань за 30 днів: 3"); // w1,w2,w3 (not old, not planned)
    expect(out).toMatch(/обʼєм/i);
  });

  it("happy: filters by exercise", () => {
    seed();
    const out = call({
      name: "query_workouts",
      input: { exercise: "жим" },
    });
    expect(out).toContain("2"); // w1 + w3 bench
    expect(out).toContain("Жим лежачи");
    expect(out).not.toContain("Присідання");
  });

  it("happy: filters by muscle", () => {
    seed();
    const out = call({
      name: "query_workouts",
      input: { muscle: "ноги" },
    });
    expect(out).toContain("Присідання");
    expect(out).not.toContain("Жим лежачи");
  });

  it("error: no matches returns message", () => {
    seed();
    const out = call({
      name: "query_workouts",
      input: { exercise: "плавання" },
    });
    expect(out).toContain("Немає");
  });

  it("shape: result is a non-empty string", () => {
    seed();
    const out = call({ name: "query_workouts", input: { period_days: 365 } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// exercise_progress
// ---------------------------------------------------------------------------
describe("exercise_progress", () => {
  it("happy: trends max weight first → last session", () => {
    seed();
    const out = call({
      name: "exercise_progress",
      input: { exercise_name: "жим" },
    });
    expect(out).toContain("Прогрес");
    expect(out).toMatch(/75 → 82,5/); // w3 first (75) → w1 last (82.5)
  });

  it("error: missing exercise_name returns guidance", () => {
    seed();
    const out = call({ name: "exercise_progress", input: {} });
    expect(out).toContain("Вкажи назву вправи");
  });

  it("error: unknown exercise returns no-data message", () => {
    seed();
    const out = call({
      name: "exercise_progress",
      input: { exercise_name: "плавання" },
    });
    expect(out).toContain("Немає записів");
  });

  it("shape: result is a non-empty string", () => {
    seed();
    const out = call({
      name: "exercise_progress",
      input: { exercise_name: "присід", period_days: 365 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// Фз-3 (в), спека `fizruk-set-done-flag-and-set-type.md`: рядок плану несе
// значення плану й `done: false` і до ✓ людини не зарахований — ні в макс.
// вагу, ні в кількість підходів, навіть у завершеному тренуванні.
describe("незроблені рядки плану (done: false)", () => {
  function seedWithPlanRow(): void {
    seed();
    const w1 = mem.workouts[0] as FizrukWorkout;
    w1.items[0]!.sets = [
      ...(w1.items[0]!.sets ?? []),
      { weightKg: 120, reps: 10, done: false },
    ];
  }

  it("exercise_progress не бере вагу незробленого рядка", () => {
    seedWithPlanRow();
    const out = call({
      name: "exercise_progress",
      input: { exercise_name: "жим" },
    });
    expect(out).toMatch(/75 → 82,5/);
    expect(out).not.toContain("120");
  });

  it("training_stats і query_workouts не рахують його підходом", () => {
    seedWithPlanRow();
    expect(
      call({ name: "training_stats", input: { period_days: 30 } }),
    ).toContain("підходів: 4");
    expect(call({ name: "query_workouts", input: {} })).toContain("2 підх.");
  });
});

// ---------------------------------------------------------------------------
// training_stats
// ---------------------------------------------------------------------------
describe("training_stats", () => {
  it("happy: aggregates frequency and top exercises/muscles", () => {
    seed();
    const out = call({ name: "training_stats", input: {} });
    expect(out).toContain("Статистика тренувань");
    expect(out).toContain("Тренувань: 3");
    expect(out).toContain("Жим лежачи (2)"); // bench in w1 + w3
  });

  it("error: empty window returns no-data message", () => {
    seed();
    const out = call({ name: "training_stats", input: { period_days: 1 } });
    expect(out).toContain("Немає");
  });

  it("shape: result is a non-empty string", () => {
    seed();
    const out = call({ name: "training_stats", input: { period_days: 365 } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
describe("handleQueryFizrukAction router", () => {
  it("returns undefined for non-fizruk-query actions", () => {
    const out = handleQueryFizrukAction({
      name: "query_transactions",
      input: { query: "АТБ" },
    } as ChatAction);
    expect(out).toBeUndefined();
  });
});
