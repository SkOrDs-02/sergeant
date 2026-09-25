import { describe, expect, it } from "vitest";
import { buildWeekReport } from "./weekReport";
import type { Budget, Transaction } from "./types";

function tx(id: string, amount: number, iso: string, mcc = 5411): Transaction {
  const date = new Date(iso);
  return {
    id,
    amount,
    date: iso.slice(0, 10),
    categoryId: "",
    type: amount < 0 ? "expense" : "income",
    source: "manual",
    time: Math.floor(date.getTime() / 1000),
    description: "tx",
    mcc,
    accountId: null,
    manual: true,
    _source: "manual",
    _accountId: null,
    _manual: true,
  };
}

const now = new Date("2026-09-20T09:00:00Z");

describe("buildWeekReport", () => {
  it("найбільша категорія тижня і найбільше зростання проти минулого тижня", () => {
    const report = buildWeekReport(
      [
        // Цей тиждень: 14-20 вересня.
        tx("f1", -50_000, "2026-09-18T09:00:00Z", 5411),
        tx("c1", -30_000, "2026-09-19T09:00:00Z", 5814),
        // Минулий тиждень: 7-13 вересня.
        tx("f0", -45_000, "2026-09-10T09:00:00Z", 5411),
        tx("c0", -10_000, "2026-09-12T09:00:00Z", 5814),
        // Поза обома вікнами.
        tx("old", -99_900, "2026-09-01T09:00:00Z", 5814),
      ],
      { now },
    );
    expect(report.hasRecords).toBe(true);
    expect(report.top).toMatchObject({
      categoryId: "food",
      spentMinor: 50_000,
    });
    expect(report.growth).toMatchObject({
      categoryId: "restaurant",
      spentMinor: 30_000,
      prevMinor: 10_000,
      delta: { diffMinor: 20_000, pct: 200 },
    });
  });

  it("категорія без минулого тижня не рахується зростанням", () => {
    const report = buildWeekReport(
      [tx("c1", -30_000, "2026-09-19T09:00:00Z", 5814)],
      { now },
    );
    expect(report.growth).toBeNull();
  });

  it("порожній тиждень: hasRecords false, фактів немає", () => {
    const report = buildWeekReport(
      [tx("f0", -45_000, "2026-09-10T09:00:00Z")],
      { now },
    );
    expect(report).toMatchObject({
      hasRecords: false,
      top: null,
      growth: null,
    });
  });

  it("обирає ліміт із найгіршим темпом", () => {
    const budgets = [
      { id: "b1", type: "limit", categoryId: "food", limit: 5_000 },
      { id: "b2", type: "limit", categoryId: "restaurant", limit: 1_000 },
    ] as Budget[];
    const report = buildWeekReport(
      [
        tx("f1", -100_000, "2026-09-18T09:00:00Z", 5411),
        tx("c1", -90_000, "2026-09-19T09:00:00Z", 5814),
      ],
      { now, budgets },
    );
    expect(report.limit?.budget.id).toBe("b2");
  });
});
