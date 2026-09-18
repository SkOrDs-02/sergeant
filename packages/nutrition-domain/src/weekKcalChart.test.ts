import { describe, expect, it } from "vitest";

import {
  WEEK_KCAL_CEILING_HEADROOM,
  computeWeekKcalChart,
} from "./weekKcalChart.js";
import type { MacrosRow } from "./nutritionTypes.js";

function row(date: string, kcal: number): MacrosRow {
  return { date, kcal, protein_g: 0, fat_g: 0, carbs_g: 0 };
}

/**
 * Ціль, незмінна весь тиждень. Досі це був єдиний можливий випадок, і
 * поки девʼять читачів не переїхали на журнал, він лишається єдиним
 * фактичним — тому старі очікування нижче не мінялись, лише виклик.
 */
function flat(goal: number, days: number): (number | null)[] {
  return Array.from({ length: days }, () => (goal > 0 ? goal : null));
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
    const model = computeWeekKcalChart(WEEK, flat(2000, WEEK.length));
    expect(model.ceiling).toBe(2000 * WEEK_KCAL_CEILING_HEADROOM);
    expect(model.bars[0]?.goalRatio).toBeCloseTo(
      1 / WEEK_KCAL_CEILING_HEADROOM,
      5,
    );
  });

  it("тримає висоту стабільною, коли міняється лише максимум тижня", () => {
    const quiet = computeWeekKcalChart(WEEK, flat(2000, WEEK.length));
    const busy = computeWeekKcalChart(
      WEEK.map((r) => (r.date === "2026-08-12" ? row(r.date, 2100) : r)),
      flat(2000, WEEK.length),
    );
    // Вівторок не мінявся — його висота теж не має мінятись. Саме це
    // ламала стара самонормалізація по максимуму тижня.
    const tuesday = (m: ReturnType<typeof computeWeekKcalChart>) =>
      m.bars.find((b) => b.date === "2026-08-11")?.ratio;
    expect(tuesday(busy)).toBe(tuesday(quiet));
  });

  it("піднімає стелю до дня, що пробив запас над ціллю", () => {
    const model = computeWeekKcalChart([row("2026-08-10", 4000)], [2000]);
    expect(model.ceiling).toBe(4000);
    expect(model.bars[0]?.ratio).toBe(1);
    expect(model.bars[0]?.goalRatio).toBe(0.5);
  });

  it("без цілі бере стелею максимум тижня і не дає лінії цілі", () => {
    const model = computeWeekKcalChart(WEEK, flat(0, WEEK.length));
    expect(model.ceiling).toBe(1800);
    expect(model.bars.every((b) => b.goalRatio === null)).toBe(true);
    expect(model.goalKcal).toBe(0);
  });

  it("позначає порожні дні isEmpty з нульовою висотою", () => {
    const model = computeWeekKcalChart(WEEK, flat(2000, WEEK.length));
    const monday = model.bars[0];
    expect(monday?.isEmpty).toBe(true);
    expect(monday?.ratio).toBe(0);
    expect(model.bars[1]?.isEmpty).toBe(false);
  });

  it("рахує середнє лише по днях із записами (канон §5.2)", () => {
    const model = computeWeekKcalChart(WEEK, flat(2000, WEEK.length));
    expect(model.daysLogged).toBe(2);
    expect(model.totalKcal).toBe(3000);
    expect(model.avgKcal).toBe(1500);
  });

  it("не світить перебором у межах 5% допуску", () => {
    const model = computeWeekKcalChart(
      [row("2026-08-10", 2100), row("2026-08-11", 2101)],
      [2000, 2000],
    );
    expect(model.bars[0]?.isOver).toBe(false);
    expect(model.bars[1]?.isOver).toBe(true);
  });

  it("без цілі не позначає перебором нічого", () => {
    const model = computeWeekKcalChart([row("2026-08-10", 9000)], [null]);
    expect(model.bars[0]?.isOver).toBe(false);
  });

  it("витримує порожній тиждень і сміттєвий вхід", () => {
    const empty = computeWeekKcalChart([], []);
    expect(empty.ceiling).toBe(1);
    expect(empty.avgKcal).toBe(0);
    expect(empty.daysLogged).toBe(0);

    const junk = computeWeekKcalChart(
      [{ date: "2026-08-10", kcal: Number.NaN } as unknown as MacrosRow],
      [Number.NaN],
    );
    expect(junk.bars[0]?.kcal).toBe(0);
    expect(junk.bars[0]?.isEmpty).toBe(true);
    expect(junk.bars[0]?.goalRatio).toBeNull();
  });

  it("судить кожен день ЙОГО ціллю, а не останньою", () => {
    // Ядро стадії 3: ціль упала 2400 → 1800 із середи. Понеділковi 2300
    // під ціллю 2400 — це не перебір, хоча під новою ціллю виглядали б ним.
    const rows = [
      row("2026-08-10", 2300),
      row("2026-08-11", 2300),
      row("2026-08-12", 2300),
    ];
    const model = computeWeekKcalChart(rows, [2400, 2400, 1800]);
    expect(model.bars.map((b) => b.isOver)).toEqual([false, false, true]);
    expect(model.bars.map((b) => b.goalKcal)).toEqual([2400, 2400, 1800]);
  });

  it("лінія цілі йде сходинкою, а не однією висотою на весь тиждень", () => {
    const rows = [row("2026-08-10", 100), row("2026-08-11", 100)];
    const model = computeWeekKcalChart(rows, [2400, 1800]);
    const [a, b] = model.bars;
    expect(a?.goalRatio).not.toBe(b?.goalRatio);
    // Стелю тримає НАЙБІЛЬША ціль тижня: інакше понеділок із ціллю 2400
    // стиснувся б під стелю вівторкових 1800 і поїхав би за верх графіка.
    expect(model.ceiling).toBe(2400 * WEEK_KCAL_CEILING_HEADROOM);
  });

  it("день без цілі лишається без лінії, а не з нулем", () => {
    // Журнал молодший за лог: до першої сходинки цілі не було взагалі.
    // Нуль тут означав би «ціль 0 ккал», тобто вічний перебір.
    const model = computeWeekKcalChart(
      [row("2026-08-10", 1500), row("2026-08-11", 1500)],
      [null, 2000],
    );
    expect(model.bars[0]?.goalRatio).toBeNull();
    expect(model.bars[0]?.isOver).toBe(false);
    expect(model.bars[1]?.goalRatio).not.toBeNull();
  });

  it("підпис шкали бере ціль останнього дня, який її мав", () => {
    const model = computeWeekKcalChart(
      [row("2026-08-10", 0), row("2026-08-11", 0), row("2026-08-12", 0)],
      [2400, 1800, null],
    );
    expect(model.goalKcal).toBe(1800);
  });

  it("ряд цілей коротший за тиждень не ламає модель", () => {
    // Захист від розсинхрону: викликач нарізає ряд окремо від рядків.
    const model = computeWeekKcalChart(WEEK, [2000]);
    expect(model.bars).toHaveLength(WEEK.length);
    expect(model.bars[0]?.goalKcal).toBe(2000);
    expect(model.bars[1]?.goalKcal).toBe(0);
    expect(model.bars[1]?.goalRatio).toBeNull();
  });

  it("не приймає відʼємні ккал як висоту", () => {
    const model = computeWeekKcalChart([row("2026-08-10", -500)], [2000]);
    expect(model.bars[0]?.kcal).toBe(0);
    expect(model.bars[0]?.ratio).toBe(0);
    expect(model.totalKcal).toBe(0);
  });
});
