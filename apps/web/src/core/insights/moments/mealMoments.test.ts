import { describe, expect, it } from "vitest";

import type { DailySeries } from "../../lib/chatActions/crossActions/dailySeries";
import type { NutritionLog } from "../../../modules/nutrition/lib/nutritionStorage";
import { detectMealMoment } from "./mealMoments";

const DAYS = Array.from(
  { length: 14 },
  (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`,
);

/** Відсоток звичок по днях: росте щодня, тож калорії, що ростуть разом, дають сильний звʼязок. */
function series(): DailySeries {
  return {
    from: DAYS[0]!,
    to: DAYS[DAYS.length - 1]!,
    days: DAYS,
    metrics: ["habit_rate", "kcal", "protein"],
    raw: {
      habit_rate: DAYS.map((_, i) => 0.3 + i * 0.05),
      kcal: DAYS.map(() => undefined),
      protein: DAYS.map(() => undefined),
    },
  };
}

/** Лог з калоріями на перших `n` днях: 1500 + 100 на кожен наступний. */
function log(n: number): NutritionLog {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < n; i++) {
    out[DAYS[i]!] = {
      meals: [{ id: `m${i}`, macros: { kcal: 1500 + i * 100, protein_g: 0 } }],
    };
  }
  return out as NutritionLog;
}

function mealOn(daysBefore: number) {
  return detectMealMoment({
    prevLog: log(daysBefore),
    nextLog: log(daysBefore + 1),
    workouts: [],
    series: series(),
    target: "nutrition:day",
  });
}

describe("моменти запису їжі", () => {
  it("десятий спільний день відкриває звʼязок і називає його", () => {
    expect(mealOn(9)).toEqual({
      kind: "link",
      target: "nutrition:day",
      detail: "коли тримаєш звички, їси більше",
    });
  });

  it("на останніх 20% до звʼязку обіцяє лише перевірку, без назви звʼязку", () => {
    expect(mealOn(7)).toEqual({
      kind: "approach",
      target: "nutrition:day",
      value: 2,
      detail: "routine",
    });
  });

  it("друга страва за день спільних днів не додає і мовчить", () => {
    const prev = log(8);
    const next = log(8);
    next[DAYS[7]!]!.meals.push({
      id: "extra",
      macros: { kcal: 300, protein_g: 0 },
    } as never);
    expect(
      detectMealMoment({
        prevLog: prev,
        nextLog: next,
        workouts: [],
        series: series(),
        target: "nutrition:day",
      }),
    ).toBeNull();
  });

  it("далеко від порога і після нього рядовий запис мовчить", () => {
    expect(mealOn(3)).toBeNull();
    expect(mealOn(11)).toBeNull();
  });
});
