// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleQueryFinykAction } from "./queryFinykActions";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../modules/finyk/lib/sqliteReader";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../../modules/finyk/lib/monoMirrorReader";
import type { ManualExpense } from "../../../modules/finyk/hooks/useStorage.types";
import type { ChatAction } from "./types";

beforeEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  clearFinykMonoMirrorCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  clearFinykMonoMirrorCache();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleQueryFinykAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

/**
 * Seed manual (грн) + bank (kopiykas) transactions for a deterministic
 * dataset. Manual expenses come from the canonical SQLite warm cache
 * (the executors read it off-React, not LS); bank txs from the Mono mirror.
 */
function seed(): void {
  __setFinykSqliteStateCacheForTests({
    manualExpenses: [
      {
        id: "m_atb",
        date: "2026-04-10",
        description: "АТБ",
        amount: 200,
        category: "food",
      },
      {
        id: "m_kava",
        date: "2026-04-15",
        description: "Кава",
        amount: 50,
        category: "restaurant",
      },
      {
        id: "m_salary",
        date: "2026-04-01",
        description: "Зарплата",
        amount: 5000,
        category: "",
        type: "income",
      },
      {
        id: "m_march",
        date: "2026-03-12",
        description: "АТБ",
        amount: 120,
        category: "food",
      },
    ] as unknown as ManualExpense[],
  });
  __setFinykMonoMirrorCacheForTests({
    transactions: [
      {
        id: "b_silpo",
        date: "2026-04-20",
        description: "Сільпо",
        amount: -30000,
        category: "food",
      },
      {
        id: "b_taxi",
        date: "2026-04-18",
        merchant: "Bolt",
        amount: -15000,
        category: "transport",
      },
    ] as never[],
  });
}

// ---------------------------------------------------------------------------
// query_transactions
// ---------------------------------------------------------------------------
describe("query_transactions", () => {
  it("happy: finds by text query with count and sum", () => {
    seed();
    const out = call({ name: "query_transactions", input: { query: "АТБ" } });
    expect(typeof out).toBe("string");
    expect(out).toContain("m_atb");
    expect(out).toMatch(/сум/i);
  });

  it("happy: filters by type=income", () => {
    seed();
    const out = call({ name: "query_transactions", input: { type: "income" } });
    expect(out).toContain("m_salary");
    expect(out).not.toContain("m_atb");
  });

  it("happy: filters by category and respects date range", () => {
    seed();
    const out = call({
      name: "query_transactions",
      input: {
        category: "food",
        date_from: "2026-04-01",
        date_to: "2026-04-30",
      },
    });
    expect(out).toContain("m_atb");
    expect(out).toContain("b_silpo");
    expect(out).not.toContain("m_march"); // March excluded by date range
  });

  it("error: no filters returns guidance string", () => {
    seed();
    const out = call({ name: "query_transactions", input: {} });
    expect(out).toContain("фільтр");
  });

  it("shape: no matches is a non-empty string", () => {
    seed();
    const out = call({
      name: "query_transactions",
      input: { query: "неіснуюче" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("не знайдено");
  });
});

// ---------------------------------------------------------------------------
// aggregate_spending
// ---------------------------------------------------------------------------
describe("aggregate_spending", () => {
  it("happy: groups expenses by category for default (current month)", () => {
    seed();
    const out = call({ name: "aggregate_spending", input: {} });
    expect(out).toContain("Витрати");
    expect(out).toContain("грн");
    // food = m_atb(200) + b_silpo(300) = 500 within April
    expect(out).toMatch(/500/);
  });

  it("happy: groups by day", () => {
    seed();
    const out = call({
      name: "aggregate_spending",
      input: {
        group_by: "day",
        date_from: "2026-04-01",
        date_to: "2026-04-30",
      },
    });
    expect(out).toContain("2026-04-20");
    expect(out).toContain("днями");
  });

  it("happy: type=income reports income title", () => {
    seed();
    const out = call({
      name: "aggregate_spending",
      input: { type: "income", date_from: "2026-04-01", date_to: "2026-04-30" },
    });
    expect(out).toContain("Дохід");
    expect(out).toMatch(/5000/);
  });

  it("error: empty range returns no-data message", () => {
    seed();
    const out = call({
      name: "aggregate_spending",
      input: { date_from: "2020-01-01", date_to: "2020-01-31" },
    });
    expect(out).toContain("Немає");
  });

  it("shape: result is a non-empty string", () => {
    seed();
    const out = call({
      name: "aggregate_spending",
      input: { group_by: "merchant" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// compare_periods
// ---------------------------------------------------------------------------
describe("compare_periods", () => {
  it("happy: compares spending across two months", () => {
    seed();
    const out = call({
      name: "compare_periods",
      input: {
        period_a_from: "2026-04-01",
        period_a_to: "2026-04-30",
        period_b_from: "2026-03-01",
        period_b_to: "2026-03-31",
      },
    });
    expect(out).toContain("Різниця");
    expect(out).toContain("%");
    // April expenses (200+50+300+150=700) vs March (120)
    expect(out).toMatch(/700/);
    expect(out).toMatch(/120/);
  });

  it("happy: metric=count compares transaction counts", () => {
    seed();
    const out = call({
      name: "compare_periods",
      input: {
        period_a_from: "2026-04-01",
        period_a_to: "2026-04-30",
        period_b_from: "2026-03-01",
        period_b_to: "2026-03-31",
        metric: "count",
      },
    });
    expect(out).toContain("Кількість");
    expect(out).toContain("транзакц.");
  });

  it("error: missing period bounds returns guidance", () => {
    const out = call({
      name: "compare_periods",
      input: { period_a_from: "2026-04-01", period_a_to: "2026-04-30" },
    });
    expect(out).toContain("Потрібні обидва періоди");
  });

  it("shape: result is a non-empty string", () => {
    seed();
    const out = call({
      name: "compare_periods",
      input: {
        period_a_from: "2026-04-01",
        period_a_to: "2026-04-30",
        period_b_from: "2026-04-01",
        period_b_to: "2026-04-30",
      },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// txSource regression — AI/server manual expenses carry a server UUID id
// (no `m_` prefix). The old prefix heuristic misclassified them as bank
// rows, so direction came from amount-sign instead of `type`, counting an
// expense (positive amount + type:"expense") as income.
// ---------------------------------------------------------------------------
describe("aggregate_spending · AI-created manual expense (UUID id)", () => {
  it("counts a UUID-id expense as expense, not income", () => {
    __setFinykSqliteStateCacheForTests({
      manualExpenses: [
        {
          id: "5f3c9b2e-1a4d-4c7e-9f21-abc123def456",
          date: "2026-04-12",
          description: "AI витрата",
          amount: 320,
          category: "food",
          type: "expense",
        },
      ] as unknown as ManualExpense[],
    });
    const expense = call({
      name: "aggregate_spending",
      input: {
        type: "expense",
        date_from: "2026-04-01",
        date_to: "2026-04-30",
      },
    });
    expect(expense).toContain("Витрати");
    expect(expense).toMatch(/320/); // грн, not kopiyka-divided

    const income = call({
      name: "aggregate_spending",
      input: { type: "income", date_from: "2026-04-01", date_to: "2026-04-30" },
    });
    expect(income).toContain("Немає доходів");
  });
});

// ---------------------------------------------------------------------------
// W1-CANON-AGG стадія 2b — два всесвіти: статистика і пошук
// ---------------------------------------------------------------------------
describe("канонічний excluded-set і спліти (стадія 2b)", () => {
  /**
   * 1000 грн зі сплітом 600 «їжа» + 400 «внутрішній переказ» → у витрати
   * має піти 600. Решта рядків — по одному представнику кожної з чотирьох
   * частин канонічного excluded-set.
   */
  function seedExcluded(): void {
    __setFinykSqliteStateCacheForTests({
      manualExpenses: [
        {
          id: "m_cash",
          date: "2026-04-14",
          description: "Ринок",
          amount: 250,
          category: "food",
        },
      ] as unknown as ManualExpense[],
      txCategories: { b_split: "food", b_transfer: "internal_transfer" },
      txSplits: {
        b_split: [
          { categoryId: "food", amount: 600 },
          { categoryId: "internal_transfer", amount: 400 },
        ],
      } as never,
      hiddenTransactions: ["b_hidden"],
      receivables: [{ id: "r1", linkedTxIds: ["b_recv"] }] as never,
      excludedStatTxIds: ["b_excl"],
    });
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "b_split", date: "2026-04-10", amount: -100000 },
        { id: "b_excl", date: "2026-04-11", amount: -20000 },
        { id: "b_transfer", date: "2026-04-12", amount: -50000 },
        { id: "b_recv", date: "2026-04-13", amount: -25000 },
        { id: "b_hidden", date: "2026-04-14", amount: -15000 },
      ] as never[],
    });
  }

  const APRIL = { date_from: "2026-04-01", date_to: "2026-04-30" };

  it("aggregate_spending: 850 грн = спліт-частка 600 + готівка 250", () => {
    seedExcluded();
    const out = call({ name: "aggregate_spending", input: { ...APRIL } });
    // Без фіксу було б 1900: спліт цілком (1000) + виключені (200 + 500 + 250)
    // + готівка (250). Кожен з чотирьох excluded-рядків мусить випасти, а
    // спліт — увійти лише не-переказною часткою.
    expect(out).toContain("850 грн усього (2 транзакц.)");
  });

  it("compare_periods рахує по тому самому всесвіту", () => {
    seedExcluded();
    const out = call({
      name: "compare_periods",
      input: {
        period_a_from: "2026-04-01",
        period_a_to: "2026-04-30",
        period_b_from: "2026-03-01",
        period_b_to: "2026-03-31",
      },
    });
    expect(out).toContain("= 850 грн");
  });

  it("query_transactions лишається всесвітом ПОШУКУ — знаходить виключене", () => {
    seedExcluded();
    const out = call({
      name: "query_transactions",
      input: { query: "b_transfer" },
    });
    // Виключення зі статистики не робить транзакцію невидимою для пошуку:
    // «де мій переказ на 500?» мусить давати відповідь. Ховається лише
    // `hidden` — і це єдина різниця між двома всесвітами.
    expect(out).toContain("b_transfer");
    expect(out).toContain("500 грн");
  });

  it("query_transactions не застосовує спліт до суми рядка", () => {
    seedExcluded();
    const out = call({
      name: "query_transactions",
      input: { query: "b_split" },
    });
    // Фактичне списання — 1000 грн, а не статистична частка 600.
    expect(out).toContain("1000 грн");
  });
});

// ---------------------------------------------------------------------------
// CALC-1 (2026-09-01 product audit) — manual `internal_transfer` must not
// count as an expense in `aggregate_spending` / `compare_periods`. Before
// the fix, `readStatTransactions()` built the excluded-set WITHOUT the
// `transactions` field — the only signal that carries a MANUAL transfer's
// tag (bank transfers are tagged via `txCategories`, manual ones only on
// the record itself). Same universe as Overview/Operations (`useStorage.ts`,
// PR #1000) and `useFinykInsights.ts` (CALC-2) must agree.
// ---------------------------------------------------------------------------
describe("CALC-1 — manual internal_transfer excluded from chat aggregation", () => {
  function seedWithManualTransfer(): void {
    __setFinykSqliteStateCacheForTests({
      manualExpenses: [
        {
          id: "m_groceries",
          date: "2026-04-10",
          description: "АТБ",
          amount: 200,
          category: "food",
        },
        {
          id: "m_transfer",
          date: "2026-04-12",
          description: "Переказ на картку заощаджень",
          amount: 1000,
          category: "internal_transfer",
        },
      ] as unknown as ManualExpense[],
    });
  }

  it("aggregate_spending excludes the manual transfer (only groceries count)", () => {
    seedWithManualTransfer();
    const out = call({
      name: "aggregate_spending",
      input: { date_from: "2026-04-01", date_to: "2026-04-30" },
    });
    // Без фіксу було б 1200 (200 + 1000 переказ, порахований витратою).
    expect(out).toContain("200 грн усього (1 транзакц.)");
    expect(out).not.toMatch(/1200/);
  });

  it("compare_periods excludes the manual transfer from the measured total", () => {
    seedWithManualTransfer();
    const out = call({
      name: "compare_periods",
      input: {
        period_a_from: "2026-04-01",
        period_a_to: "2026-04-30",
        period_b_from: "2026-03-01",
        period_b_to: "2026-03-31",
      },
    });
    expect(out).toContain("A (2026-04-01 – 2026-04-30) = 200 грн");
  });
});

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
describe("handleQueryFinykAction router", () => {
  it("returns undefined for non-query actions (falls through dispatch chain)", () => {
    const out = handleQueryFinykAction({
      name: "create_transaction",
      input: { amount: 100 },
    } as ChatAction);
    expect(out).toBeUndefined();
  });
});
