// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildCrossModuleSeries,
  buildDigestCorrelations,
  correlationsFromSeries,
  WINDOW_DAYS,
} from "./digestCorrelations";
import type { DailySeries } from "../lib/chatActions/crossActions/dailySeries";
import type { DailyMetric } from "../lib/chatActions/crossActions/dailySeries";

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

describe("correlationsFromSeries", () => {
  // Фікстури тримають рівно MIN_N=10 днів: поріг мовчання піднято з 5 після
  // закриття бети, і на коротших рядах пара мовчить незалежно від сили
  // звʼязку. Береш ці кейси за зразок — не вкорочуй ряд, інакше тест почне
  // зеленіти з причини «замало днів», а не з тієї, яку перевіряє.
  const RAMP_10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  // Зигзаг проти рампи: |r| ≈ 0.17, тобто впевнено під NOTABLE_R.
  const ZIGZAG_10 = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];

  it("emits the positive phrase for a strong workout_volume↔spending link", () => {
    const out = correlationsFromSeries(
      series(
        {
          spending: RAMP_10,
          workout_volume: RAMP_10.map((n) => n * 10),
        },
        10,
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("у дні тренувань ти витрачаєш більше");
    expect(out[0]).toContain("r=1.00");
  });

  it("emits the negative phrase for an inverse link", () => {
    const out = correlationsFromSeries(
      series(
        {
          spending: RAMP_10,
          workout_volume: [...RAMP_10].reverse().map((n) => n * 10),
        },
        10,
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("у дні тренувань ти витрачаєш менше");
  });

  it("skips pairs with fewer than MIN_N common days", () => {
    // Рівно на день коротше за поріг, і з |r| = 1: мовчання має вирішувати
    // саме довжина ряду, а не сила звʼязку.
    const nine = RAMP_10.slice(0, 9);
    const out = correlationsFromSeries(
      series(
        {
          spending: nine,
          workout_volume: nine.map((n) => n * 10),
        },
        9,
      ),
    );
    expect(out).toEqual([]);
  });

  it("skips weak correlations below the 0.4 threshold", () => {
    const out = correlationsFromSeries(
      series(
        {
          spending: RAMP_10,
          workout_volume: ZIGZAG_10,
        },
        10,
      ),
    );
    expect(out).toEqual([]);
  });

  it("caps at 3 lines when more pairs are notable", () => {
    const out = correlationsFromSeries(
      series(
        {
          spending: RAMP_10,
          workout_volume: RAMP_10,
          protein: RAMP_10,
          kcal: RAMP_10,
          habit_rate: RAMP_10,
          weight: RAMP_10,
        },
        10,
      ),
    );
    expect(out).toHaveLength(3);
    // With all |r|=1 and stable order, the 4th pair (weight↔kcal) is dropped.
    expect(out.join("\n")).not.toContain("вага росте");
  });

  it("emits the expanded wellbeing↔habit_rate pair above the threshold", () => {
    const out = correlationsFromSeries(
      series(
        {
          habit_rate: RAMP_10.map((n) => n * 10),
          wellbeing: RAMP_10,
        },
        10,
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("коли тримаєш звички, почуваєшся краще");
  });

  it("skips the expanded workouts↔habit_rate pair below the threshold", () => {
    const out = correlationsFromSeries(
      series(
        {
          // Той самий зигзаг проти рампи, що й у слабкій парі вище.
          workouts: RAMP_10,
          habit_rate: ZIGZAG_10,
        },
        10,
      ),
    );
    expect(out).toEqual([]);
  });
});

describe("buildCrossModuleSeries — вікно в календарних днях", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  /*
   * Регресія: початок вікна рахувався відніманням 59×24 год від моменту
   * часу, а не 59 календарних днів. На переході Києва на літній час доба
   * коротша за 24 год, тож вікно «зʼїдало» зайвий день і давало 61 ключ.
   *
   * 2026-03-29 — останній тиждень березня, перехід на EEST (UTC+3).
   * Момент нижче — 31 березня 21:30 UTC, тобто вже 1 квітня 00:30 у Києві.
   * Старий код відкидав 59×24 год і потрапляв на 31 січня (у січні ще
   * UTC+2), новий рахує календарно й дає 1 лютого.
   */
  it("дає рівно 60 ключів на вікні, що перетинає перехід на літній час", () => {
    const series = buildCrossModuleSeries(Date.UTC(2026, 2, 31, 21, 30));

    expect(series.to).toBe("2026-04-01");
    expect(series.from).toBe("2026-02-01");
    expect(series.days).toHaveLength(WINDOW_DAYS);
  });
});

describe("buildDigestCorrelations", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00"));
  });
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("returns [] with empty stores (no crash)", () => {
    expect(buildDigestCorrelations()).toEqual([]);
  });
});
