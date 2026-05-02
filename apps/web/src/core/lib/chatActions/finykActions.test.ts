// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleFinykAction } from "./finykActions";
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
  const out = handleFinykAction(action);
  if (out == null) {
    throw new Error(`handler returned ${typeof out}, expected string|object`);
  }
  return typeof out === "string" ? out : out.result;
}

// ---------------------------------------------------------------------------
// change_category
// ---------------------------------------------------------------------------
describe("change_category", () => {
  it("happy: assigns category and returns string", () => {
    const out = call({
      name: "change_category",
      input: { tx_id: "tx1", category_id: "food" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("tx1");
    expect(out).toMatch(/категорію|food/i);
    const cats = JSON.parse(localStorage.getItem("finyk_tx_cats")!);
    expect(cats.tx1).toBe("food");
  });

  it("error: missing tx_id still produces a string (no throw)", () => {
    const out = call({
      name: "change_category",
      input: { tx_id: "", category_id: "food" },
    });
    expect(typeof out).toBe("string");
  });

  it("shape: result is a non-empty string suitable for tool_result", () => {
    const out = call({
      name: "change_category",
      input: { tx_id: "tx2", category_id: "transport" },
    });
    expect(out.length).toBeGreaterThan(0);
    expect(typeof out).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// find_transaction
// ---------------------------------------------------------------------------
describe("find_transaction", () => {
  it("happy: finds transactions matching query", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        {
          id: "m_1",
          date: "2026-04-22",
          description: "АТБ",
          amount: 200,
          category: "food",
        },
      ]),
    );
    const out = call({
      name: "find_transaction",
      input: { query: "АТБ" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("m_1");
  });

  it("error: no filters returns structured error", () => {
    const out = call({ name: "find_transaction", input: {} });
    expect(typeof out).toBe("string");
    expect(out).toContain("Потрібен");
  });

  it("shape: result with no matches is a non-empty string", () => {
    const out = call({
      name: "find_transaction",
      input: { query: "nonexistent" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// batch_categorize
// ---------------------------------------------------------------------------
describe("batch_categorize", () => {
  it("happy: dry-run returns preview string", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        { id: "m_1", date: "2026-04-22", description: "Сільпо", amount: 100 },
      ]),
    );
    const out = call({
      name: "batch_categorize",
      input: { pattern: "Сільпо", category_id: "food" },
    });
    expect(typeof out).toBe("string");
    expect(out).toMatch(/dry.run|Dry/i);
  });

  it("error: missing pattern returns structured error", () => {
    const out = call({
      name: "batch_categorize",
      input: { pattern: "", category_id: "food" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("pattern");
  });

  it("error: missing category_id returns structured error", () => {
    const out = call({
      name: "batch_categorize",
      input: { pattern: "АТБ", category_id: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("category_id");
  });

  it("shape: result is always a string", () => {
    const out = call({
      name: "batch_categorize",
      input: { pattern: "ghost", category_id: "food" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// create_debt
// ---------------------------------------------------------------------------
describe("create_debt", () => {
  it("happy: creates debt in localStorage", () => {
    const out = call({
      name: "create_debt",
      input: { name: "Тест", amount: 5000, due_date: "2026-05-01" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Тест");
    expect(out).toContain("5000");
    const debts = JSON.parse(localStorage.getItem("finyk_debts")!);
    expect(debts).toHaveLength(1);
    expect(debts[0].name).toBe("Тест");
  });

  it("error: amount as string still works (coerced)", () => {
    const out = call({
      name: "create_debt",
      input: { name: "Борг", amount: "3000" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("3000");
  });

  it("shape: result contains debt id", () => {
    const out = call({
      name: "create_debt",
      input: { name: "X", amount: 100 },
    });
    expect(out).toMatch(/id:d_/);
  });
});

// ---------------------------------------------------------------------------
// create_receivable
// ---------------------------------------------------------------------------
describe("create_receivable", () => {
  it("happy: creates receivable", () => {
    const out = call({
      name: "create_receivable",
      input: { name: "Петро", amount: 1500 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Петро");
    expect(out).toContain("1500");
  });

  it("error: amount as string is coerced", () => {
    const out = call({
      name: "create_receivable",
      input: { name: "Іван", amount: "2000" },
    });
    expect(typeof out).toBe("string");
  });

  it("shape: result contains id prefix", () => {
    const out = call({
      name: "create_receivable",
      input: { name: "A", amount: 10 },
    });
    expect(out).toMatch(/id:r_/);
  });
});

// ---------------------------------------------------------------------------
// hide_transaction
// ---------------------------------------------------------------------------
describe("hide_transaction", () => {
  it("happy: hides transaction", () => {
    const out = call({
      name: "hide_transaction",
      input: { tx_id: "tx99" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("tx99");
    expect(out).toContain("приховано");
    const hidden = JSON.parse(localStorage.getItem("finyk_hidden_txs")!);
    expect(hidden).toContain("tx99");
  });

  it("error: hiding already hidden is idempotent", () => {
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["tx99"]));
    const out = call({
      name: "hide_transaction",
      input: { tx_id: "tx99" },
    });
    expect(typeof out).toBe("string");
    const hidden = JSON.parse(localStorage.getItem("finyk_hidden_txs")!);
    expect(hidden.filter((x: string) => x === "tx99")).toHaveLength(1);
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "hide_transaction",
      input: { tx_id: "abc" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// set_budget_limit
// ---------------------------------------------------------------------------
describe("set_budget_limit", () => {
  it("happy: sets budget limit", () => {
    const out = call({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 5000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("5000");
  });

  it("error: updates existing limit", () => {
    call({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 3000 },
    });
    const out = call({
      name: "set_budget_limit",
      input: { category_id: "food", limit: 7000 },
    });
    expect(out).toContain("7000");
    const budgets = JSON.parse(localStorage.getItem("finyk_budgets")!);
    expect(budgets).toHaveLength(1);
  });

  it("shape: result is a string", () => {
    const out = call({
      name: "set_budget_limit",
      input: { category_id: "x", limit: "100" },
    });
    expect(typeof out).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// set_monthly_plan
// ---------------------------------------------------------------------------
describe("set_monthly_plan", () => {
  it("happy: sets monthly plan fields", () => {
    const out = call({
      name: "set_monthly_plan",
      input: { income: 50000, expense: 30000, savings: 20000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("50000");
    expect(out).toContain("30000");
    expect(out).toContain("20000");
  });

  it("error: empty fields are preserved from current plan", () => {
    call({ name: "set_monthly_plan", input: { income: 40000 } });
    const plan = JSON.parse(localStorage.getItem("finyk_monthly_plan")!);
    expect(plan.income).toBe("40000");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "set_monthly_plan",
      input: { income: 10000 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// create_transaction
// ---------------------------------------------------------------------------
describe("create_transaction", () => {
  it("happy: creates manual expense", () => {
    const out = call({
      name: "create_transaction",
      input: { amount: 120, description: "кава" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("120");
    expect(out).toContain("кава");
    const expenses = JSON.parse(
      localStorage.getItem("finyk_manual_expenses_v1")!,
    );
    expect(expenses).toHaveLength(1);
  });

  it("error: invalid amount returns structured error (no throw)", () => {
    const out = call({
      name: "create_transaction",
      input: { amount: -50, description: "bad" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Некоректна");
  });

  it("error: zero amount returns error", () => {
    const out = call({
      name: "create_transaction",
      input: { amount: 0 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Некоректна");
  });

  it("shape: result contains transaction id", () => {
    const out = call({
      name: "create_transaction",
      input: { amount: 50 },
    });
    expect(out).toMatch(/id:m_/);
  });
});

// ---------------------------------------------------------------------------
// delete_transaction
// ---------------------------------------------------------------------------
describe("delete_transaction", () => {
  it("happy: deletes manual transaction", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([{ id: "m_test", amount: 100, date: "2026-04-22" }]),
    );
    const out = call({
      name: "delete_transaction",
      input: { tx_id: "m_test" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("m_test");
    expect(out).toContain("видалено");
  });

  it("error: non-manual tx returns structured error (no throw)", () => {
    const out = call({
      name: "delete_transaction",
      input: { tx_id: "bank_123" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("hide_transaction");
  });

  it("error: empty tx_id returns error", () => {
    const out = call({
      name: "delete_transaction",
      input: { tx_id: "" },
    });
    expect(out).toContain("Потрібен");
  });

  it("shape: result is always a string (not an object)", () => {
    const out = call({
      name: "delete_transaction",
      input: { tx_id: "m_nonexistent" },
    });
    expect(typeof out).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// update_budget
// ---------------------------------------------------------------------------
describe("update_budget", () => {
  it("happy: creates budget limit via scope=limit", () => {
    const out = call({
      name: "update_budget",
      input: { scope: "limit", category_id: "food", limit: 3000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("3000");
  });

  it("happy: creates budget goal via scope=goal", () => {
    const out = call({
      name: "update_budget",
      input: { scope: "goal", name: "Відпустка", target_amount: 10000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Відпустка");
  });

  it("error: invalid scope returns error", () => {
    const out = call({
      name: "update_budget",
      input: { scope: "limit" as const, category_id: "", limit: 100 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("category_id");
  });

  it("shape: result is always a non-empty string", () => {
    const out = call({
      name: "update_budget",
      input: { scope: "goal", name: "X", target_amount: 100 },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// mark_debt_paid
// ---------------------------------------------------------------------------
describe("mark_debt_paid", () => {
  it("happy: pays debt and creates manual tx", () => {
    localStorage.setItem(
      "finyk_debts",
      JSON.stringify([
        { id: "d_1", name: "Борг", totalAmount: 5000, linkedTxIds: [] },
      ]),
    );
    const out = call({
      name: "mark_debt_paid",
      input: { debt_id: "d_1", amount: 2000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("2000");
    expect(out).toContain("Борг");
  });

  it("error: missing debt_id returns error", () => {
    const out = call({
      name: "mark_debt_paid",
      input: { debt_id: "" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Потрібен");
  });

  it("error: nonexistent debt returns error", () => {
    const out = call({
      name: "mark_debt_paid",
      input: { debt_id: "d_nonexistent" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("не знайдено");
  });

  it("shape: result is always a string", () => {
    localStorage.setItem(
      "finyk_debts",
      JSON.stringify([
        { id: "d_2", name: "Тест", totalAmount: 1000, linkedTxIds: [] },
      ]),
    );
    const out = call({ name: "mark_debt_paid", input: { debt_id: "d_2" } });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// add_asset
// ---------------------------------------------------------------------------
describe("add_asset", () => {
  it("happy: adds asset to localStorage", () => {
    const out = call({
      name: "add_asset",
      input: { name: "Квартира", amount: 2000000 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Квартира");
    const assets = JSON.parse(localStorage.getItem("finyk_assets")!);
    expect(assets).toHaveLength(1);
  });

  it("error: empty name returns error", () => {
    const out = call({
      name: "add_asset",
      input: { name: "", amount: 100 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Потрібна");
  });

  it("error: invalid amount returns error", () => {
    const out = call({
      name: "add_asset",
      input: { name: "Актив", amount: -1 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("додатн");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "add_asset",
      input: { name: "Авто", amount: 500000, currency: "usd" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("USD");
  });
});

// ---------------------------------------------------------------------------
// import_monobank_range
// ---------------------------------------------------------------------------
describe("import_monobank_range", () => {
  it("happy: accepts valid date range", () => {
    const out = call({
      name: "import_monobank_range",
      input: { from: "2026-01-01", to: "2026-01-31" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("2026-01-01");
    expect(out).toContain("2026-01-31");
  });

  it("error: invalid date format returns error", () => {
    const out = call({
      name: "import_monobank_range",
      input: { from: "bad", to: "worse" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("YYYY-MM-DD");
  });

  it("error: from > to returns error", () => {
    const out = call({
      name: "import_monobank_range",
      input: { from: "2026-02-01", to: "2026-01-01" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Некоректний");
  });

  it("shape: result is always a string", () => {
    const out = call({
      name: "import_monobank_range",
      input: { from: "2026-03-01", to: "2026-03-31" },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// split_transaction
// ---------------------------------------------------------------------------
describe("split_transaction", () => {
  it("happy: splits transaction", () => {
    const out = call({
      name: "split_transaction",
      input: {
        tx_id: "tx1",
        parts: [
          { category_id: "food", amount: 50 },
          { category_id: "transport", amount: 30 },
        ],
      },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("tx1");
    expect(out).toContain("2");
  });

  it("error: missing tx_id returns error", () => {
    const out = call({
      name: "split_transaction",
      input: {
        tx_id: "",
        parts: [
          { category_id: "a", amount: 1 },
          { category_id: "b", amount: 2 },
        ],
      },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("tx_id");
  });

  it("error: less than 2 parts returns error", () => {
    const out = call({
      name: "split_transaction",
      input: { tx_id: "tx1", parts: [{ category_id: "a", amount: 10 }] },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("2");
  });

  it("shape: result is a non-empty string", () => {
    const out = call({
      name: "split_transaction",
      input: {
        tx_id: "tx2",
        parts: [
          { category_id: "food", amount: 10 },
          { category_id: "misc", amount: 20 },
        ],
      },
    });
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// recurring_expense
// ---------------------------------------------------------------------------
describe("recurring_expense", () => {
  it("happy: creates subscription", () => {
    const out = call({
      name: "recurring_expense",
      input: { name: "Spotify", amount: 199, day_of_month: 15 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Spotify");
    expect(out).toContain("199");
  });

  it("error: empty name returns error", () => {
    const out = call({
      name: "recurring_expense",
      input: { name: "", amount: 100 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("назв");
  });

  it("error: invalid amount returns error", () => {
    const out = call({
      name: "recurring_expense",
      input: { name: "Test", amount: -10 },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("додатн");
  });

  it("shape: result contains subscription id", () => {
    const out = call({
      name: "recurring_expense",
      input: { name: "Netflix", amount: 350 },
    });
    expect(out).toMatch(/id:sub_/);
  });
});

// ---------------------------------------------------------------------------
// export_report
// ---------------------------------------------------------------------------
describe("export_report", () => {
  it("happy: generates report for current month", () => {
    const out = call({
      name: "export_report",
      input: {},
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Звіт");
  });

  it("happy: generates report for custom period", () => {
    const out = call({
      name: "export_report",
      input: { period: "custom", from: "2026-01-01", to: "2026-01-31" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Звіт");
  });

  it("shape: result always contains financial summary lines", () => {
    const out = call({
      name: "export_report",
      input: { period: "week" },
    });
    expect(typeof out).toBe("string");
    expect(out).toContain("Дохід");
    expect(out).toContain("Витрати");
  });
});

// ---------------------------------------------------------------------------
// create_transaction · undo
// ---------------------------------------------------------------------------
describe("create_transaction · undo", () => {
  it("повертає {undo} який видаляє щойно створену транзакцію", () => {
    const out = handleFinykAction({
      name: "create_transaction",
      input: { amount: 250, description: "кава" },
    });
    if (typeof out === "string" || out == null) {
      throw new Error(`expected undoable result, got ${typeof out}`);
    }
    expect(out.result).toContain("250");
    const before = JSON.parse(
      localStorage.getItem("finyk_manual_expenses_v1") || "[]",
    );
    expect(before).toHaveLength(1);

    out.undo();

    const after = JSON.parse(
      localStorage.getItem("finyk_manual_expenses_v1") || "[]",
    );
    expect(after).toHaveLength(0);
  });

  it("undo не зачіпає інші транзакції що з'явились пізніше", () => {
    const first = handleFinykAction({
      name: "create_transaction",
      input: { amount: 50, description: "перша" },
    });
    if (typeof first === "string" || first == null)
      throw new Error("expected object");

    // Емулюємо додавання другої транзакції після першої
    handleFinykAction({
      name: "create_transaction",
      input: { amount: 100, description: "друга" },
    });

    first.undo();

    const after = JSON.parse(
      localStorage.getItem("finyk_manual_expenses_v1") || "[]",
    );
    expect(after).toHaveLength(1);
    expect(after[0].description).toBe("друга");
  });

  it("undo ідемпотентний — другий виклик нічого не ламає", () => {
    const out = handleFinykAction({
      name: "create_transaction",
      input: { amount: 250 },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    out.undo();
    expect(() => out.undo()).not.toThrow();
    const after = JSON.parse(
      localStorage.getItem("finyk_manual_expenses_v1") || "[]",
    );
    expect(after).toHaveLength(0);
  });

  it("error path (некоректна сума) повертає string без undo", () => {
    const out = handleFinykAction({
      name: "create_transaction",
      input: { amount: 0 },
    });
    expect(typeof out).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// create_debt · undo
// ---------------------------------------------------------------------------
describe("create_debt · undo", () => {
  it("повертає {undo} який видаляє щойно створений борг за id", () => {
    const out = handleFinykAction({
      name: "create_debt",
      input: { name: "Кредитка", amount: 5000 },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    const before = JSON.parse(localStorage.getItem("finyk_debts") || "[]");
    expect(before).toHaveLength(1);

    out.undo();
    const after = JSON.parse(localStorage.getItem("finyk_debts") || "[]");
    expect(after).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// create_receivable · undo
// ---------------------------------------------------------------------------
describe("create_receivable · undo", () => {
  it("повертає {undo} який видаляє щойно створену дебіторку за id", () => {
    const out = handleFinykAction({
      name: "create_receivable",
      input: { name: "Колега", amount: 200 },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    out.undo();
    const after = JSON.parse(localStorage.getItem("finyk_recv") || "[]");
    expect(after).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// add_asset · undo
// ---------------------------------------------------------------------------
describe("add_asset · undo", () => {
  it("повертає {undo} який видаляє щойно доданий актив (matching shape)", () => {
    const out = handleFinykAction({
      name: "add_asset",
      input: { name: "BTC", amount: 0.5, currency: "BTC" },
    });
    if (typeof out === "string" || out == null)
      throw new Error("expected object");

    const before = JSON.parse(localStorage.getItem("finyk_assets") || "[]");
    expect(before).toHaveLength(1);

    out.undo();
    const after = JSON.parse(localStorage.getItem("finyk_assets") || "[]");
    expect(after).toHaveLength(0);
  });

  it("undo прибирає лише свій актив, попередні залишаються", () => {
    handleFinykAction({
      name: "add_asset",
      input: { name: "USD", amount: 1000 },
    });
    const second = handleFinykAction({
      name: "add_asset",
      input: { name: "EUR", amount: 500 },
    });
    if (typeof second === "string" || second == null)
      throw new Error("expected object");

    second.undo();

    const after = JSON.parse(localStorage.getItem("finyk_assets") || "[]");
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe("USD");
  });
});
