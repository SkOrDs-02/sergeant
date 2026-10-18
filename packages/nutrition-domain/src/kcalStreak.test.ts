/**
 * Last validated: 2026-09-13
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { countKcalStreakDays } from "./kcalStreak.js";
import type { NutritionLogLike } from "./nutritionTypes.js";
import type { GoalPeriod } from "./nutritionGoals.js";

const TODAY = "2026-09-13";

/** Одна ціль на весь час — щоб предметом тесту була саме серія. */
const goal = (effectiveFrom: string): GoalPeriod => ({
  id: `g-${effectiveFrom}`,
  effectiveFrom,
  kcal: 2000,
  proteinG: 100,
  fatG: 60,
  carbsG: 250,
  waterMl: null,
  origin: "manual",
  createdAt: `${effectiveFrom}T00:00:00.000Z`,
});

const GOALS: GoalPeriod[] = [goal("2020-01-01")];

/** `days` — зміщення від сьогодні (0 = сьогодні) → спожиті ккал. */
function logWith(days: Record<number, number>): NutritionLogLike {
  const log: Record<string, unknown> = {};
  for (const [offset, kcal] of Object.entries(days)) {
    const d = new Date(`${TODAY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - Number(offset));
    const key = d.toISOString().slice(0, 10);
    // Ккал живуть у `meal.macros`, не на самій страві — `getDayMacros`
    // сумує саме `macrosToTotals(m.macros)`.
    log[key] = {
      meals: [
        {
          id: `m-${key}`,
          type: "snack",
          name: "x",
          macros: { kcal, protein_g: 0, fat_g: 0, carbs_g: 0 },
        },
      ],
    };
  }
  return log as NutritionLogLike;
}

describe("countKcalStreakDays", () => {
  it("порожній лог дає нуль", () => {
    expect(countKcalStreakDays({}, GOALS, TODAY)).toBe(0);
  });

  // Головне правило: зранку з'їдено нуль, і рахувати від сьогодні означало б,
  // що серія падає в нуль щоранку й повертається ввечері.
  it("сьогоднішній нуль серію НЕ обриває — рахуємо від учора", () => {
    const log = logWith({ 1: 2000, 2: 1980, 3: 2050 });
    expect(countKcalStreakDays(log, GOALS, TODAY)).toBe(3);
  });

  it("сьогодні в нормі — входить у серію", () => {
    const log = logWith({ 0: 2000, 1: 2000, 2: 1980 });
    expect(countKcalStreakDays(log, GOALS, TODAY)).toBe(3);
  });

  // А от день ІЗ ЗАПИСАМИ поза нормою — це вже промах, навіть якщо він
  // сьогоднішній: людина поїла, просто повз ціль.
  it("сьогоднішній перебір обриває серію", () => {
    const log = logWith({ 0: 3500, 1: 2000, 2: 2000 });
    expect(countKcalStreakDays(log, GOALS, TODAY)).toBe(0);
  });

  it("промах усередині обриває — рахується лише хвіст до нього", () => {
    const log = logWith({ 1: 2000, 2: 2000, 3: 900, 4: 2000 });
    expect(countKcalStreakDays(log, GOALS, TODAY)).toBe(2);
  });

  it("межі допуску ±5% включні", () => {
    // 2100 = рівно +5%, 2101 — уже поза.
    expect(countKcalStreakDays(logWith({ 1: 2100 }), GOALS, TODAY)).toBe(1);
    expect(countKcalStreakDays(logWith({ 1: 2101 }), GOALS, TODAY)).toBe(0);
    expect(countKcalStreakDays(logWith({ 1: 1900 }), GOALS, TODAY)).toBe(1);
    expect(countKcalStreakDays(logWith({ 1: 1899 }), GOALS, TODAY)).toBe(0);
  });

  it("дні до першої сходинки рахуються за нею (origin 'extended')", () => {
    const late: GoalPeriod[] = [goal("2026-09-11")];
    const log = logWith({ 1: 2000, 2: 2000, 3: 2000, 4: 2000 });
    expect(countKcalStreakDays(log, late, TODAY)).toBe(4);
  });

  it("без жодної цілі в журналі серії немає", () => {
    const log = logWith({ 1: 2000, 2: 2000 });
    expect(countKcalStreakDays(log, [], TODAY)).toBe(0);
  });
});
