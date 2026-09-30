import { afterEach, describe, expect, it } from "vitest";

import { computeStreakDays } from "./dashboardKpis.js";
import {
  DEFAULT_WEEKLY_STREAK_TARGET,
  computeWeeklyStreakBreakdown,
  computeWeeklyStreakWeeks,
} from "./weeklyStreak.js";
import type { DashboardWorkoutInput } from "./types.js";

// Середа, 12:00 Kyiv — поточний тиждень почався в понеділок 2026-07-27.
const NOW = new Date("2026-07-29T09:00:00.000Z");

/**
 * Повноцінне тренування: 45 хвилин по годиннику. Доти фікстура мала
 * `startedAt === endedAt` — нульову тривалість і жодного підходу, тобто за
 * каноном §8 це «легка активність», яку стрік із 2026-09-15 не рахує.
 */
function workout(endedAt: string): DashboardWorkoutInput {
  const startedAt = new Date(Date.parse(endedAt) - 45 * 60_000).toISOString();
  return { endedAt, startedAt } as DashboardWorkoutInput;
}

/** Легкий запис: один підхід відтискань за пів хвилини — на дні є, у стрік ні. */
function lightWorkout(endedAt: string): DashboardWorkoutInput {
  const startedAt = new Date(Date.parse(endedAt) - 30_000).toISOString();
  return {
    endedAt,
    startedAt,
    items: [
      {
        exerciseId: "pushup",
        type: "strength",
        sets: [{ weightKg: 0, reps: 20 }],
      },
    ],
  } as DashboardWorkoutInput;
}

/** N тренувань у тижні, що починається вказаним понеділком. */
function weekOf(mondayIso: string, count: number): DashboardWorkoutInput[] {
  const out: DashboardWorkoutInput[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(`${mondayIso}T09:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(workout(d.toISOString()));
  }
  return out;
}

describe("computeWeeklyStreakBreakdown", () => {
  it("порожня історія — нуль без обриву", () => {
    const b = computeWeeklyStreakBreakdown([], { now: NOW });
    expect(b.weeks).toBe(0);
    expect(b.brokenOnWeekStart).toBeNull();
  });

  it("рахує тижні поспіль із ≥X тренувань", () => {
    const workouts = [
      ...weekOf("2026-07-27", 2),
      ...weekOf("2026-07-20", 3),
      ...weekOf("2026-07-13", 2),
    ];
    const b = computeWeeklyStreakBreakdown(workouts, { now: NOW });
    expect(b.weeks).toBe(3);
    expect(b.targetPerWeek).toBe(DEFAULT_WEEKLY_STREAK_TARGET);
    expect(b.currentWeekPending).toBe(false);
  });

  it("легка активність тиждень не закриває, але й не ламає (канон §8, 2026-09-15)", () => {
    // Минулий тиждень — два повноцінні. Цього тижня — одне повноцінне і
    // три «+20 відтискань». За старою логікою тиждень був би закритий
    // чотирма записами; тепер поріг рахує лише повноцінні, тож тиждень
    // ще триває з прогресом «1 з 2».
    const workouts = [
      ...weekOf("2026-07-27", 1),
      lightWorkout("2026-07-27T18:00:00.000Z"),
      lightWorkout("2026-07-28T18:00:00.000Z"),
      lightWorkout("2026-07-29T07:00:00.000Z"),
      ...weekOf("2026-07-20", 2),
    ];
    const b = computeWeeklyStreakBreakdown(workouts, { now: NOW });
    expect(b.currentWeekWorkouts).toBe(1);
    expect(b.currentWeekPending).toBe(true);
    expect(b.weeks).toBe(1);
  });

  it("день відпочинку серію НЕ рве — на відміну від щоденної логіки", () => {
    // Тренування в понеділок і вівторок, середа (сьогодні) — відпочинок.
    const workouts = [...weekOf("2026-07-27", 2), ...weekOf("2026-07-20", 2)];
    // Щоденний стрік: сьогодні порожньо → grace на вчора, і серія обривається
    // об середу-відпочинок, хоча тиждень насправді вдалий.
    expect(computeStreakDays(workouts, NOW)).toBe(2);
    // Тижневий: обидва тижні взяли поріг.
    expect(computeWeeklyStreakWeeks(workouts, { now: NOW })).toBe(2);
  });

  it("незакритий поточний тиждень не обриває серію", () => {
    // Цього тижня поки одне тренування — поріг не взято, але тиждень триває.
    const workouts = [
      ...weekOf("2026-07-27", 1),
      ...weekOf("2026-07-20", 2),
      ...weekOf("2026-07-13", 2),
    ];
    const b = computeWeeklyStreakBreakdown(workouts, { now: NOW });
    expect(b.currentWeekPending).toBe(true);
    expect(b.currentWeekWorkouts).toBe(1);
    // Два закриті тижні лишаються серією.
    expect(b.weeks).toBe(2);
  });

  it("тиждень нижче порогу обриває серію на собі", () => {
    const workouts = [
      ...weekOf("2026-07-27", 2),
      ...weekOf("2026-07-20", 1), // провалений
      ...weekOf("2026-07-13", 3),
    ];
    const b = computeWeeklyStreakBreakdown(workouts, { now: NOW });
    expect(b.weeks).toBe(1);
    expect(b.brokenOnWeekStart).toBe("2026-07-20");
  });

  it("поріг налаштовується", () => {
    const workouts = [...weekOf("2026-07-27", 2), ...weekOf("2026-07-20", 2)];
    expect(
      computeWeeklyStreakWeeks(workouts, { now: NOW, targetPerWeek: 3 }),
    ).toBe(0);
    expect(
      computeWeeklyStreakWeeks(workouts, { now: NOW, targetPerWeek: 1 }),
    ).toBe(2);
  });

  it("незавершені тренування не рахуються", () => {
    const workouts = [
      ...weekOf("2026-07-27", 1),
      { startedAt: "2026-07-28T09:00:00.000Z" } as DashboardWorkoutInput,
    ];
    const b = computeWeeklyStreakBreakdown(workouts, { now: NOW });
    expect(b.currentWeekWorkouts).toBe(1);
  });

  it("серія доходить до початку історії без хибного обриву", () => {
    const workouts = weekOf("2026-07-27", 2);
    const b = computeWeeklyStreakBreakdown(workouts, { now: NOW });
    expect(b.weeks).toBe(1);
    expect(b.brokenOnWeekStart).toBeNull();
  });
});

describe("computeWeeklyStreakBreakdown — годинник пристрою (ADR-0078)", () => {
  const originalTz = process.env["TZ"];
  afterEach(() => {
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  it("Мексика: тренування о 00:30 понеділка за пристроєм — у новому тижні", () => {
    process.env["TZ"] = "America/Mexico_City"; // UTC-6
    // Понеділок 2026-07-27 00:30 локально = 06:30Z; неділя 23:30 = 05:30Z.
    // За Києвом обидва — вже понеділок 27-го, тож старий код рахував би їх
    // в одному тижні.
    const now = new Date("2026-07-29T18:00:00.000Z");
    const workouts = [
      workout("2026-07-27T05:30:00.000Z"), // неділя 26-го локально
      workout("2026-07-27T06:30:00.000Z"), // понеділок 27-го локально
      workout("2026-07-28T18:00:00.000Z"),
    ];
    const b = computeWeeklyStreakBreakdown(workouts, { now });
    expect(b.currentWeekWorkouts).toBe(2);
    expect(b.currentWeekPending).toBe(false);
    expect(b.weeks).toBe(1);
  });

  it("Токіо: ключ обриву — календарний понеділок пристрою", () => {
    process.env["TZ"] = "Asia/Tokyo"; // UTC+9
    const now = new Date("2026-07-29T03:00:00.000Z");
    // Пон. 2026-07-20 00:30 JST = 07-19T15:30Z: за Києвом це ще неділя 19-го
    // (18:30), тобто інший тиждень. Пристрій: тиждень 07-20.
    const workouts = [
      ...weekOf("2026-07-27", 2),
      workout("2026-07-19T15:30:00.000Z"), // 07-20 00:30 JST
    ];
    const b = computeWeeklyStreakBreakdown(workouts, { now });
    expect(b.weeks).toBe(1);
    expect(b.brokenOnWeekStart).toBe("2026-07-20");
  });

  it("київський пристрій дає той самий результат, що й раніше", () => {
    process.env["TZ"] = "Europe/Kyiv";
    const workouts = [
      ...weekOf("2026-07-27", 2),
      ...weekOf("2026-07-20", 3),
      ...weekOf("2026-07-13", 2),
    ];
    expect(computeWeeklyStreakBreakdown(workouts, { now: NOW }).weeks).toBe(3);
  });
});
