import { describe, it, expect } from "vitest";
import { computeFinykQuickStats } from "./quickStats.js";

// Kyiv is UTC+3 in July (summer time), so a Kyiv calendar day starts at
// 21:00Z of the previous UTC day. These boundaries are what the web writer
// derives via `parseKyivDate` — hardcoded here to pin the day-boundary math.
const todayStartMs = Date.UTC(2026, 6, 22, 21, 0, 0); // Kyiv 2026-07-23 00:00
const todayEndMs = Date.UTC(2026, 6, 23, 21, 0, 0); // Kyiv 2026-07-24 00:00
const monthStartMs = Date.UTC(2026, 5, 30, 21, 0, 0); // Kyiv 2026-07-01 00:00

// `time` is unix seconds (Transaction shape); `amount` is kopiykas, negative
// for a spend. 100 UAH === -10000 kopiykas.
const secAt = (ms: number) => Math.floor(ms / 1000);
const spend = (id: string, ms: number, uah: number) => ({
  id,
  time: secAt(ms),
  amount: -uah * 100,
});

describe("computeFinykQuickStats", () => {
  const txs = [
    spend("today-morning", Date.UTC(2026, 6, 23, 7, 0, 0), 300), // Kyiv 07-23 10:00
    spend("today-midnight-edge", todayStartMs, 200), // exactly today start → counts today
    spend("yesterday-late", todayStartMs - 60_000, 100), // 1 min before Kyiv midnight → month only
    spend("earlier-month", Date.UTC(2026, 6, 10, 9, 0, 0), 500), // 07-10 → month only
    {
      id: "income",
      time: secAt(Date.UTC(2026, 6, 23, 8, 0, 0)),
      amount: 90000,
    }, // positive → ignored
  ];

  it("counts only today's spend for todaySpent (Kyiv day boundary, start-inclusive/end-exclusive)", () => {
    const { todaySpent } = computeFinykQuickStats({
      transactions: txs,
      todayStartMs,
      todayEndMs,
      monthStartMs,
    });
    // 300 (today) + 200 (exactly at Kyiv midnight) — the 23:59 tx is excluded.
    expect(todaySpent).toBe(500);
  });

  it("computes budgetLeft as plan minus month-to-date spend", () => {
    const { budgetLeft } = computeFinykQuickStats({
      transactions: txs,
      planExpense: 5000,
      todayStartMs,
      todayEndMs,
      monthStartMs,
    });
    // month spend = 300 + 200 + 100 + 500 = 1100 → 5000 - 1100 = 3900
    expect(budgetLeft).toBe(3900);
  });

  it("returns budgetLeft null when no monthly plan is set", () => {
    const { budgetLeft } = computeFinykQuickStats({
      transactions: txs,
      planExpense: 0,
      todayStartMs,
      todayEndMs,
      monthStartMs,
    });
    expect(budgetLeft).toBeNull();
  });

  it("honours excludedTxIds", () => {
    const { todaySpent } = computeFinykQuickStats({
      transactions: txs,
      excludedTxIds: ["today-midnight-edge"],
      todayStartMs,
      todayEndMs,
      monthStartMs,
    });
    expect(todaySpent).toBe(300);
  });

  it("returns zero / null for an empty stream", () => {
    expect(
      computeFinykQuickStats({
        transactions: [],
        todayStartMs,
        todayEndMs,
        monthStartMs,
      }),
    ).toEqual({ todaySpent: 0, budgetLeft: null });
  });
});
