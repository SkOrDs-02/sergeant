// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../modules/finyk/lib/sqliteReader";
import { buildFinanceContext } from "./financeContext";

// Fixed clock so monthStart is deterministic across runs.
const FIXED_NOW = new Date("2026-04-15T10:30:00.000Z");

// ── Mirror mock ──────────────────────────────────────────────────────────────
// Dualwrite-teardown Phase 3: bank transactions are now sourced from the Mono
// mirror reader instead of `finyk_tx_cache` LS. Tests provide transactions via
// this mock rather than localStorage.

const mockMirrorTransactions: Array<Record<string, unknown>> = [];
vi.mock("../../../modules/finyk/lib/monoMirrorReader", () => {
  // Стан визначений УСЕРЕДИНІ фабрики: vi.mock хойститься, зовнішній
  // const тут ще не ініціалізований (TDZ); масив-фікстуру читаємо лише
  // в момент виклику геттера — це безпечно.
  const state = () => ({
    transactions: mockMirrorTransactions,
    accounts: [],
    refreshedAt:
      mockMirrorTransactions.length > 0
        ? new Date("2026-04-15T10:30:00.000Z").toISOString()
        : null,
  });
  return {
    // financeContext читає visible-варіант (без транзакцій прихованих
    // карток); у моку обидва геттери віддають один і той самий стан.
    getCachedFinykMonoMirrorState: state,
    getVisibleFinykMonoMirrorState: state,
  };
});

function setMirrorTxs(txs: Array<Record<string, unknown>>) {
  mockMirrorTransactions.length = 0;
  mockMirrorTransactions.push(...txs);
}

// Ручні записи й бюджети живуть у SQLite (`finyk_manual_expenses_v1` і
// `finyk_budgets` у LS tombstoned і дренаються на буті), тож сіються в
// теплий кеш, а не в localStorage. Решта prefs у цих тестах порожня.
type SqliteSeed = Parameters<typeof __setFinykSqliteStateCacheForTests>[0];
function seedSqlite(partial: Record<string, unknown>) {
  __setFinykSqliteStateCacheForTests(partial as SqliteSeed);
}

// ────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  mockMirrorTransactions.length = 0;
  clearFinykSqliteCache();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  mockMirrorTransactions.length = 0;
  clearFinykSqliteCache();
});

describe("buildFinanceContext — defaults", () => {
  it("returns sane empty defaults when no data is present", () => {
    const ctx = buildFinanceContext();
    expect(ctx.now.toISOString()).toBe(FIXED_NOW.toISOString());
    // `monthStart` is the *local* first-of-month at 00:00 (see
    // `startOfCurrentMonth`). Compare against a locally-constructed instant
    // rather than a hard-coded UTC string: under the repo's domain timezone
    // (Europe/Kyiv, +3 in summer) the UTC serialization of local April-1
    // midnight is `2026-03-31T21:00:00.000Z`, so a fixed `…Z` literal only
    // holds on a UTC host. `new Date(year, monthIndex, 1)` tracks the host
    // zone the same way the SUT does, keeping this green on UTC and Kyiv.
    expect(ctx.monthStart.getTime()).toBe(new Date(2026, 3, 1).getTime());
    expect(ctx.transactions).toEqual([]);
    expect(ctx.manualExpenses).toEqual([]);
    expect(ctx.budgets).toEqual([]);
    expect(ctx.limits).toEqual([]);
    expect(ctx.txCategories).toEqual({});
    expect(ctx.customCategories).toEqual([]);
    expect(ctx.hiddenTxIds.size).toBe(0);
    expect(ctx.transferIds.size).toBe(0);
    expect(ctx.thisMonthTx).toEqual([]);
    expect(ctx.limitUsage).toEqual([]);
    expect(ctx.canonicalMonthSpend.size).toBe(0);
    expect(ctx.canonicalTotalCount.size).toBe(0);
  });

  it("monthStart is local first-of-month at 00:00", () => {
    const { monthStart } = buildFinanceContext();
    expect(monthStart.getDate()).toBe(1);
    expect(monthStart.getHours()).toBe(0);
    expect(monthStart.getMinutes()).toBe(0);
    expect(monthStart.getSeconds()).toBe(0);
  });
});

describe("buildFinanceContext — transactions from mirror cache", () => {
  it("returns transactions from the mirror cache", () => {
    const tx = { id: "t1", amount: -1500, time: FIXED_NOW.getTime() };
    setMirrorTxs([tx]);
    const ctx = buildFinanceContext();
    expect(ctx.transactions).toEqual([tx]);
  });

  it("returns empty array when mirror cache is empty", () => {
    // no setMirrorTxs call — cache stays empty
    const ctx = buildFinanceContext();
    expect(ctx.transactions).toEqual([]);
  });
});

describe("buildFinanceContext — thisMonthTx filtering", () => {
  it("filters out transactions before monthStart", () => {
    const monthStartMs = new Date("2026-04-01T00:00:00.000Z").getTime();
    const txs = [
      { id: "before", amount: -100, time: monthStartMs - 86_400_000 },
      { id: "in", amount: -200, time: monthStartMs + 86_400_000 },
    ];
    setMirrorTxs(txs);
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["in"]);
  });

  it("excludes hidden transactions", () => {
    const txs = [
      { id: "visible", amount: -100, time: FIXED_NOW.getTime() },
      { id: "hidden", amount: -200, time: FIXED_NOW.getTime() },
    ];
    setMirrorTxs(txs);
    seedSqlite({ hiddenTransactions: ["hidden"] });
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["visible"]);
    expect(ctx.hiddenTxIds.has("hidden")).toBe(true);
  });

  it("excludes internal_transfer transactions and exposes transferIds", () => {
    const txs = [
      { id: "spend", amount: -100, time: FIXED_NOW.getTime() },
      { id: "transfer", amount: -1000, time: FIXED_NOW.getTime() },
    ];
    setMirrorTxs(txs);
    seedSqlite({ txCategories: { transfer: "internal_transfer" } });
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["spend"]);
    expect(ctx.transferIds.has("transfer")).toBe(true);
  });

  it("interprets unix-second time stamps via txTimestamp heuristic", () => {
    // FIXED_NOW = 2026-04-15 → seconds form below is well after monthStart.
    const seconds = Math.floor(FIXED_NOW.getTime() / 1000);
    const txs = [{ id: "in", amount: -100, time: seconds }];
    setMirrorTxs(txs);
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["in"]);
  });

  it("falls back to the LS prefs keys while the SQLite cache is still cold", () => {
    const txs = [
      { id: "visible", amount: -100, time: FIXED_NOW.getTime() },
      { id: "hidden", amount: -200, time: FIXED_NOW.getTime() },
    ];
    setMirrorTxs(txs);
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["hidden"]));
    const ctx = buildFinanceContext();
    expect(ctx.thisMonthTx.map((t) => t.id)).toEqual(["visible"]);
  });
});

describe("buildFinanceContext — limitUsage (Р5: одне джерело стану ліміту)", () => {
  it("scores a limit against bank spend with the same numbers as the Planning card", () => {
    const seconds = Math.floor(FIXED_NOW.getTime() / 1000);
    setMirrorTxs([{ id: "t1", amount: -100_000, time: seconds }]);
    seedSqlite({
      budgets: [{ id: "b1", type: "limit", categoryId: "food", limit: 500 }],
      txCategories: { t1: "food" },
    });
    const [usage] = buildFinanceContext().limitUsage;
    expect(usage).toMatchObject({
      key: "food",
      spent: 1000,
      limit: 500,
      pctRaw: 200,
      overLimit: true,
    });
  });

  it("sees manual (cash) expenses from the SQLite cache and keeps the exact amount", () => {
    // Сліпий замір 2026-09-24: 247,50 + 560 «Продукти» проти ліміту 500.
    // Ручна таксономія `groceries` лягає в кошик MCC-категорії `food`.
    seedSqlite({
      budgets: [{ id: "b1", type: "limit", categoryId: "food", limit: 500 }],
      manualExpenses: [
        { id: "m1", amount: 247.5, date: "2026-04-10", category: "groceries" },
        { id: "m2", amount: 560, date: "2026-04-11", category: "groceries" },
      ],
    });
    const [usage] = buildFinanceContext().limitUsage;
    expect(usage?.spent).toBe(807.5);
    expect(usage?.pctRaw).toBeCloseTo(161.5, 5);
    expect(usage?.overLimit).toBe(true);
  });

  it("does not count rows the user excluded from statistics", () => {
    const seconds = Math.floor(FIXED_NOW.getTime() / 1000);
    setMirrorTxs([
      { id: "t1", amount: -60_000, time: seconds },
      { id: "t2", amount: -60_000, time: seconds },
    ]);
    seedSqlite({
      budgets: [{ id: "b1", type: "limit", categoryId: "food", limit: 500 }],
      txCategories: { t1: "food", t2: "food" },
      excludedStatTxIds: ["t2"],
    });
    const [usage] = buildFinanceContext().limitUsage;
    expect(usage?.spent).toBe(600);
    expect(usage?.overLimit).toBe(true);
  });

  it("reads budgets from the warm SQLite cache, not from the tombstoned LS key", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        { id: "stale", type: "limit", categoryId: "food", limit: 1 },
      ]),
    );
    seedSqlite({
      budgets: [{ id: "fresh", type: "limit", categoryId: "food", limit: 500 }],
    });
    const ctx = buildFinanceContext();
    expect(ctx.budgets.map((b) => b.id)).toEqual(["fresh"]);
    expect(ctx.limitUsage.map((u) => u.budget.id)).toEqual(["fresh"]);
  });
});

describe("buildFinanceContext — canonical aggregations", () => {
  it("counts every spend transaction (across all months) into canonicalTotalCount", () => {
    const monthStartMs = new Date("2026-04-01T00:00:00.000Z").getTime();
    const txs = [
      // pre-month spend should still count toward total counter
      {
        id: "old",
        amount: -100,
        time: monthStartMs - 30 * 86_400_000,
        description: "АТБ",
        mcc: 5411,
      },
      {
        id: "new",
        amount: -100,
        time: monthStartMs + 86_400_000,
        description: "АТБ",
        mcc: 5411,
      },
    ];
    setMirrorTxs(txs);
    const ctx = buildFinanceContext();
    // Both transactions categorize via MCC 5411 → "food"; counter should be 2.
    expect(ctx.canonicalTotalCount.get("food")).toBe(2);
  });

  it("does not count positive amounts (income) in canonicalTotalCount", () => {
    const txs = [
      {
        id: "income",
        amount: 5000,
        time: FIXED_NOW.getTime(),
        description: "Salary",
      },
    ];
    setMirrorTxs(txs);
    const ctx = buildFinanceContext();
    expect(ctx.canonicalTotalCount.size).toBe(0);
  });

  it("includes manual expenses in canonicalTotalCount via Ukrainian label mapping", () => {
    seedSqlite({
      manualExpenses: [
        { id: "m1", amount: 10, date: "2026-04-10", category: "їжа" },
      ],
    });
    const ctx = buildFinanceContext();
    expect(ctx.canonicalTotalCount.get("food")).toBe(1);
  });

  it("adds manual expenses inside the current month to canonicalMonthSpend", () => {
    seedSqlite({
      manualExpenses: [
        { id: "m1", amount: 25, date: "2026-04-10", category: "food" },
        { id: "m2", amount: 99, date: "2026-03-28", category: "food" },
      ],
    });
    const ctx = buildFinanceContext();
    expect(ctx.canonicalMonthSpend.get("food")).toBe(25);
  });

  it("excludes manual transfers from canonicalTotalCount", () => {
    seedSqlite({
      manualExpenses: [
        {
          id: "m1",
          amount: 10,
          date: "2026-04-10",
          category: "internal_transfer",
        },
      ],
    });
    const ctx = buildFinanceContext();
    // "internal_transfer" maps to itself (no entry in MANUAL_CATEGORY_ID_MAP),
    // and the rule below skips internal_transfer keys explicitly.
    expect(ctx.canonicalTotalCount.has("internal_transfer")).toBe(false);
  });
});

describe("buildFinanceContext — budgets", () => {
  it("filters limits from the full budgets list", () => {
    seedSqlite({
      budgets: [
        { id: "b1", type: "limit", categoryId: "food", limit: 500 },
        { id: "b2", type: "goal", categoryId: "savings", limit: 1000 },
        { id: "b3", type: "limit", categoryId: "transport", limit: 200 },
      ],
    });
    const ctx = buildFinanceContext();
    expect(ctx.budgets).toHaveLength(3);
    expect(ctx.limits.map((b) => b.id)).toEqual(["b1", "b3"]);
  });

  it("falls back to the LS budgets key only while the cache is cold", () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        { id: "b1", type: "limit", categoryId: "food", limit: 500 },
      ]),
    );
    const ctx = buildFinanceContext();
    expect(ctx.limits.map((b) => b.id)).toEqual(["b1"]);
  });

  it("returns empty arrays when budgets LS is malformed", () => {
    localStorage.setItem("finyk_budgets", "not-json");
    const ctx = buildFinanceContext();
    expect(ctx.budgets).toEqual([]);
    expect(ctx.limits).toEqual([]);
  });
});

describe("buildFinanceContext — manual income excluded from spend (fab-and-manual-income spec)", () => {
  // `@sergeant/insights` treats every `ctx.manualExpenses` row as spend
  // (dailyVsWeeklyPace, spendingVelocity, noTxRecent rules all add `amount`
  // straight to their totals). The manual-income feature writes income rows
  // into the same table — without this filter a salary entry would trip
  // budget-limit / spending-velocity AI advice as if the user overspent.
  it("drops kind: income entries from ctx.manualExpenses entirely", () => {
    seedSqlite({
      manualExpenses: [
        { id: "m1", amount: 25, date: "2026-04-10", category: "food" },
        {
          id: "m2",
          amount: 5000,
          date: "2026-04-10",
          category: "salary",
          kind: "income",
        },
      ],
    });
    const ctx = buildFinanceContext();
    expect(ctx.manualExpenses.map((e) => e.id)).toEqual(["m1"]);
  });

  it("legacy type: income rows (HubChat, pre-kind) are also excluded", () => {
    seedSqlite({
      manualExpenses: [
        { id: "m1", amount: 5000, date: "2026-04-10", type: "income" },
      ],
    });
    const ctx = buildFinanceContext();
    expect(ctx.manualExpenses).toEqual([]);
    expect(ctx.canonicalMonthSpend.size).toBe(0);
    expect(ctx.canonicalTotalCount.size).toBe(0);
  });
});
