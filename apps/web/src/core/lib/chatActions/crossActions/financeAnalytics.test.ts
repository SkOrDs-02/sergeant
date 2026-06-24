// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lsSet } from "../../hubChatUtils";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../../modules/finyk/lib/sqliteReader";
import {
  spendingTrend,
  categoryBreakdown,
  detectAnomalies,
} from "./financeAnalytics";

// A fixed "now" so day-window maths is deterministic.
const NOW = new Date("2026-06-15T12:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);
const dayAgo = (n: number): number => nowSec - n * 86400;

beforeEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  __setFinykSqliteStateCacheForTests({});
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  vi.useRealTimers();
});

describe("spendingTrend", () => {
  it("summarises current vs previous period with default 30-day window", () => {
    // amounts are kopiykas; getTxStatAmount → abs(amount)/100.
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -50000, time: dayAgo(2) }, // current: 500 грн expense
        { id: "b", amount: 100000, time: dayAgo(3) }, // current: 1000 грн income
        { id: "c", amount: -20000, time: dayAgo(40) }, // prev: 200 грн expense
      ],
    });
    const out = spendingTrend({ name: "spending_trend", input: {} });
    expect(out).toContain("Тренд витрат за 30 днів:");
    expect(out).toContain("Витрати: 500 грн");
    expect(out).toContain("Дохід: 1000 грн");
    expect(out).toContain("Попередній період: 200 грн");
    // change = (500-200)/200*100 = +150%
    expect(out).toContain("Зміна: +150%");
    expect(out).toContain("Транзакцій: 2");
  });

  it("respects a custom period_days window", () => {
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -10000, time: dayAgo(2) }, // inside 7d
        { id: "b", amount: -10000, time: dayAgo(10) }, // outside 7d (prev window)
      ],
    });
    const out = spendingTrend({
      name: "spending_trend",
      input: { period_days: 7 },
    });
    expect(out).toContain("Тренд витрат за 7 днів:");
    expect(out).toContain("Транзакцій: 1");
  });

  it("excludes hidden transactions", () => {
    __setFinykSqliteStateCacheForTests({ hiddenTransactions: ["a"] });
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -50000, time: dayAgo(1) },
        { id: "b", amount: -10000, time: dayAgo(1) },
      ],
    });
    const out = spendingTrend({ name: "spending_trend", input: {} });
    expect(out).toContain("Витрати: 100 грн");
    expect(out).toContain("Транзакцій: 1");
  });

  it("change is 0% when there were no previous-period expenses", () => {
    lsSet("finyk_tx_cache", {
      txs: [{ id: "a", amount: -30000, time: dayAgo(1) }],
    });
    const out = spendingTrend({ name: "spending_trend", input: {} });
    // change defaults to 0 (no prev expenses) and is rendered with a leading "+".
    expect(out).toContain("Зміна: +0%");
  });

  it("handles an empty / missing cache gracefully", () => {
    const out = spendingTrend({ name: "spending_trend", input: {} });
    expect(out).toContain("Витрати: 0 грн");
    expect(out).toContain("Транзакцій: 0");
  });
});

describe("categoryBreakdown", () => {
  it("aggregates expenses by category and lists percentages", () => {
    // Assign explicit categories via the SQLite txCategories map so we don't
    // depend on MCC/description heuristics.
    __setFinykSqliteStateCacheForTests({
      txCategories: { a: "food", b: "food", c: "transport" },
    });
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -30000, time: dayAgo(1) }, // food 300
        { id: "b", amount: -10000, time: dayAgo(1) }, // food 100
        { id: "c", amount: -10000, time: dayAgo(1) }, // transport 100
      ],
    });
    const out = categoryBreakdown({
      name: "category_breakdown",
      input: {},
    });
    expect(out).toContain("Витрати по категоріях за 30 днів");
    // total = 500 грн
    expect(out).toContain("(500 грн)");
    // food 400 → 80%
    expect(out).toMatch(/400 грн \(80%\)/);
  });

  it("ignores income-only / empty data without throwing", () => {
    lsSet("finyk_tx_cache", { txs: [] });
    const out = categoryBreakdown({
      name: "category_breakdown",
      input: { period_days: 7 },
    });
    expect(out).toContain("Витрати по категоріях за 7 днів");
    expect(out).toContain("(0 грн)");
  });

  it("excludes transactions outside the window", () => {
    __setFinykSqliteStateCacheForTests({ txCategories: { a: "food" } });
    lsSet("finyk_tx_cache", {
      txs: [{ id: "a", amount: -30000, time: dayAgo(99) }],
    });
    const out = categoryBreakdown({
      name: "category_breakdown",
      input: { period_days: 30 },
    });
    expect(out).toContain("(0 грн)");
  });
});

describe("detectAnomalies", () => {
  it("reports insufficient data with fewer than 3 expenses", () => {
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -10000, time: dayAgo(1) },
        { id: "b", amount: -10000, time: dayAgo(1) },
      ],
    });
    const out = detectAnomalies({ name: "detect_anomalies", input: {} });
    expect(out).toBe("Недостатньо транзакцій для аналізу аномалій.");
  });

  it("flags an outlier above the threshold multiplier", () => {
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -10000, time: dayAgo(1), description: "Кава" }, // 100
        { id: "b", amount: -10000, time: dayAgo(2), description: "Обід" }, // 100
        { id: "c", amount: -10000, time: dayAgo(3), description: "Таксі" }, // 100
        { id: "d", amount: -500000, time: dayAgo(4), description: "Ноут" }, // 5000
      ],
    });
    const out = detectAnomalies({
      name: "detect_anomalies",
      input: { threshold_multiplier: 2 },
    });
    expect(out).toContain("Аномальні витрати за 30 днів");
    expect(out).toContain("Ноут");
    expect(out).toContain("5000 грн");
  });

  it("reports no anomalies when all expenses are similar", () => {
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -10000, time: dayAgo(1) },
        { id: "b", amount: -11000, time: dayAgo(2) },
        { id: "c", amount: -9000, time: dayAgo(3) },
      ],
    });
    const out = detectAnomalies({
      name: "detect_anomalies",
      input: { threshold_multiplier: 5 },
    });
    expect(out).toContain("аномалій не виявлено");
    expect(out).toContain("середня витрата");
  });

  it("uses default threshold of 3 and shows '(без опису)' fallback", () => {
    lsSet("finyk_tx_cache", {
      txs: [
        { id: "a", amount: -10000, time: dayAgo(1) },
        { id: "b", amount: -10000, time: dayAgo(2) },
        { id: "c", amount: -10000, time: dayAgo(3) },
        { id: "d", amount: -1000000, time: dayAgo(4) }, // no description
      ],
    });
    const out = detectAnomalies({ name: "detect_anomalies", input: {} });
    expect(out).toContain("поріг ×3");
    expect(out).toContain("(без опису)");
  });
});
