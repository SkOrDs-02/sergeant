import {
  buildDelete,
  buildLwwUpsert,
  type TableSpec,
} from "@sergeant/dualwrite-core";

import type { FinykBlobTable, FinykIdTable } from "./diff";

/**
 * Declarative TableSpecs + prebuilt SQL for the finyk dual-write adapter
 * (ADR-0073 крок 6, mobile mirror of web крок 5). Split out of `adapter.ts`
 * so each table family stays under the Hard Rule #18 `max-lines: 600` ceiling.
 *
 * Every string emitted here is byte-identical to the hand-written SQL the
 * adapter shipped before the migration — pinned by
 * `adapter.snapshot.test.ts`. The finyk families:
 *
 *  - **id-tables** (`finyk_hidden_*`): composite PK `(user_id, <id-col>)`,
 *    tombstone soft-delete. `strictly-newer` upsert, `soft` delete.
 *  - **blob-tables** (`data_json`): PK `id`, tombstone soft-delete.
 *  - **per-tx mappings** (`finyk_tx_categories` / `finyk_tx_splits` /
 *    `finyk_mono_debt_links`): composite PK `(user_id, transaction_id)`.
 *    Upsert is `strictly-newer`; DELETE is **hard, guard-less** — absence is
 *    the "no override" state (ADR-0073 § НЕ абстрагуємо #2, Open Q #2). The
 *    hard `DELETE` carries no `WHERE updated_at < ?` on purpose.
 *  - **time-series** (`finyk_networth_history`): composite PK
 *    `(user_id, month)`; no delete op.
 *  - **singleton prefs** (`finyk_prefs`): PK `user_id`.
 */

// -----------------------------------------------------------------------
// id-tables (composite-PK tombstones)
// -----------------------------------------------------------------------

const ID_COLUMN: Record<FinykIdTable, "account_id" | "transaction_id"> = {
  finyk_hidden_accounts: "account_id",
  finyk_hidden_transactions: "transaction_id",
};

function idUpsertSpec(table: FinykIdTable): TableSpec {
  const col = ID_COLUMN[table];
  return {
    table,
    insertClause: `INSERT INTO ${table}
       (user_id, ${col}, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
    conflictTarget: ["user_id", col],
    updateColumns: [
      { column: "updated_at" },
      { column: "deleted_at", value: "NULL" },
    ],
    upsertGuard: "strictly-newer",
    conflictIndent: 5,
    setIndent: 7,
  };
}

const ID_UPSERT_SQL: Record<FinykIdTable, string> = {
  finyk_hidden_accounts: buildLwwUpsert(idUpsertSpec("finyk_hidden_accounts")),
  finyk_hidden_transactions: buildLwwUpsert(
    idUpsertSpec("finyk_hidden_transactions"),
  ),
};

const ID_DELETE_SQL: Record<FinykIdTable, string> = {
  finyk_hidden_accounts: buildDelete({
    table: "finyk_hidden_accounts",
    deletePolicy: "soft",
    matchColumns: ["user_id", ID_COLUMN.finyk_hidden_accounts],
  }),
  finyk_hidden_transactions: buildDelete({
    table: "finyk_hidden_transactions",
    deletePolicy: "soft",
    matchColumns: ["user_id", ID_COLUMN.finyk_hidden_transactions],
  }),
};

export function idUpsertSql(table: FinykIdTable): string {
  return ID_UPSERT_SQL[table];
}

export function idDeleteSql(table: FinykIdTable): string {
  return ID_DELETE_SQL[table];
}

// -----------------------------------------------------------------------
// blob-tables (per-row + JSONB `data_json`)
// -----------------------------------------------------------------------

function blobUpsertSpec(table: FinykBlobTable): TableSpec {
  return {
    table,
    insertClause: `INSERT INTO ${table}
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)`,
    conflictTarget: ["id"],
    updateColumns: [
      { column: "data_json" },
      { column: "updated_at" },
      { column: "deleted_at", value: "NULL" },
    ],
    upsertGuard: "strictly-newer",
    conflictIndent: 5,
    setIndent: 7,
  };
}

const BLOB_TABLES: readonly FinykBlobTable[] = [
  "finyk_budgets",
  "finyk_subscriptions",
  "finyk_assets",
  "finyk_debts",
  "finyk_receivables",
  "finyk_custom_categories",
  "finyk_manual_expenses",
];

const BLOB_UPSERT_SQL = new Map<FinykBlobTable, string>(
  BLOB_TABLES.map((table) => [table, buildLwwUpsert(blobUpsertSpec(table))]),
);

const BLOB_DELETE_SQL = new Map<FinykBlobTable, string>(
  BLOB_TABLES.map((table) => [
    table,
    buildDelete({
      table,
      deletePolicy: "soft",
      matchColumns: ["id", "user_id"],
    }),
  ]),
);

export function blobUpsertSql(table: FinykBlobTable): string {
  return BLOB_UPSERT_SQL.get(table)!;
}

export function blobDeleteSql(table: FinykBlobTable): string {
  return BLOB_DELETE_SQL.get(table)!;
}

// -----------------------------------------------------------------------
// per-tx mappings (composite (user_id, transaction_id); hard guard-less DELETE)
// -----------------------------------------------------------------------

const TX_CATEGORY_UPSERT_SPEC: TableSpec = {
  table: "finyk_tx_categories",
  insertClause: `INSERT INTO finyk_tx_categories
       (user_id, transaction_id, category_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  conflictTarget: ["user_id", "transaction_id"],
  updateColumns: [{ column: "category_id" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const TX_SPLITS_UPSERT_SPEC: TableSpec = {
  table: "finyk_tx_splits",
  insertClause: `INSERT INTO finyk_tx_splits
       (user_id, transaction_id, splits_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  conflictTarget: ["user_id", "transaction_id"],
  updateColumns: [{ column: "splits_json" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const MONO_DEBT_LINK_UPSERT_SPEC: TableSpec = {
  table: "finyk_mono_debt_links",
  insertClause: `INSERT INTO finyk_mono_debt_links
       (user_id, transaction_id, debt_ids_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  conflictTarget: ["user_id", "transaction_id"],
  updateColumns: [{ column: "debt_ids_json" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

export const TX_CATEGORY_UPSERT_SQL = buildLwwUpsert(TX_CATEGORY_UPSERT_SPEC);
export const TX_SPLITS_UPSERT_SQL = buildLwwUpsert(TX_SPLITS_UPSERT_SPEC);
export const MONO_DEBT_LINK_UPSERT_SQL = buildLwwUpsert(
  MONO_DEBT_LINK_UPSERT_SPEC,
);

// Hard, guard-less DELETE — no `WHERE updated_at < ?` (ADR-0073, Open Q #2).
export const TX_CATEGORY_DELETE_SQL = buildDelete({
  table: "finyk_tx_categories",
  deletePolicy: "hard",
  matchColumns: ["user_id", "transaction_id"],
});
export const TX_SPLITS_DELETE_SQL = buildDelete({
  table: "finyk_tx_splits",
  deletePolicy: "hard",
  matchColumns: ["user_id", "transaction_id"],
});
export const MONO_DEBT_LINK_DELETE_SQL = buildDelete({
  table: "finyk_mono_debt_links",
  deletePolicy: "hard",
  matchColumns: ["user_id", "transaction_id"],
});

// -----------------------------------------------------------------------
// time-series (finyk_networth_history, composite (user_id, month))
// -----------------------------------------------------------------------

const NETWORTH_UPSERT_SPEC: TableSpec = {
  table: "finyk_networth_history",
  insertClause: `INSERT INTO finyk_networth_history
       (user_id, month, networth, snapshot_json, created_at, updated_at)
     VALUES (?, ?, ?, '{}', ?, ?)`,
  conflictTarget: ["user_id", "month"],
  updateColumns: [{ column: "networth" }, { column: "updated_at" }],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

export const NETWORTH_UPSERT_SQL = buildLwwUpsert(NETWORTH_UPSERT_SPEC);

// -----------------------------------------------------------------------
// singleton prefs (finyk_prefs, PK user_id)
// -----------------------------------------------------------------------

const PREFS_UPSERT_SPEC: TableSpec = {
  table: "finyk_prefs",
  insertClause: `INSERT INTO finyk_prefs
       (user_id, monthly_plan_json, show_balance,
        excluded_stat_tx_ids_json, dismissed_recurring_json,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  conflictTarget: ["user_id"],
  updateColumns: [
    { column: "monthly_plan_json" },
    { column: "show_balance" },
    { column: "excluded_stat_tx_ids_json" },
    { column: "dismissed_recurring_json" },
    { column: "updated_at" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

export const PREFS_UPSERT_SQL = buildLwwUpsert(PREFS_UPSERT_SPEC);
