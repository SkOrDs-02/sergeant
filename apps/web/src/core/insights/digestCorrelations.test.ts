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
  it("emits the positive phrase for a strong workout_volume↔spending link", () => {
    const out = correlationsFromSeries(
      series(
        {
          spending: [1, 2, 3, 4, 5],
          workout_volume: [10, 20, 30, 40, 50],
        },
        5,
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
          spending: [1, 2, 3, 4, 5],
          workout_volume: [50, 40, 30, 20, 10],
        },
        5,
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("у дні тренувань ти витрачаєш менше");
  });

  it("skips pairs with fewer than 5 common days", () => {
    const out = correlationsFromSeries(
      series(
        {
          spending: [1, 2, 3, 4],
          workout_volume: [10, 20, 30, 40],
        },
        4,
      ),
    );
    expect(out).toEqual([]);
  });

  it("skips weak correlations below the 0.4 threshold", () => {
    const out = correlationsFromSeries(
      series(
        {
          spending: [1, 2, 3, 4, 5, 6],
          // near-orthogonal ordering → |r| well under 0.4
          workout_volume: [3, 1, 4, 1, 5, 2],
        },
        6,
      ),
    );
    expect(out).toEqual([]);
  });

  it("caps at 3 lines when more pairs are notable", () => {
    const ramp = [1, 2, 3, 4, 5, 6];
    const out = correlationsFromSeries(
      series(
        {
          spending: ramp,
          workout_volume: ramp,
          protein: ramp,
          kcal: ramp,
          habit_rate: ramp,
          weight: ramp,
        },
        6,
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
          habit_rate: [10, 30, 50, 70, 90],
          wellbeing: [1, 2, 3, 4, 5],
        },
        5,
      ),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("коли тримаєш звички, почуваєшся краще");
  });

  it("skips the expanded workouts↔habit_rate pair below the threshold", () => {
    const out = correlationsFromSeries(
      series(
        {
          // Same near-orthogonal ordering as the spending↔workout_volume
          // weak-correlation case above → |r| well under 0.4.
          workouts: [1, 2, 3, 4, 5, 6],
          habit_rate: [3, 1, 4, 1, 5, 2],
        },
        6,
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
