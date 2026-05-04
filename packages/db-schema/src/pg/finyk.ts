import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Postgres Drizzle schemas for the Finyk module's normalized cloud-sync
 * target tables.
 *
 * Stage 4 / PR #035 of `docs/planning/storage-roadmap.md` — mirrors
 * `apps/server/src/migrations/039_finyk_tables.sql` byte-for-byte
 * (column ordering, types, defaults, indexes). Snapshot tests under
 * `packages/db-schema/src/__tests__/pg-finyk-snapshot.test.ts` lock
 * the shape so accidental drift between this Drizzle schema and the
 * raw migration trips CI before it lands on main.
 *
 * Pattern reuse: the same five table shapes appear across the 15 finyk
 * tables (per-row+JSONB, composite-PK tombstone, per-tx mapping,
 * time-series, singleton prefs). See the migration's header comment
 * for the rationale; each individual table doc-comment below repeats
 * just enough context to be self-contained.
 */

// ---------------------------------------------------------------------
// Composite-PK tombstone tables — hidden_accounts / hidden_transactions
// ---------------------------------------------------------------------

/**
 * Per-user set of Mono account ids the user has hidden from the UI.
 * Composite PK on `(user_id, account_id)`; soft-delete tombstone via
 * `deleted_at` keeps LWW honest when an "unhide" on device A races a
 * stale "hide" replay from device B.
 */
export const finykHiddenAccounts = pgTable(
  "finyk_hidden_accounts",
  {
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.accountId] }),
    index("finyk_hidden_accounts_user_active_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/**
 * Per-user set of Mono transaction ids hidden from the UI. Same shape
 * as `finykHiddenAccounts` but keyed on `transaction_id`.
 */
export const finykHiddenTransactions = pgTable(
  "finyk_hidden_transactions",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_hidden_transactions_user_active_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// ---------------------------------------------------------------------
// Per-row + JSONB tables — open-ended user-edited shapes
// ---------------------------------------------------------------------

/**
 * Per-row budget entries. `data_json` holds the open-ended `Budget`
 * shape (categoryId, type, targetAmount, period, …) — UI reads the
 * whole row at once so column-splitting buys nothing.
 */
export const finykBudgets = pgTable(
  "finyk_budgets",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_budgets_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Per-row recurring-payment definitions (`Subscription` shape). */
export const finykSubscriptions = pgTable(
  "finyk_subscriptions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_subscriptions_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Per-row manually tracked assets (`ManualAsset` shape). */
export const finykAssets = pgTable(
  "finyk_assets",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_assets_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Per-row manually tracked debts the user owes (`Debt` shape from `debtEngine`). */
export const finykDebts = pgTable(
  "finyk_debts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_debts_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Money owed TO the user (`Receivable` shape). Same DDL as `finykDebts`. */
export const finykReceivables = pgTable(
  "finyk_receivables",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_receivables_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** User-defined transaction categories (label/color/icon/parentId). */
export const finykCustomCategories = pgTable(
  "finyk_custom_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_custom_categories_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** User-entered cash expenses outside Mono (`ManualExpense` shape). */
export const finykManualExpenses = pgTable(
  "finyk_manual_expenses",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_manual_expenses_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

/** Saved transaction filter presets (date range, accounts, categories). */
export const finykTxFilters = pgTable(
  "finyk_tx_filters",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    dataJson: jsonb("data_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("finyk_tx_filters_user_active_idx")
      .on(table.userId, table.deletedAt)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// ---------------------------------------------------------------------
// Per-tx mapping tables — composite-PK on (user_id, transaction_id)
// ---------------------------------------------------------------------

/**
 * Per-transaction category override. The LS shape is
 * `Record<txId, categoryId>` with `undefined` values meaning "fall
 * back to MCC default". No `deleted_at` — absence of a row is the
 * "no override" state, so sync `delete` ops just `DELETE FROM`.
 */
export const finykTxCategories = pgTable(
  "finyk_tx_categories",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    categoryId: text("category_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_tx_categories_user_idx").on(table.userId),
  ],
);

/**
 * Per-transaction split definitions. LS shape is
 * `Record<txId, TxSplit[]>`; the array goes into `splits_json`.
 */
export const finykTxSplits = pgTable(
  "finyk_tx_splits",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    splitsJson: jsonb("splits_json").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_tx_splits_user_idx").on(table.userId),
  ],
);

/**
 * Maps Mono transactions to manual debts. LS shape is
 * `Record<txId, debtId[]>`; `debt_ids_json` is the array of
 * `finyk_debts.id` strings.
 */
export const finykMonoDebtLinks = pgTable(
  "finyk_mono_debt_links",
  {
    userId: text("user_id").notNull(),
    transactionId: text("transaction_id").notNull(),
    debtIdsJson: jsonb("debt_ids_json").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.transactionId] }),
    index("finyk_mono_debt_links_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------
// Time-series — networth_history (one row per (user, month))
// ---------------------------------------------------------------------

/**
 * Monthly net-worth snapshots. `month` stays TEXT (`YYYY-MM`) so LWW
 * comparisons / API round-trips match the LS `NetworthEntry` shape
 * byte-for-byte. `snapshot_json` reserves space for richer per-month
 * payloads (per-asset breakdowns, FX rate at snapshot time) without a
 * follow-up migration.
 */
export const finykNetworthHistory = pgTable(
  "finyk_networth_history",
  {
    userId: text("user_id").notNull(),
    month: text().notNull(),
    networth: real().notNull().default(0),
    snapshotJson: jsonb("snapshot_json").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.month] }),
    index("finyk_networth_history_user_month_idx").on(
      table.userId,
      sql`${table.month} DESC`,
    ),
  ],
);

// ---------------------------------------------------------------------
// Singleton prefs — one row per user
// ---------------------------------------------------------------------

/**
 * Per-user singleton row of finyk preferences. `monthly_plan_json`
 * carries `MonthlyPlan` (income/expense/savings — kept as the original
 * LS string-or-number shape). `show_balance` is split out of the
 * open-ended `prefs_json` so multi-device LWW on the
 * balance-visibility toggle doesn't have to merge the JSONB. `user_id`
 * is the PK — exactly one row per user.
 */
export const finykPrefs = pgTable("finyk_prefs", {
  userId: text("user_id").primaryKey(),
  prefsJson: jsonb("prefs_json").notNull().default({}),
  monthlyPlanJson: jsonb("monthly_plan_json").notNull().default({}),
  showBalance: boolean("show_balance").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
