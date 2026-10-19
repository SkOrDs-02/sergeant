// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { __resetHubBusForTests, onHubBus } from "@shared/lib/modules/hubBus";
import { writeFinykQuickStatsSnapshot } from "./useFinykQuickStatsWriter";

function tx(id: string, amount: number, time: number): Transaction {
  return { id, amount, time } as Transaction;
}

describe("writeFinykQuickStatsSnapshot", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetHubBusForTests();
  });

  afterEach(() => {
    localStorage.clear();
    __resetHubBusForTests();
  });

  it("persists Kyiv-day spend and notifies the Hub once", () => {
    const updated = vi.fn();
    onHubBus("storageUpdated", updated);
    const nowMs = Date.parse("2026-07-29T12:00:00+03:00");

    const payload = writeFinykQuickStatsSnapshot({
      transactions: [tx("today", -125_000, nowMs - 60_000)],
      planExpense: 5_000,
      nowMs,
    });

    expect(JSON.parse(payload)).toEqual({
      todaySpent: 1250,
      budgetLeft: 3750,
      todayPoints: [[719, 1250]],
      // 29 липня: лишається 3 дні включно з сьогодні, на початок доби весь
      // план 5000 ще вільний → 5000 / 3.
      dayPlan: expect.closeTo(5000 / 3),
    });
    expect(localStorage.getItem(STORAGE_KEYS.FINYK_QUICK_STATS)).toBe(payload);
    expect(updated).toHaveBeenCalledTimes(1);

    writeFinykQuickStatsSnapshot({
      transactions: [tx("today", -125_000, nowMs - 60_000)],
      planExpense: 5_000,
      nowMs,
    });
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it("records the category-limit count only when limits exist", () => {
    const nowMs = Date.parse("2026-07-29T12:00:00+03:00");
    expect(
      JSON.parse(writeFinykQuickStatsSnapshot({ transactions: [], nowMs })),
    ).not.toHaveProperty("limitsCount");
    expect(
      JSON.parse(
        writeFinykQuickStatsSnapshot({
          transactions: [],
          limitsCount: 2,
          nowMs,
        }),
      ).limitsCount,
    ).toBe(2);
  });

  it("excludes internal movements supplied by the canonical storage layer", () => {
    const nowMs = Date.parse("2026-07-29T12:00:00+03:00");
    const payload = writeFinykQuickStatsSnapshot({
      transactions: [
        tx("purchase", -10_000, nowMs - 60_000),
        tx("transfer", -50_000, nowMs - 120_000),
      ],
      excludedTxIds: new Set(["transfer"]),
      nowMs,
    });

    expect(JSON.parse(payload).todaySpent).toBe(100);
  });
  it("shares the exact Finyk formula with regular flows and today's kopecks", () => {
    const nowMs = Date.parse("2026-07-22T12:00:00+03:00");
    const payload = writeFinykQuickStatsSnapshot({
      transactions: [
        tx("before", -200_001, nowMs - 86400000),
        tx("today", -10_055, nowMs),
      ],
      planExpense: 10000,
      subscriptions: [
        {
          id: "rent",
          name: "Rent",
          keyword: "",
          currency: "UAH",
          billingDay: 25,
          expectedAmount: 300000,
        },
      ],
      manualDebts: [
        { id: "debt", amount: 500, totalAmount: 500, dueDate: "2026-07-26" },
      ],
      receivables: [{ id: "return", amount: 1500, dueDate: "2026-07-27" }],
      nowMs,
    });
    const result = JSON.parse(payload);
    expect(result.dayPlan).toBeCloseTo(
      (10000 - 2000.01 - 3000 - 500 + 1500) / 10,
    );
    expect(result.todaySpent).toBe(100.55);
    // Today's spend is removed once by the hero, not amortized in dayPlan.
    expect(result.dayPlan - result.todaySpent).toBeCloseTo(499.449);
  });

  it("keeps a deficit and follows the Kyiv month at a UTC boundary", () => {
    const nowMs = Date.parse("2026-07-31T21:30:00Z"); // August 1 in Kyiv
    const payload = writeFinykQuickStatsSnapshot({
      transactions: [tx("last-month", -999999, nowMs - 3600000)],
      planExpense: 31,
      manualDebts: [
        { id: "bill", amount: 62, totalAmount: 62, dueDate: "2026-08-02" },
      ],
      nowMs,
    });
    expect(JSON.parse(payload).dayPlan).toBe(-1);
  });
});
