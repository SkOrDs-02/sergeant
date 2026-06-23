// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mem = vi.hoisted(() => ({
  workouts: [] as unknown[],
  dailyLog: [] as unknown[],
}));

vi.mock("./shared", async (orig) => {
  const actual = await orig<typeof import("./shared")>();
  return {
    ...actual,
    readFizrukWorkouts: vi.fn(() => mem.workouts),
    readFizrukDailyLog: vi.fn(() => mem.dailyLog),
  };
});

import { suggestWorkout, compareProgress, weightChart } from "./analytics";

const NOW = new Date("2026-06-15T12:00:00Z");
const DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function workout(opts: {
  id: string;
  daysAgo: number;
  ended?: boolean;
  items?: unknown[];
}) {
  return {
    id: opts.id,
    startedAt: daysAgoIso(opts.daysAgo),
    endedAt: opts.ended === false ? undefined : daysAgoIso(opts.daysAgo),
    items: opts.items ?? [],
  };
}

function item(opts: {
  nameUk: string;
  primary?: string[];
  secondary?: string[];
  sets?: Array<{ weightKg: number; reps: number }>;
}) {
  return {
    nameUk: opts.nameUk,
    musclesPrimary: opts.primary ?? [],
    musclesSecondary: opts.secondary ?? [],
    sets: opts.sets ?? [],
  };
}

beforeEach(() => {
  mem.workouts = [];
  mem.dailyLog = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("suggestWorkout", () => {
  it("returns a starter suggestion when no completed history", () => {
    const out = suggestWorkout({ name: "suggest_workout", input: {} });
    expect(String(out)).toContain("full-body");
  });

  it("appends focus to the empty-history suggestion", () => {
    const out = suggestWorkout({
      name: "suggest_workout",
      input: { focus: "ноги" },
    });
    expect(String(out)).toContain("(фокус: ноги)");
  });

  it("surfaces neglected muscles, last exercises and totals", () => {
    mem.workouts = [
      workout({
        id: "old",
        daysAgo: 10,
        items: [
          item({ nameUk: "Жим", primary: ["chest"], secondary: ["triceps"] }),
        ],
      }),
      workout({
        id: "recent",
        daysAgo: 1,
        items: [item({ nameUk: "Присід", primary: ["legs"] })],
      }),
    ];
    const out = String(
      suggestWorkout({ name: "suggest_workout", input: { focus: "груди" } }),
    );
    // chest/triceps trained 10 days ago → neglected (>=3 days)
    expect(out).toContain("chest");
    expect(out).toContain("Останнє тренування: Присід");
    expect(out).toContain("Всього завершених: 2");
    expect(out).toContain("Бажаний фокус: груди");
  });
});

describe("compareProgress", () => {
  it("errors when no completed workouts", () => {
    expect(
      String(compareProgress({ name: "compare_progress", input: {} })),
    ).toContain("Немає завершених");
  });

  it("compares first vs second half volume for an exercise", () => {
    // 30-day window → midpoint at 15 days ago.
    mem.workouts = [
      workout({
        id: "h1",
        daysAgo: 20,
        items: [
          item({
            nameUk: "Жим",
            primary: ["chest"],
            sets: [{ weightKg: 50, reps: 10 }],
          }),
        ],
      }),
      workout({
        id: "h2",
        daysAgo: 5,
        items: [
          item({
            nameUk: "Жим",
            primary: ["chest"],
            sets: [{ weightKg: 70, reps: 10 }],
          }),
        ],
      }),
    ];
    const out = String(
      compareProgress({
        name: "compare_progress",
        input: { exercise_name: "жим", period_days: 30 },
      }),
    );
    expect(out).toContain("Прогрес (жим) за 30 днів:");
    expect(out).toContain("Об'єм (кг×повт): 500 → 700");
    expect(out).toContain("Макс. вага: 50 → 70 кг");
    expect(out).toContain("Тренувань: 1 → 1");
  });

  it("matches by muscle group and defaults period to 30", () => {
    mem.workouts = [
      workout({
        id: "m1",
        daysAgo: 3,
        items: [
          item({
            nameUk: "Тяга",
            primary: ["back"],
            sets: [{ weightKg: 80, reps: 5 }],
          }),
        ],
      }),
    ];
    const out = String(
      compareProgress({
        name: "compare_progress",
        input: { muscle_group: "back" },
      }),
    );
    expect(out).toContain("Прогрес (back) за 30 днів:");
  });
});

describe("weightChart", () => {
  it("errors when no weight entries in range", () => {
    expect(String(weightChart({ name: "weight_chart", input: {} }))).toContain(
      "Немає записів ваги",
    );
  });

  it("summarizes weight trend and recent records", () => {
    mem.dailyLog = [
      { at: daysAgoIso(6), weightKg: 82 },
      { at: daysAgoIso(4), weightKg: 81 },
      { at: daysAgoIso(2), weightKg: 80 },
    ];
    const out = String(
      weightChart({ name: "weight_chart", input: { period_days: 30 } }),
    );
    expect(out).toContain("Вага за 30 днів (3 записів):");
    expect(out).toContain("Перша: 82 кг → Остання: 80 кг (-2.0 кг)");
    expect(out).toContain("Мін: 80 кг | Макс: 82 кг");
    expect(out).toContain("Останні записи:");
  });

  it("ignores entries with invalid weight or out of range", () => {
    mem.dailyLog = [
      { at: daysAgoIso(2), weightKg: 80 },
      { at: daysAgoIso(100), weightKg: 90 }, // out of 30d range
      { at: daysAgoIso(1), weightKg: null }, // invalid
    ];
    const out = String(weightChart({ name: "weight_chart", input: {} }));
    expect(out).toContain("(1 записів)");
  });
});
