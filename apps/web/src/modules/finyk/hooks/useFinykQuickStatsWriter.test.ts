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
});
