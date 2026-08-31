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
  pairwiseDays,
  isCrossModule,
  linkFromPair,
  closestCrossModulePair,
  silentPoles,
} from "./crossModuleLinkData";
import { formatNumberUk } from "@sergeant/shared";

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

describe("pairwiseDays", () => {
  it("віддає лише спільні дні, найновіші перші", () => {
    const out = pairwiseDays(
      series(
        {
          spending: [100, 200, 999, undefined, 300],
          workout_volume: [10, 20, undefined, 999, 30],
        },
        5,
      ),
      "spending",
      "workout_volume",
    );

    // Дні 3 і 4 мають лише одну метрику — у список не потрапляють, як і в
    // середні: обидва числа на картці описують ту саму множину днів.
    expect(out.map((d) => d.key)).toEqual([
      "2026-01-05",
      "2026-01-02",
      "2026-01-01",
    ]);
    expect(out[0]).toMatchObject({
      valueA: formatNumberUk(300),
      valueB: formatNumberUk(30),
    });
  });

  it("порожній список, коли спільних днів немає", () => {
    expect(
      pairwiseDays(
        series({ spending: [1, undefined], kcal: [undefined, 2] }, 2),
        "spending",
        "kcal",
      ),
    ).toEqual([]);
  });

  it("кількість днів збігається з `n`, який показує картка", () => {
    // Смуга доказів обіцяє «N спостережень» — розгорнутий список має
    // містити рівно стільки рядків, інакше перевірка спростовує підпис.
    const s = series(
      {
        spending: [100, 200, 300, undefined, 500],
        workout_volume: [10, 20, 30, 40, undefined],
      },
      5,
    );
    const means = pairwiseMeans(s, "spending", "workout_volume")!;
    expect(pairwiseDays(s, "spending", "workout_volume")).toHaveLength(means.n);
  });
});

describe("isCrossModule", () => {
  it("пара всередині одного модуля не є крос-модульною", () => {
    // Обидві метрики належать Фізруку — саме та пара з курованого набору,
    // яка легітимна для рядка дайджесту, але не для картки звʼязку.
    expect(isCrossModule("workout_volume", "wellbeing")).toBe(false);
    expect(isCrossModule("kcal", "protein")).toBe(false);
  });

  it("пара через межу модулів є крос-модульною", () => {
    expect(isCrossModule("workout_volume", "spending")).toBe(true);
    expect(isCrossModule("habit_rate", "kcal")).toBe(true);
  });

  it("самопочуття належить Фізруку, а не Рутині", () => {
    // Регресія: `wellbeing` пишеться в щоденник Фізрука
    // (`fizrukActions/wellbeing.ts`), звідки береться й вага. Коли воно
    // помилково рахувалось за Рутину, фільтр перевертався на двох парах:
    // `habit_rate × wellbeing` дарма відкидалась, `workout_volume ×
    // wellbeing` дарма проходила.
    expect(isCrossModule("habit_rate", "wellbeing")).toBe(true);
    expect(isCrossModule("weight", "wellbeing")).toBe(false);
  });
});

describe("linkFromPair", () => {
  it("будує два полюси з модулями, числами й одиницями", () => {
    const s = series(
      {
        spending: [100, 200, 300, 400, 500, 100, 200, 300, 400, 500],
        workout_volume: [10, 20, 30, 40, 50, 10, 20, 30, 40, 50],
      },
      10,
    );
    const pair = notablePairsFromSeries(s)[0]!;
    const link = linkFromPair(s, pair)!;

    expect(link.poleA.module).toBe("fizruk");
    expect(link.poleA.label).toBe(messages.crossModuleLink.moduleLabel.fizruk);
    expect(link.poleA.unit).toBe(
      messages.crossModuleLink.metricUnit.workout_volume,
    );
    expect(link.poleB.module).toBe("finyk");
    expect(link.poleB.value).toBe(formatNumberUk(300));
    expect(link.observations).toBe(10);
    expect(link.strength).toBeCloseTo(1, 5);
  });

  it("протилежні за знаком кореляції дають РІЗНІ формулювання", () => {
    // Зауваження власника 2026-08-05: без фрази картка при r=+0.74 і
    // r=−0.74 виглядала однаково (полюси, місток, ступінь — усе те саме),
    // тож два користувачі робили з неї протилежні висновки. Цей тест
    // фіксує, що напрямок таки доходить до UI.
    const rising = series(
      {
        spending: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
        workout_volume: [10, 20, 30, 40, 50, 10, 20, 30, 40, 50],
      },
      10,
    );
    const falling = series(
      {
        spending: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
        workout_volume: [50, 40, 30, 20, 10, 50, 40, 30, 20, 10],
      },
      10,
    );

    const up = linkFromPair(rising, notablePairsFromSeries(rising)[0]!)!;
    const down = linkFromPair(falling, notablePairsFromSeries(falling)[0]!)!;

    expect(up.phrase).toBeTruthy();
    expect(down.phrase).toBeTruthy();
    expect(up.phrase).not.toBe(down.phrase);
    expect(up.strength).toBeGreaterThan(0);
    expect(down.strength).toBeLessThan(0);
    // Велика літера: на картці це самостійне речення, не хвіст рядка.
    expect(up.phrase![0]).toBe(up.phrase![0]!.toUpperCase());
  });

  it("відкидає пару всередині одного модуля, навіть якщо вона помітна", () => {
    // Обидві в Фізруку: обʼєм тренування й самопочуття з того самого
    // щоденника.
    const s = series(
      {
        workout_volume: [
          1000, 2000, 3000, 4000, 5000, 1000, 2000, 3000, 4000, 5000,
        ],
        wellbeing: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5],
      },
      10,
    );
    const pair = notablePairsFromSeries(s)[0];
    // Статистика її бачить — форма картки її не бере.
    expect(pair).toBeDefined();
    expect(linkFromPair(s, pair!)).toBeNull();
  });

  it("дрібні лічильники лишають десяткову, великі округляються", () => {
    // `kcal × wellbeing` — курована пара, крос-модульна (Їжа × Фізрук).
    // Самопочуття це бал 1–5, тобто дрібне число поруч із калоріями.
    const s = series(
      {
        kcal: [1800, 2000, 2200, 2100, 2300, 1800, 2000, 2200, 2100, 2300],
        wellbeing: [3, 4, 5, 4, 5, 3, 4, 5, 4, 5],
      },
      10,
    );
    const pair = notablePairsFromSeries(s)[0];
    expect(pair).toBeDefined();
    const link = linkFromPair(s, pair!)!;
    const values = [link.poleA.value, link.poleB.value];
    // 21/5 = 4.2 — ціле «4» стерло б різницю між «стабільно добре» і «так собі».
    expect(values).toContain(formatNumberUk(4.2));
    expect(values).toContain(formatNumberUk(2080));
  });
});

describe("closestCrossModulePair", () => {
  it("обирає крос-модульну пару з найбільшою кількістю спільних днів", () => {
    const s = series(
      {
        // workout_volume × wellbeing має найбільше спільних днів (5), але
        // обидві в Фізруку — має перемогти наступна за розміром КРОС-пара.
        workout_volume: [1, 2, 3, 4, 5],
        wellbeing: [1, 2, 3, 4, 5],
        habit_rate: [1, 2, 3, 4, undefined],
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
