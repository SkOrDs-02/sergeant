import { describe, it, expect } from "vitest";
import { dailySpendSeries } from "./dailySpendSeries.js";
import { INTERNAL_TRANSFER_ID } from "../constants";

// Noon UTC in June (Kyiv is UTC+3, summer) lands safely inside the same
// Kyiv calendar day regardless of the CI runner's own timezone.
const day = (d: number) => Date.UTC(2026, 5, d, 12, 0, 0);

const JUNE_WINDOW = {
  year: 2026,
  month: 6,
  daysInMonth: 30,
};

interface MakeTx {
  id: string;
  amount: number;
  time?: number;
}

function tx(t: MakeTx): MakeTx {
  return { time: day(12), ...t };
}

describe("dailySpendSeries", () => {
  it("returns daysInMonth elements, chronological, zero-filled by default", () => {
    const series = dailySpendSeries([], JUNE_WINDOW);
    expect(series).toHaveLength(30);
    expect(series[0]).toEqual({ dayKey: "2026-06-01", spent: 0 });
    expect(series[29]).toEqual({ dayKey: "2026-06-30", spent: 0 });
    expect(series.every((d) => d.spent === 0)).toBe(true);
  });

  it("returns 31 elements for a 31-day month", () => {
    const series = dailySpendSeries([], {
      year: 2026,
      month: 7,
      daysInMonth: 31,
    });
    expect(series).toHaveLength(31);
    expect(series[30]?.dayKey).toBe("2026-07-31");
  });

  it("groups by the Kyiv calendar day, not raw UTC", () => {
    // 2026-06-12T22:30:00Z is already 2026-06-13 in Kyiv (UTC+3 summer).
    const lateUtc = Date.UTC(2026, 5, 12, 22, 30, 0);
    const series = dailySpendSeries(
      [tx({ id: "a", amount: -10_000, time: lateUtc })],
      JUNE_WINDOW,
    );
    const d12 = series.find((d) => d.dayKey === "2026-06-12");
    const d13 = series.find((d) => d.dayKey === "2026-06-13");
    expect(d12?.spent).toBe(0);
    expect(d13?.spent).toBe(100);
  });

  it("sums same-day expenses in UAH, rounded", () => {
    const series = dailySpendSeries(
      [
        tx({ id: "a", amount: -10_000, time: day(12) }),
        tx({ id: "b", amount: -25_050, time: day(12) }),
      ],
      JUNE_WINDOW,
    );
    const d12 = series.find((d) => d.dayKey === "2026-06-12");
    expect(d12?.spent).toBe(351); // 100 + 250.50 rounded
  });

  it("ignores income (positive-amount) transactions", () => {
    const series = dailySpendSeries(
      [tx({ id: "income", amount: 50_000, time: day(12) })],
      JUNE_WINDOW,
    );
    expect(series.every((d) => d.spent === 0)).toBe(true);
  });

  it("excludes ids in excludedTxIds — the same set that already gates spent in useOverviewData, incl. confirmed internal transfers", () => {
    const series = dailySpendSeries(
      [
        tx({ id: "keep", amount: -10_000, time: day(12) }),
        tx({ id: "hidden", amount: -20_000, time: day(12) }),
        // Represents a confirmed internal transfer: the predicate never
        // reimplements transfer detection, it just trusts excludedTxIds —
        // by the time an id lands there, `useOverviewData` already decided.
        tx({ id: "transfer", amount: -30_000, time: day(12) }),
      ],
      JUNE_WINDOW,
      { excludedTxIds: new Set(["hidden", "transfer"]) },
    );
    const d12 = series.find((d) => d.dayKey === "2026-06-12");
    expect(d12?.spent).toBe(100);
  });

  it("respects txSplits, excluding the internal-transfer part of a split", () => {
    const series = dailySpendSeries(
      [tx({ id: "split-1", amount: -50_000, time: day(12) })],
      JUNE_WINDOW,
      {
        txSplits: {
          "split-1": [
            { categoryId: "food", amount: 200 },
            { categoryId: INTERNAL_TRANSFER_ID, amount: 300 },
          ],
        },
      },
    );
    const d12 = series.find((d) => d.dayKey === "2026-06-12");
    expect(d12?.spent).toBe(200);
  });

  it("drops rows with no usable timestamp instead of bucketing them under day 0", () => {
    const series = dailySpendSeries(
      [{ id: "no-time", amount: -10_000 }],
      JUNE_WINDOW,
    );
    expect(series.every((d) => d.spent === 0)).toBe(true);
  });

  it("empty month (no transactions) gives ratio-safe zeros, not NaN", () => {
    const series = dailySpendSeries(null, JUNE_WINDOW);
    expect(series).toHaveLength(30);
    expect(series.every((d) => Number.isFinite(d.spent) && d.spent === 0)).toBe(
      true,
    );
  });
});
