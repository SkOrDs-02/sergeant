import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * SQLite Drizzle schemas for the Finyk module's normalized tables.
 *
 * Mirrors the Postgres counterpart at `packages/db-schema/src/pg/finyk.ts`
 * (which itself mirrors `apps/server/src/migrations/039_finyk_tables.sql`).
 * Hosts finyk state on SQLite for both web (sqlite-wasm via OPFS-SAH) and
 * mobile (`expo-sqlite`).
 *
 * Stage 4 / PR #035 of `docs/planning/storage-roadmap.md`.
 *
 * Differences from Postgres (same as nutrition / fizruk SQLite mirrors):
 * - `id` is TEXT (UUID stored as a string — SQLite has no native UUID).
 *   Generation is the client's responsibility (`crypto.randomUUID()`).
 * - All TIMESTAMPTZ columns are TEXT (ISO-8601 with offset).
 * - JSONB → TEXT (JSON stored as string in SQLite).
 * - BOOLEAN → INTEGER (`0` / `1`) — SQLite has no native boolean.
 * - REAL stays REAL (SQLite stores as 8-byte float; matches Postgres `real`).
 * - No FK to `"user"(id)` — the client SQLite database has no auth tables.
 * - Index names are `_lite`-suffixed to spot drift between server and
 *   client at code-review time.
 */

// ---------------------------------------------------------------------
// Composite-PK tombstone tables
// ---------------------------------------------------------------------

export const finykHiddenAccounts = sqliteTable(
  "finyk_hidden_accounts",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.accountId] }),
    index("finyk_hidden_accounts_user_active_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykHiddenTransactions = sqliteTable(
  "finyk_hidden_transactions",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_hidden_transactions_user_active_idx_lite")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// ---------------------------------------------------------------------
// Per-row + JSONB tables
// ---------------------------------------------------------------------

export const finykBudgets = sqliteTable(
  "finyk_budgets",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_budgets_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykSubscriptions = sqliteTable(
  "finyk_subscriptions",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_subscriptions_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykAssets = sqliteTable(
  "finyk_assets",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_assets_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykDebts = sqliteTable(
  "finyk_debts",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_debts_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykReceivables = sqliteTable(
  "finyk_receivables",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_receivables_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykCustomCategories = sqliteTable(
  "finyk_custom_categories",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_custom_categories_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykManualExpenses = sqliteTable(
  "finyk_manual_expenses",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_manual_expenses_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const finykTxFilters = sqliteTable(
  "finyk_tx_filters",
  {
    id: text().primaryKey(),
    userId: text("user_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("finyk_tx_filters_user_active_idx_lite")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// ---------------------------------------------------------------------
// Per-tx mapping tables
// ---------------------------------------------------------------------

export const finykTxCategories = sqliteTable(
  "finyk_tx_categories",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    categoryId: text("category_id").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_tx_categories_user_idx_lite").on(table.userId),
  ],
);

export const finykTxSplits = sqliteTable(
  "finyk_tx_splits",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    splitsJson: text("splits_json").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_tx_splits_user_idx_lite").on(table.userId),
  ],
);

export const finykMonoDebtLinks = sqliteTable(
  "finyk_mono_debt_links",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    debtIdsJson: text("debt_ids_json").notNull().default("[]"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_mono_debt_links_user_idx_lite").on(table.userId),
  ],
);

// ---------------------------------------------------------------------
// Time-series — networth_history
// ---------------------------------------------------------------------

export const finykNetworthHistory = sqliteTable(
  "finyk_networth_history",
  {
    userId: text("user_id").notNull(),
    month: text().notNull(),
    networth: real().notNull().default(0),
    snapshotJson: text("snapshot_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.month] }),
    index("finyk_networth_history_user_month_idx_lite").on(
      table.userId,
      sql`${table.month} DESC`,
    ),
  ],
);

// ---------------------------------------------------------------------
// Mono cache mirror — Stage 4 / PR #038
//
// Replicates the three Mono cache LS keys (FINYK_TX_CACHE,
// FINYK_INFO_CACHE, FINYK_TX_CACHE_LAST_GOOD) into per-row SQLite
// tables. Rows are upserted by `(user_id, tx_id)` with LWW comparison
// against Mono's own `time` field (Unix seconds) — Mono is the
// external source-of-truth, so write-ordering follows the API's
// monotonic clock rather than our local `updated_at`.
//
// No PG counterpart: server-side Mono integration already lives in
// `apps/server/src/modules/finyk/` with its own row-level Postgres
// schema, so we don't push these client mirrors back through op-log.
// ---------------------------------------------------------------------

export const finykMonoTransactions = sqliteTable(
  "finyk_mono_transactions",
  {
    userId: text("user_id").notNull(),
    txId: text("tx_id").notNull(),
    accountId: text("account_id").notNull(),
    monoTime: integer("mono_time").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.txId] }),
    index("finyk_mono_transactions_user_time_idx_lite").on(
      table.userId,
      sql`${table.monoTime} DESC`,
    ),
    index("finyk_mono_transactions_user_account_idx_lite").on(
      table.userId,
      table.accountId,
      sql`${table.monoTime} DESC`,
    ),
  ],
);

export const finykMonoAccounts = sqliteTable(
  "finyk_mono_accounts",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    dataJson: text("data_json").notNull().default("{}"),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.accountId] }),
    index("finyk_mono_accounts_user_idx_lite").on(table.userId),
  ],
);

export const finykMonoAccountSnapshots = sqliteTable(
  "finyk_mono_account_snapshots",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    snapshotAt: text("snapshot_at").notNull(),
    balance: integer().notNull().default(0),
    creditLimit: integer("credit_limit"),
    dataJson: text("data_json").notNull().default("{}"),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.accountId, table.snapshotAt],
    }),
    index("finyk_mono_account_snapshots_account_time_idx_lite").on(
      table.userId,
      table.accountId,
      sql`${table.snapshotAt} DESC`,
    ),
  ],
);

// ---------------------------------------------------------------------
// Singleton prefs
// ---------------------------------------------------------------------

export const finykPrefs = sqliteTable("finyk_prefs", {
  userId: text("user_id").primaryKey(),
  prefsJson: text("prefs_json").notNull().default("{}"),
  monthlyPlanJson: text("monthly_plan_json").notNull().default("{}"),
  showBalance: integer("show_balance").notNull().default(1),
  excludedStatTxIdsJson: text("excluded_stat_tx_ids_json")
    .notNull()
    .default("[]"),
  dismissedRecurringJson: text("dismissed_recurring_json")
    .notNull()
    .default("[]"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});
