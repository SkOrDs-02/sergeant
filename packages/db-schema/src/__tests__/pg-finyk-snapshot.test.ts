import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
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
} from "../pg/finyk.js";

/**
 * Snapshot tests for the Postgres Drizzle schemas under `pg/finyk.ts`,
 * locking down the column ordering, types, nullability, indexes, and
 * defaults that mirror migration 039_finyk_tables.sql.
 *
 * Stage 4 / PR #035 of `docs/planning/storage-roadmap.md`. Pattern
 * mirrors `pg-nutrition-snapshot.test.ts` — same structure, but the
 * 15 tables here split into five groups (see migration header for
 * rationale). The five-group structure is the test's organising
 * principle: one describe block per group of tables that share the
 * same shape, so a regression in any single group surfaces as a
 * focused failure rather than a blob of unrelated diffs.
 */

// ---------------------------------------------------------------------
// Group 1 — composite-PK tombstone
// ---------------------------------------------------------------------

describe("pg/finykHiddenAccounts schema snapshot", () => {
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

  it("declares (user_id, account_id) as a composite primary key", () => {
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "account_id",
    ]);
  });

  it("declares the soft-delete partial index", () => {
    expect(config.indexes.map((i) => i.config.name)).toContain(
      "finyk_hidden_accounts_user_active_idx",
    );
  });
});

describe("pg/finykHiddenTransactions schema snapshot", () => {
  const config = getTableConfig(finykHiddenTransactions);

  it("has the canonical table name", () => {
    expect(config.name).toBe("finyk_hidden_transactions");
  });

  it("declares all expected columns", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
      "created_at",
      "updated_at",
      "deleted_at",
    ]);
  });

  it("declares (user_id, transaction_id) as a composite primary key", () => {
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.primaryKeys[0]!.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
    ]);
  });
});

// ---------------------------------------------------------------------
// Group 2 — per-row + JSONB
// ---------------------------------------------------------------------

const PER_ROW_JSONB_TABLES: ReadonlyArray<{
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

describe.each(PER_ROW_JSONB_TABLES)(
  "pg/$name (per-row + JSONB)",
  ({ name, table }) => {
    it("has the canonical table name", () => {
      expect(table.name).toBe(name);
    });

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

    it("uses uuid() PK with default", () => {
      const cols = Object.fromEntries(table.columns.map((c) => [c.name, c]));
      expect(cols["id"]!.columnType).toBe("PgUUID");
      expect(cols["id"]!.primary).toBe(true);
      expect(cols["id"]!.hasDefault).toBe(true);
      expect(cols["data_json"]!.columnType).toBe("PgJsonb");
      expect(cols["data_json"]!.notNull).toBe(true);
      expect(cols["data_json"]!.hasDefault).toBe(true);
      expect(cols["deleted_at"]!.notNull).toBe(false);
    });

    it("declares the (user_id, deleted_at) soft-delete partial index", () => {
      const idxNames = table.indexes.map((i) => i.config.name);
      expect(idxNames).toContain(`${name}_user_active_idx`);
      const idx = table.indexes.find(
        (i) => i.config.name === `${name}_user_active_idx`,
      )!;
      expect(idx.config.where).toBeDefined();
    });
  },
);

// ---------------------------------------------------------------------
// Group 3 — per-tx mapping (composite PK on (user_id, transaction_id))
// ---------------------------------------------------------------------

describe("pg/finykTxCategories schema snapshot", () => {
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

  it("declares no soft-delete column (delete = DELETE FROM)", () => {
    expect(config.columns.map((c) => c.name)).not.toContain("deleted_at");
  });

  it("category_id is a NOT NULL TEXT", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["category_id"]!.dataType).toBe("string");
    expect(cols["category_id"]!.notNull).toBe(true);
  });
});

describe("pg/finykTxSplits schema snapshot", () => {
  const config = getTableConfig(finykTxSplits);

  it("declares the canonical column shape with splits_json", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
      "splits_json",
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

  it("splits_json is JSONB with default '[]'", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["splits_json"]!.columnType).toBe("PgJsonb");
    expect(cols["splits_json"]!.notNull).toBe(true);
    expect(cols["splits_json"]!.hasDefault).toBe(true);
  });
});

describe("pg/finykMonoDebtLinks schema snapshot", () => {
  const config = getTableConfig(finykMonoDebtLinks);

  it("declares the canonical column shape with debt_ids_json", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "transaction_id",
      "debt_ids_json",
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
});

// ---------------------------------------------------------------------
// Group 4 — time-series networth history
// ---------------------------------------------------------------------

describe("pg/finykNetworthHistory schema snapshot", () => {
  const config = getTableConfig(finykNetworthHistory);

  it("declares the canonical (user_id, month, networth, snapshot_json, …) shape", () => {
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

  it("month stays TEXT (not DATE) so LWW matches LS byte-for-byte", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["month"]!.columnType).toBe("PgText");
    expect(cols["month"]!.notNull).toBe(true);
  });

  it("networth is REAL with default 0", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["networth"]!.columnType).toBe("PgReal");
    expect(cols["networth"]!.notNull).toBe(true);
    expect(cols["networth"]!.hasDefault).toBe(true);
  });

  it("snapshot_json is JSONB with default '{}'", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["snapshot_json"]!.columnType).toBe("PgJsonb");
    expect(cols["snapshot_json"]!.notNull).toBe(true);
    expect(cols["snapshot_json"]!.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------
// Group 5 — singleton prefs
// ---------------------------------------------------------------------

describe("pg/finykPrefs schema snapshot", () => {
  const config = getTableConfig(finykPrefs);

  it("declares the canonical singleton column shape", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "prefs_json",
      "monthly_plan_json",
      "show_balance",
      "excluded_stat_tx_ids",
      "dismissed_recurring",
      "created_at",
      "updated_at",
    ]);
  });

  it("user_id is the primary key (singleton — exactly one row per user)", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["user_id"]!.primary).toBe(true);
  });

  it("show_balance is a NOT NULL boolean with default true", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["show_balance"]!.columnType).toBe("PgBoolean");
    expect(cols["show_balance"]!.notNull).toBe(true);
    expect(cols["show_balance"]!.hasDefault).toBe(true);
  });

  it("prefs_json + monthly_plan_json are both JSONB with object defaults", () => {
    const cols = Object.fromEntries(config.columns.map((c) => [c.name, c]));
    expect(cols["prefs_json"]!.columnType).toBe("PgJsonb");
    expect(cols["prefs_json"]!.hasDefault).toBe(true);
    expect(cols["monthly_plan_json"]!.columnType).toBe("PgJsonb");
    expect(cols["monthly_plan_json"]!.hasDefault).toBe(true);
  });
});
