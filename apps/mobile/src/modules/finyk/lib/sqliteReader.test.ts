import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
  refreshFinykSqliteState,
} from "./sqliteReader";

type Row = Record<string, unknown>;

function makeClient(rowsByTable: Record<string, Row[]>): SqliteMigrationClient {
  const all = jest.fn(<T>(sql: string): Promise<T[]> => {
    const table = resolveTable(sql);
    return Promise.resolve((rowsByTable[table] ?? []) as T[]);
  });

  return { all } as unknown as SqliteMigrationClient;
}

function resolveTable(sql: string): string {
  const match = sql.match(/FROM\s+([a-z_]+)/);
  if (!match?.[1]) throw new Error(`Unable to resolve table from SQL: ${sql}`);
  return match[1];
}

describe("refreshFinykSqliteState", () => {
  beforeEach(() => {
    clearFinykSqliteCache();
  });

  it("hydrates the warm cache from all finyk sqlite tables", async () => {
    const client = makeClient({
      finyk_hidden_accounts: [{ account_id: "acc-hidden" }],
      finyk_hidden_transactions: [{ transaction_id: "tx-hidden" }],
      finyk_budgets: [
        { id: "budget-1", data_json: '{"name":"Food","limit":120000}' },
        { id: "budget-bad-json", data_json: "{" },
      ],
      finyk_subscriptions: [
        { id: "sub-1", data_json: '{"name":"Music","amount":9900}' },
      ],
      finyk_assets: [
        { id: "asset-1", data_json: '{"name":"Cash","value":500000}' },
      ],
      finyk_debts: [
        { id: "debt-1", data_json: '{"name":"Card","amount":100000}' },
      ],
      finyk_receivables: [
        { id: "recv-1", data_json: '{"name":"Friend","amount":25000}' },
      ],
      finyk_custom_categories: [
        { id: "cat-1", data_json: '{"label":"Pets","emoji":"dog"}' },
        { id: "cat-null", data_json: null },
      ],
      finyk_manual_expenses: [
        {
          id: "expense-1",
          data_json:
            '{"date":"2026-07-20","description":"Coffee","amount":12000,"category":"food"}',
        },
      ],
      finyk_tx_categories: [
        { transaction_id: "tx-1", category_id: "groceries" },
      ],
      finyk_tx_splits: [
        {
          transaction_id: "tx-2",
          splits_json: '[{"category":"food","amount":7000}]',
        },
        { transaction_id: "tx-empty-splits", splits_json: "not json" },
      ],
      finyk_mono_debt_links: [
        { transaction_id: "tx-3", debt_ids_json: '["debt-1"]' },
        { transaction_id: "tx-empty-links", debt_ids_json: "not json" },
      ],
      finyk_networth_history: [
        { month: "2026-06", networth: 123456 },
        { month: "2026-07", networth: null },
      ],
      finyk_prefs: [
        {
          user_id: "user-1",
          prefs_json: "{}",
          monthly_plan_json: '{"income":200000,"expense":150000}',
          show_balance: 0,
          excluded_stat_tx_ids_json: '["tx-4",7,""]',
          dismissed_recurring_json: "not json",
        },
      ],
    });

    const cache = await refreshFinykSqliteState(client, "user-1");

    expect(cache).toEqual(
      expect.objectContaining({
        hiddenAccounts: ["acc-hidden"],
        hiddenTransactions: ["tx-hidden"],
        budgets: [{ id: "budget-1", name: "Food", limit: 120000 }],
        subscriptions: [{ id: "sub-1", name: "Music", amount: 9900 }],
        manualAssets: [{ id: "asset-1", name: "Cash", value: 500000 }],
        manualDebts: [{ id: "debt-1", name: "Card", amount: 100000 }],
        receivables: [{ id: "recv-1", name: "Friend", amount: 25000 }],
        customCategories: [{ id: "cat-1", label: "Pets", emoji: "dog" }],
        manualExpenses: [
          {
            id: "expense-1",
            date: "2026-07-20",
            description: "Coffee",
            amount: 12000,
            category: "food",
          },
        ],
        txCategories: { "tx-1": "groceries" },
        txSplits: {
          "tx-2": [{ category: "food", amount: 7000 }],
          "tx-empty-splits": [],
        },
        monoDebtLinkedTxIds: {
          "tx-3": ["debt-1"],
          "tx-empty-links": [],
        },
        networthHistory: [
          { month: "2026-06", networth: 123456 },
          { month: "2026-07", networth: 0 },
        ],
        monthlyPlan: { income: 200000, expense: 150000 },
        showBalance: false,
        excludedStatTxIds: ["tx-4"],
        dismissedRecurring: [],
      }),
    );
    expect(cache.refreshedAt).toEqual(expect.any(String));
    expect(getCachedFinykSqliteState()).toBe(cache);
  });

  it("clears the cache back to empty defaults", async () => {
    await refreshFinykSqliteState(
      makeClient({
        finyk_hidden_accounts: [{ account_id: "acc-hidden" }],
      }),
      "user-1",
    );

    clearFinykSqliteCache();

    expect(getCachedFinykSqliteState()).toEqual(
      expect.objectContaining({
        hiddenAccounts: [],
        hiddenTransactions: [],
        monthlyPlan: null,
        showBalance: null,
        excludedStatTxIds: null,
        dismissedRecurring: null,
        refreshedAt: null,
      }),
    );
  });
});
