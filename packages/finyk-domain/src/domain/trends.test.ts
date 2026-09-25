import { describe, expect, it } from "vitest";
import {
  buildMonthlyTrend,
  getAverageMonthlySpendMinor,
  getCategoryDeltas,
  getSavingsRate,
} from "./trends";
import type { Transaction } from "./types";

function tx(
  id: string,
  amount: number,
  date: Date,
  description = "АТБ",
  mcc = 5411,
): Transaction {
  return {
    id,
    amount,
    date: date.toISOString().slice(0, 10),
    categoryId: "",
    type: amount < 0 ? "expense" : "income",
    source: "manual",
    time: Math.floor(date.getTime() / 1000),
    description,
    mcc,
    accountId: null,
    manual: true,
    _source: "manual",
    _accountId: null,
    _manual: true,
  };
}

const now = new Date("2026-09-15T09:00:00Z");

describe("buildMonthlyTrend", () => {
  it("починається з першого місяця з записами, а не з дванадцяти нулів", () => {
    const points = buildMonthlyTrend(
      [
        tx("a", -10_050, new Date("2026-07-10T09:00:00Z")),
        tx("b", -20_000, new Date("2026-09-02T09:00:00Z")),
        tx("c", 500_000, new Date("2026-09-03T09:00:00Z")),
      ],
      { now },
    );
    expect(points).toEqual([
      { month: "2026-07", spentMinor: 10_050, txCount: 1, isCurrent: false },
      { month: "2026-08", spentMinor: 0, txCount: 0, isCurrent: false },
      { month: "2026-09", spentMinor: 20_000, txCount: 2, isCurrent: true },
    ]);
  });

  it("тримає вікно в дванадцять місяців і рахує межу місяця за Києвом", () => {
    const points = buildMonthlyTrend(
      [
        tx("old", -100, new Date("2025-01-10T09:00:00Z")),
        // 31 серпня 22:30 UTC = 1 вересня 01:30 за Києвом.
        tx("edge", -700, new Date("2026-08-31T22:30:00Z")),
      ],
      { now },
    );
    expect(points).toHaveLength(12);
    expect(points[0]?.month).toBe("2025-10");
    expect(points.at(-1)).toMatchObject({ month: "2026-09", spentMinor: 700 });
  });

  it("категорійний тренд бере лише витрати категорії та поважає виключені", () => {
    const points = buildMonthlyTrend(
      [
        tx("food", -30_000, new Date("2026-09-02T09:00:00Z"), "АТБ", 5411),
        tx("cafe", -12_345, new Date("2026-09-03T09:00:00Z"), "Кава", 5814),
        tx("gone", -99_900, new Date("2026-09-04T09:00:00Z"), "АТБ", 5411),
      ],
      { now, categoryId: "food", excludedTxIds: ["gone"] },
    );
    expect(points).toEqual([
      { month: "2026-09", spentMinor: 30_000, txCount: 2, isCurrent: true },
    ]);
  });

  it("порожній список дає порожній тренд", () => {
    expect(buildMonthlyTrend([], { now })).toEqual([]);
  });
});

describe("getAverageMonthlySpendMinor", () => {
  it("рахує лише завершені місяці з записами", () => {
    expect(
      getAverageMonthlySpendMinor([
        { month: "2026-06", spentMinor: 10_000, txCount: 3, isCurrent: false },
        { month: "2026-07", spentMinor: 0, txCount: 0, isCurrent: false },
        { month: "2026-08", spentMinor: 20_001, txCount: 5, isCurrent: false },
        { month: "2026-09", spentMinor: 99_999, txCount: 9, isCurrent: true },
      ]),
    ).toBe(15_000.5);
  });

  it("без завершених місяців повертає null", () => {
    expect(
      getAverageMonthlySpendMinor([
        { month: "2026-09", spentMinor: 5_000, txCount: 1, isCurrent: true },
      ]),
    ).toBeNull();
  });
});

describe("getSavingsRate", () => {
  it("дохід 42 000 і витрати 2 840,40 дають 93,24 %", () => {
    expect(getSavingsRate(4_200_000, 284_040)).toBeCloseTo(93.237, 3);
  });

  it("без доходу повертає null, а перевитрата дає від'ємний відсоток", () => {
    expect(getSavingsRate(0, 1_000)).toBeNull();
    expect(getSavingsRate(10_000, 15_000)).toBe(-50);
  });
});

describe("getCategoryDeltas", () => {
  it("зводить категорії двох місяців і рахує дельту за Р4", () => {
    const curr = [
      tx("c1", -80_750, new Date("2026-09-02T09:00:00Z"), "АТБ", 5411),
      tx("c2", -1_000, new Date("2026-09-03T09:00:00Z"), "Кава", 5814),
    ];
    const prev = [
      tx("p1", -24_750, new Date("2026-08-02T09:00:00Z"), "АТБ", 5411),
      tx("p2", -259_340, new Date("2026-08-05T09:00:00Z"), "Кава", 5814),
    ];
    const rows = getCategoryDeltas(curr, prev);
    expect(rows.map((r) => r.categoryId)).toEqual(["food", "restaurant"]);
    const [food, cafe] = rows;
    expect(food).toMatchObject({ currentMinor: 80_750, prevMinor: 24_750 });
    expect(food?.delta.pct).toBeCloseTo(226.26, 2);
    expect(cafe?.delta.diffMinor).toBe(1_000 - 259_340);
    expect(cafe?.delta.pct).toBeCloseTo(-99.61, 2);
    expect(food?.label).toBe("Продукти");
  });

  it("категорія лише в минулому місяці лишається з нулем поточного", () => {
    const rows = getCategoryDeltas(
      [],
      [tx("p", -5_000, new Date("2026-08-02T09:00:00Z"), "АТБ", 5411)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ currentMinor: 0, prevMinor: 5_000 });
  });
});
