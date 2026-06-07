// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleQueryFinykAction } from "./queryFinykActions";
import type { ChatAction } from "./types";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-22T12:00:00"));
});
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function call(action: ChatAction): string {
  const out = handleQueryFinykAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

/** Seed manual (грн) + bank (kopiykas) transactions for a deterministic dataset. */
function seed(): void {
  localStorage.setItem(
    "finyk_manual_expenses_v1",
    JSON.stringify([
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
        type: "income",
      },
      {
        id: "m_march",
        date: "2026-03-12",
        description: "АТБ",
        amount: 120,
        category: "food",
      },
    ]),
  );
  localStorage.setItem(
    "finyk_tx_cache",
    JSON.stringify({
      txs: [
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
      ],
    }),
  );
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
