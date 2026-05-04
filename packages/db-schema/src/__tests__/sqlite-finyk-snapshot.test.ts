import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  finykHiddenAccounts,
  finykHiddenTransactions,
  finykBudgets,
  finykSubscriptions,
  finykAssets,
  finykDebts,
  finykReceivables,
  finykCustomCategories,
  finykManualExpenses,
  finykTxFilters,
  finykTxCategories,
  finykTxSplits,
  finykMonoDebtLinks,
  finykNetworthHistory,
  finykPrefs,
} from "../sqlite/finyk.js";
import {
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
} from "../sqlite/migrations/index.js";

/**
 * Snapshot tests for the SQLite Drizzle schemas under `sqlite/finyk.ts`,
 * mirroring the structural lock-down that `pg-finyk-snapshot.test.ts`
 * applies to the Postgres source-of-truth.
 *
 * Stage 4 / PR #035 of `docs/planning/storage-roadmap.md`. PG↔SQLite
 * schemas must stay aligned so push/pull round-trips are symmetric.
 *
 * The five-group structure (composite-PK tombstone, per-row+JSONB,
 * per-tx mapping, time-series, singleton prefs) is the test's
 * organising principle — one describe block per group.
 */

// ---------------------------------------------------------------------
// Group 1 — composite-PK tombstone
// ---------------------------------------------------------------------

describe("sqlite/finykHiddenAccounts schema snapshot", () => {
  const config = getTableConfig(finykHiddenAccounts);

  it("has the canonical table name", () => {
    expect(config.name).toBe("finyk_hidden_accounts");
  });

  it("declares all expected columns", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "account_id",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("uses (user_id, account_id) composite PK", () => {
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "account_id",
    ]);
  });

  it("declares the `_lite`-suffixed soft-delete partial index", () => {
    const idxNames = config.indexes.map((i) => i.config.name);
    expect(idxNames).toContain("finyk_hidden_accounts_user_active_idx_lite");
  });
});

describe("sqlite/finykHiddenTransactions schema snapshot", () => {
  const config = getTableConfig(finykHiddenTransactions);

  it("uses (user_id, transaction_id) composite PK", () => {
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
    ]);
  });

  it("`_lite`-suffixed soft-delete partial index is declared", () => {
    expect(config.indexes.map((i) => i.config.name)).toContain(
      "finyk_hidden_transactions_user_active_idx_lite",
    );
  });
});

// ---------------------------------------------------------------------
// Group 2 — per-row + JSONB→TEXT
// ---------------------------------------------------------------------

const PER_ROW_TABLES: ReadonlyArray<{
  name: string;
  table: ReturnType<typeof getTableConfig>;
}> = [
  { name: "finyk_budgets", table: getTableConfig(finykBudgets) },
  { name: "finyk_subscriptions", table: getTableConfig(finykSubscriptions) },
  { name: "finyk_assets", table: getTableConfig(finykAssets) },
  { name: "finyk_debts", table: getTableConfig(finykDebts) },
  { name: "finyk_receivables", table: getTableConfig(finykReceivables) },
  {
    name: "finyk_custom_categories",
    table: getTableConfig(finykCustomCategories),
  },
  {
    name: "finyk_manual_expenses",
    table: getTableConfig(finykManualExpenses),
  },
  { name: "finyk_tx_filters", table: getTableConfig(finykTxFilters) },
];

describe.each(PER_ROW_TABLES)(
  "sqlite/$name (per-row + data_json TEXT)",
  ({ name, table }) => {
    it("declares the canonical (id, user_id, data_json, created_at, updated_at, deleted_at) shape", () => {
      expect(table.columns.map((c) => c.name)).toEqual([
        "id",
        "user_id",
        "data_json",
        "created_at",
        "updated_at",
        "deleted_at",
      ]);
    });

    it("id is TEXT PK (UUID-as-string), data_json is TEXT NOT NULL DEFAULT '{}'", () => {
      const cols = Object.fromEntries(table.columns.map((c) => [c.name, c]));
      expect(cols["id"]!.dataType).toBe("string");
      expect(cols["id"]!.primary).toBe(true);
      expect(cols["data_json"]!.dataType).toBe("string");
      expect(cols["data_json"]!.notNull).toBe(true);
      expect(cols["data_json"]!.hasDefault).toBe(true);
      expect(cols["deleted_at"]!.notNull).toBe(false);
    });

    it("declares the `_lite` soft-delete partial index", () => {
      expect(table.indexes.map((i) => i.config.name)).toContain(
        `${name}_user_active_idx_lite`,
      );
    });
  },
);

// ---------------------------------------------------------------------
// Group 3 — per-tx mapping
// ---------------------------------------------------------------------

describe("sqlite/finykTxCategories schema snapshot", () => {
  const config = getTableConfig(finykTxCategories);

  it("declares the canonical column shape", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
      "category_id",
      "created_at",
      "updated_at",
    ]);
  });

  it("uses (user_id, transaction_id) composite PK", () => {
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
    ]);
  });

  it("has no soft-delete column", () => {
    expect(config.columns.map((c) => c.name)).not.toContain("deleted_at");
  });
});

describe("sqlite/finykTxSplits schema snapshot", () => {
  const config = getTableConfig(finykTxSplits);

  it("declares splits_json TEXT NOT NULL DEFAULT '[]'", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["splits_json"]!.dataType).toBe("string");
    expect(cols["splits_json"]!.notNull).toBe(true);
    expect(cols["splits_json"]!.hasDefault).toBe(true);
  });

  it("uses (user_id, transaction_id) composite PK", () => {
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
    ]);
  });
});

describe("sqlite/finykMonoDebtLinks schema snapshot", () => {
  const config = getTableConfig(finykMonoDebtLinks);

  it("declares debt_ids_json TEXT NOT NULL DEFAULT '[]'", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["debt_ids_json"]!.dataType).toBe("string");
    expect(cols["debt_ids_json"]!.notNull).toBe(true);
    expect(cols["debt_ids_json"]!.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Group 4 — time-series
// ---------------------------------------------------------------------

describe("sqlite/finykNetworthHistory schema snapshot", () => {
  const config = getTableConfig(finykNetworthHistory);

  it("declares the canonical column shape", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "month",
      "networth",
      "snapshot_json",
      "created_at",
      "updated_at",
    ]);
  });

  it("uses (user_id, month) composite PK", () => {
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "month",
    ]);
  });

  it("month is TEXT, networth is REAL DEFAULT 0", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["month"]!.dataType).toBe("string");
    expect(cols["networth"]!.dataType).toBe("number");
    expect(cols["networth"]!.notNull).toBe(true);
    expect(cols["networth"]!.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Group 5 — singleton prefs
// ---------------------------------------------------------------------

describe("sqlite/finykPrefs schema snapshot", () => {
  const config = getTableConfig(finykPrefs);

  it("declares the canonical singleton column shape", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "prefs_json",
      "monthly_plan_json",
      "show_balance",
      "created_at",
      "updated_at",
    ]);
  });

  it("user_id is the primary key", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["user_id"]!.primary).toBe(true);
  });

  it("show_balance is INTEGER (boolean → 0/1) NOT NULL DEFAULT 1", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["show_balance"]!.dataType).toBe("number");
    expect(cols["show_balance"]!.notNull).toBe(true);
    expect(cols["show_balance"]!.hasDefault).toBe(true);
  });

  it("prefs_json + monthly_plan_json are TEXT NOT NULL DEFAULT '{}'", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["prefs_json"]!.dataType).toBe("string");
    expect(cols["prefs_json"]!.notNull).toBe(true);
    expect(cols["prefs_json"]!.hasDefault).toBe(true);
    expect(cols["monthly_plan_json"]!.dataType).toBe("string");
    expect(cols["monthly_plan_json"]!.notNull).toBe(true);
    expect(cols["monthly_plan_json"]!.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Migrations export contract
// ---------------------------------------------------------------------

describe("sqlite/finyk migrations exports", () => {
  it("exports a single 001_finyk_tables.sql migration", () => {
    expect(FINYK_CLIENT_MIGRATIONS).toHaveLength(1);
    expect(FINYK_CLIENT_MIGRATIONS[0]!.name).toBe("001_finyk_tables.sql");
  });

  it("inline SQL contains every finyk_* table CREATE", () => {
    const sql = FINYK_CLIENT_MIGRATIONS[0]!.sql;
    for (const table of [
      "finyk_hidden_accounts",
      "finyk_hidden_transactions",
      "finyk_budgets",
      "finyk_subscriptions",
      "finyk_assets",
      "finyk_debts",
      "finyk_receivables",
      "finyk_tx_categories",
      "finyk_tx_splits",
      "finyk_mono_debt_links",
      "finyk_networth_history",
      "finyk_custom_categories",
      "finyk_manual_expenses",
      "finyk_tx_filters",
      "finyk_prefs",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    }
  });

  it("uses a separate `__finyk_migrations` ledger table", () => {
    expect(FINYK_MIGRATIONS_TABLE).toBe("__finyk_migrations");
  });
});
