// @vitest-environment jsdom
//
// Hallucinated-id guards for the Finyk write executors. Chat tools run on
// the client, so a model-invented `tx_id` / `category_id` would otherwise
// be written verbatim and reported as success. Every case here asserts
// BOTH halves of the contract: an error string comes back AND no storage
// mutation happened.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../../../modules/finyk/lib/sqliteReader";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../../../modules/finyk/lib/monoMirrorReader";
import { setBudgetLimit, updateBudget } from "./budgets";
import { batchCategorize, changeCategory } from "./search";
import { hideTransaction, splitTransaction } from "./transactions";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { UpdateBudgetAction } from "../types";

const REAL_TX = "m_real";

function seedRealTransaction(): void {
  __setFinykSqliteStateCacheForTests({
    manualExpenses: [
      {
        id: REAL_TX,
        date: "2026-04-22",
        description: "АТБ",
        amount: 200,
        category: "food",
      },
    ],
  });
}

const asString = (out: unknown): string =>
  typeof out === "string" ? out : String((out as { result: string }).result);

beforeEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  clearFinykMonoMirrorCache();
  __setFinykSqliteStateCacheForTests({});
});
afterEach(() => {
  localStorage.clear();
  clearFinykSqliteCache();
  clearFinykMonoMirrorCache();
});

describe("change_category guards", () => {
  it("rejects a hallucinated tx_id without writing an override", () => {
    seedRealTransaction();
    const out = asString(
      changeCategory({
        name: "change_category",
        input: { tx_id: "tx_999999", category_id: "food" },
      }),
    );
    expect(out).toContain("Не знайшов транзакцію");
    expect(localStorage.getItem("finyk_tx_cats")).toBeNull();
  });

  it("rejects a hallucinated category_id without writing an override", () => {
    seedRealTransaction();
    const out = asString(
      changeCategory({
        name: "change_category",
        input: { tx_id: REAL_TX, category_id: "cat_groceries_42" },
      }),
    );
    expect(out).toContain("Не знайшов категорію");
    expect(localStorage.getItem("finyk_tx_cats")).toBeNull();
  });

  it("accepts a real tx + real category and strips an echoed id: prefix", () => {
    seedRealTransaction();
    const out = asString(
      changeCategory({
        name: "change_category",
        input: { tx_id: `id:${REAL_TX}`, category_id: "transport" },
      }),
    );
    expect(out).toContain(REAL_TX);
    const cats = JSON.parse(localStorage.getItem("finyk_tx_cats") ?? "{}");
    expect(cats[REAL_TX]).toBe("transport");
  });

  it("accepts a mirrored bank transaction", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [{ id: "mono_1" } as unknown as Transaction],
    });
    const out = asString(
      changeCategory({
        name: "change_category",
        input: { tx_id: "mono_1", category_id: "food" },
      }),
    );
    expect(out).toContain("mono_1");
  });
});

describe("batch_categorize guards", () => {
  it("rejects a hallucinated category_id before any dry-run scan", () => {
    seedRealTransaction();
    const out = asString(
      batchCategorize({
        name: "batch_categorize",
        input: { pattern: "АТБ", category_id: "cat_groceries_42" },
      }),
    );
    expect(out).toContain("Не знайшов категорію");
    expect(localStorage.getItem("finyk_tx_cats")).toBeNull();
  });
});

describe("hide_transaction guards", () => {
  it("rejects a hallucinated tx_id without touching the hidden list", () => {
    seedRealTransaction();
    const out = asString(
      hideTransaction({
        name: "hide_transaction",
        input: { tx_id: "tx_999999" },
      }),
    );
    expect(out).toContain("Не знайшов транзакцію");
    expect(localStorage.getItem("finyk_hidden_txs")).toBeNull();
  });

  it("stays idempotent for an already-hidden real transaction", () => {
    seedRealTransaction();
    localStorage.setItem("finyk_hidden_txs", JSON.stringify([REAL_TX]));
    const out = asString(
      hideTransaction({ name: "hide_transaction", input: { tx_id: REAL_TX } }),
    );
    expect(out).toContain("приховано");
    const hidden = JSON.parse(
      localStorage.getItem("finyk_hidden_txs") ?? "[]",
    ) as string[];
    expect(hidden.filter((x) => x === REAL_TX)).toHaveLength(1);
  });
});

describe("split_transaction guards", () => {
  it("rejects a hallucinated tx_id without writing splits", () => {
    seedRealTransaction();
    const out = asString(
      splitTransaction({
        name: "split_transaction",
        input: {
          tx_id: "tx_999999",
          parts: [
            { category_id: "food", amount: 100 },
            { category_id: "transport", amount: 100 },
          ],
        },
      }),
    );
    expect(out).toContain("Не знайшов транзакцію");
    expect(localStorage.getItem("finyk_tx_splits")).toBeNull();
  });

  it("rejects a hallucinated category_id in a part without writing splits", () => {
    seedRealTransaction();
    const out = asString(
      splitTransaction({
        name: "split_transaction",
        input: {
          tx_id: REAL_TX,
          parts: [
            { category_id: "food", amount: 100 },
            { category_id: "cat_groceries_42", amount: 100 },
          ],
        },
      }),
    );
    expect(out).toContain("Не знайшов категорію");
    expect(localStorage.getItem("finyk_tx_splits")).toBeNull();
  });
});

describe("set_budget_limit guards", () => {
  it("rejects a hallucinated category_id without writing a budget", () => {
    const out = asString(
      setBudgetLimit({
        name: "set_budget_limit",
        input: { category_id: "cat_groceries_42", limit: 5000 },
      }),
    );
    expect(out).toContain("Не знайшов категорію");
    expect(localStorage.getItem("finyk_budgets")).toBeNull();
  });

  it("accepts a user-defined custom category", () => {
    __setFinykSqliteStateCacheForTests({
      customCategories: [{ id: "c_1", label: "Котики" }],
    });
    const out = asString(
      setBudgetLimit({
        name: "set_budget_limit",
        input: { category_id: "c_1", limit: 5000 },
      }),
    );
    expect(out).toContain("5000");
    expect(localStorage.getItem("finyk_budgets")).not.toBeNull();
  });
});

describe("update_budget guards", () => {
  it("rejects a hallucinated category_id for scope='limit'", () => {
    const out = asString(
      updateBudget({
        name: "update_budget",
        input: {
          scope: "limit",
          category_id: "cat_groceries_42",
          limit: 1000,
        },
      } as unknown as UpdateBudgetAction),
    );
    expect(out).toContain("Не знайшов категорію");
    expect(localStorage.getItem("finyk_budgets")).toBeNull();
  });
});
