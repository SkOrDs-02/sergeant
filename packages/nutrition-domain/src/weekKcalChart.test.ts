import { describe, expect, it } from "vitest";

import {
  WEEK_KCAL_CEILING_HEADROOM,
  computeWeekKcalChart,
} from "./weekKcalChart.js";
import type { MacrosRow } from "./nutritionTypes.js";

function row(date: string, kcal: number): MacrosRow {
  return { date, kcal, protein_g: 0, fat_g: 0, carbs_g: 0 };
}

const WEEK = [
  row("2026-08-10", 0),
  row("2026-08-11", 1200),
  row("2026-08-12", 1800),
  row("2026-08-13", 0),
  row("2026-08-14", 0),
  row("2026-08-15", 0),
  row("2026-08-16", 0),
];

describe("computeWeekKcalChart", () => {
  it("привʼязує стелю до цілі з запасом, а не до максимуму тижня", () => {
    const model = computeWeekKcalChart(WEEK, 2000);
    expect(model.ceiling).toBe(2000 * WEEK_KCAL_CEILING_HEADROOM);
    expect(model.goalRatio).toBeCloseTo(1 / WEEK_KCAL_CEILING_HEADROOM, 5);
  });

  it("тримає висоту стабільною, коли міняється лише максимум тижня", () => {
    const quiet = computeWeekKcalChart(WEEK, 2000);
    const busy = computeWeekKcalChart(
      WEEK.map((r) => (r.date === "2026-08-12" ? row(r.date, 2100) : r)),
      2000,
    );
    // Вівторок не мінявся — його висота теж не має мінятись. Саме це
    // ламала стара самонормалізація по максимуму тижня.
    const tuesday = (m: ReturnType<typeof computeWeekKcalChart>) =>
      m.bars.find((b) => b.date === "2026-08-11")?.ratio;
    expect(tuesday(busy)).toBe(tuesday(quiet));
  });

  it("піднімає стелю до дня, що пробив запас над ціллю", () => {
    const model = computeWeekKcalChart([row("2026-08-10", 4000)], 2000);
    expect(model.ceiling).toBe(4000);
    expect(model.bars[0]?.ratio).toBe(1);
    expect(model.goalRatio).toBe(0.5);
  });

  it("без цілі бере стелею максимум тижня і не дає goalRatio", () => {
    const model = computeWeekKcalChart(WEEK, 0);
    expect(model.ceiling).toBe(1800);
    expect(model.goalRatio).toBeNull();
    expect(model.goalKcal).toBe(0);
  });

  it("позначає порожні дні isEmpty з нульовою висотою", () => {
    const model = computeWeekKcalChart(WEEK, 2000);
    const monday = model.bars[0];
    expect(monday?.isEmpty).toBe(true);
    expect(monday?.ratio).toBe(0);
    expect(model.bars[1]?.isEmpty).toBe(false);
  });

  it("рахує середнє лише по днях із записами (канон §5.2)", () => {
    const model = computeWeekKcalChart(WEEK, 2000);
    expect(model.daysLogged).toBe(2);
    expect(model.totalKcal).toBe(3000);
    expect(model.avgKcal).toBe(1500);
  });

  it("не світить перебором у межах 5% допуску", () => {
    const model = computeWeekKcalChart(
      [row("2026-08-10", 2100), row("2026-08-11", 2101)],
      2000,
    );
    expect(model.bars[0]?.isOver).toBe(false);
    expect(model.bars[1]?.isOver).toBe(true);
  });

  it("без цілі не позначає перебором нічого", () => {
    const model = computeWeekKcalChart([row("2026-08-10", 9000)], 0);
    expect(model.bars[0]?.isOver).toBe(false);
  });

  it("витримує порожній тиждень і сміттєвий вхід", () => {
    const empty = computeWeekKcalChart([], 0);
    expect(empty.ceiling).toBe(1);
    expect(empty.avgKcal).toBe(0);
    expect(empty.daysLogged).toBe(0);

    const junk = computeWeekKcalChart(
      [{ date: "2026-08-10", kcal: Number.NaN } as unknown as MacrosRow],
      Number.NaN,
    );
    expect(junk.bars[0]?.kcal).toBe(0);
    expect(junk.bars[0]?.isEmpty).toBe(true);
    expect(junk.goalRatio).toBeNull();
  });

  it("не приймає відʼємні ккал як висоту", () => {
    const model = computeWeekKcalChart([row("2026-08-10", -500)], 2000);
    expect(model.bars[0]?.kcal).toBe(0);
    expect(model.bars[0]?.ratio).toBe(0);
    expect(model.totalKcal).toBe(0);
  });
});
