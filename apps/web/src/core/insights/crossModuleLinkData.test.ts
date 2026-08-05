// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { messages } from "@shared/i18n/uk";
import type {
  DailyMetric,
  DailySeries,
} from "../lib/chatActions/crossActions/dailySeries";
import { notablePairsFromSeries } from "./digestCorrelations";
import {
  pairwiseMeans,
  isCrossModule,
  linkFromPair,
  closestCrossModulePair,
  silentPoles,
} from "./crossModuleLinkData";

function series(
  raw: Partial<Record<DailyMetric, (number | undefined)[]>>,
  n: number,
): DailySeries {
  const metrics = Object.keys(raw) as DailyMetric[];
  const days = Array.from(
    { length: n },
    (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`,
  );
  return { from: days[0]!, to: days[n - 1]!, days, raw, metrics };
}

describe("pairwiseMeans", () => {
  it("рахує середні лише по днях, де є ОБИДВІ метрики", () => {
    const out = pairwiseMeans(
      series(
        {
          // День 3 має тільки spending, день 4 — тільки workout_volume:
          // жоден із них не має входити в жодне з двох середніх.
          spending: [100, 200, 999, undefined, 300],
          workout_volume: [10, 20, undefined, 999, 30],
        },
        5,
      ),
      "spending",
      "workout_volume",
    );
    expect(out).toEqual({ meanA: 200, meanB: 20, n: 3 });
  });

  it("повертає null, коли спільних днів немає", () => {
    expect(
      pairwiseMeans(
        series({ spending: [1, undefined], kcal: [undefined, 2] }, 2),
        "spending",
        "kcal",
      ),
    ).toBeNull();
  });

  it("повертає null, коли метрики немає в рядах", () => {
    expect(
      pairwiseMeans(series({ spending: [1, 2] }, 2), "spending", "weight"),
    ).toBeNull();
  });
});

describe("isCrossModule", () => {
  it("пара всередині одного модуля не є крос-модульною", () => {
    // Обидві метрики належать Рутині — саме та пара з курованого набору,
    // яка легітимна для рядка дайджесту, але не для картки зв'язку.
    expect(isCrossModule("habit_rate", "wellbeing")).toBe(false);
    expect(isCrossModule("kcal", "protein")).toBe(false);
  });

  it("пара через межу модулів є крос-модульною", () => {
    expect(isCrossModule("workout_volume", "spending")).toBe(true);
    expect(isCrossModule("habit_rate", "kcal")).toBe(true);
  });
});

describe("linkFromPair", () => {
  it("будує два полюси з модулями, числами й одиницями", () => {
    const s = series(
      {
        spending: [100, 200, 300, 400, 500],
        workout_volume: [10, 20, 30, 40, 50],
      },
      5,
    );
    const pair = notablePairsFromSeries(s)[0]!;
    const link = linkFromPair(s, pair)!;

    expect(link.poleA.module).toBe("fizruk");
    expect(link.poleA.label).toBe(messages.crossModuleLink.moduleLabel.fizruk);
    expect(link.poleA.unit).toBe(
      messages.crossModuleLink.metricUnit.workout_volume,
    );
    expect(link.poleB.module).toBe("finyk");
    expect(link.poleB.value).toBe((300).toLocaleString("uk-UA"));
    expect(link.observations).toBe(5);
    expect(link.strength).toBeCloseTo(1, 5);
  });

  it("відкидає пару всередині одного модуля, навіть якщо вона помітна", () => {
    const s = series(
      {
        habit_rate: [10, 20, 30, 40, 50],
        wellbeing: [1, 2, 3, 4, 5],
      },
      5,
    );
    const pair = notablePairsFromSeries(s)[0];
    // Статистика її бачить — форма картки її не бере.
    expect(pair).toBeDefined();
    expect(linkFromPair(s, pair!)).toBeNull();
  });

  it("дрібні лічильники лишають десяткову, великі округляються", () => {
    // `workouts × habit_rate` — курована пара, і вона крос-модульна
    // (Фізрук × Рутина), тож доходить до картки.
    const s = series(
      {
        workouts: [1, 1, 2, 1, 2],
        habit_rate: [10, 20, 30, 40, 50],
      },
      5,
    );
    const pair = notablePairsFromSeries(s)[0];
    expect(pair).toBeDefined();
    const link = linkFromPair(s, pair!)!;
    const values = [link.poleA.value, link.poleB.value];
    // 7/5 = 1.4 — ціле «1» приховало б різницю між «майже щодня» і «через день».
    expect(values).toContain((1.4).toLocaleString("uk-UA"));
    expect(values).toContain((30).toLocaleString("uk-UA"));
  });
});

describe("closestCrossModulePair", () => {
  it("обирає крос-модульну пару з найбільшою кількістю спільних днів", () => {
    const s = series(
      {
        // habit_rate × wellbeing має найбільше спільних днів (5), але вони
        // обидві в Рутині — має перемогти наступна за розміром КРОС-пара.
        habit_rate: [1, 2, 3, 4, 5],
        wellbeing: [1, 2, 3, 4, 5],
        workouts: [1, 1, 1, undefined, undefined],
        kcal: [10, 20, 30, 40, undefined],
      },
      5,
    );
    const best = closestCrossModulePair(s)!;
    expect(isCrossModule(best.a, best.b)).toBe(true);
    expect(best).toMatchObject({ a: "habit_rate", b: "kcal", n: 4 });
  });

  it("на порожніх даних віддає пару з n=0, а не null", () => {
    const best = closestCrossModulePair(series({}, 0));
    expect(best).not.toBeNull();
    expect(best!.n).toBe(0);
    expect(isCrossModule(best!.a, best!.b)).toBe(true);
  });
});

describe("silentPoles", () => {
  it("дає модулі й одиниці без вигаданого числа", () => {
    const { poleA, poleB } = silentPoles("workout_volume", "spending");
    expect(poleA.module).toBe("fizruk");
    expect(poleB.module).toBe("finyk");
    // NaN не має протікати в UI як «NaN».
    expect(poleA.value).toBe("—");
    expect(poleB.value).toBe("—");
  });
});
