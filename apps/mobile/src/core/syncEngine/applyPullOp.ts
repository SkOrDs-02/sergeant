import type { SyncV2PullOp } from "@sergeant/api-client";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

export type ApplyPullOutcome = "applied" | "skipped" | "rejected";

/** Mirrors `SYNC_V2_SUPPORTED_TABLES` on the server (`syncV2.ts`). */
export const CLIENT_PULL_SUPPORTED_TABLES = new Set<string>([
  "routine_entries",
  "routine_streaks",
  "routine_habits",
  "routine_tags",
  "routine_categories",
  "routine_prefs",
  "routine_pushups",
  "routine_habit_order",
  "routine_completion_notes",
  "fizruk_workouts",
  "fizruk_workout_items",
  "fizruk_workout_sets",
  "fizruk_custom_exercises",
  "fizruk_measurements",
  "fizruk_daily_log",
  "fizruk_monthly_plan",
  "fizruk_plan_templates",
  "fizruk_programs",
  "fizruk_wellbeing",
  "fizruk_workout_templates",
  "nutrition_meals",
  "nutrition_pantries",
  "nutrition_pantry_items",
  "nutrition_prefs",
  "nutrition_recipes",
  "nutrition_water_log",
  "nutrition_shopping_list",
  "finyk_hidden_accounts",
  "finyk_hidden_transactions",
  "finyk_budgets",
  "finyk_subscriptions",
  "finyk_assets",
  "finyk_debts",
  "finyk_receivables",
  "finyk_custom_categories",
  "finyk_manual_expenses",
  "finyk_tx_filters",
  "finyk_tx_categories",
  "finyk_tx_splits",
  "finyk_mono_debt_links",
  "finyk_networth_history",
  "finyk_prefs",
]);

const columnCache = new Map<string, string[]>();
const pkCache = new Map<string, string[]>();

function clientTsMs(op: SyncV2PullOp): number {
  return new Date(op.client_ts).getTime();
}

function isStaleLocal(updatedAt: string | null, incomingMs: number): boolean {
  if (updatedAt === null) return false;
  const localMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(localMs)) return false;
  return localMs >= incomingMs;
}

async function getTableColumns(
  client: SqliteMigrationClient,
  table: string,
): Promise<string[]> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const info = await client.all<{ name: string }>(
    `SELECT name FROM pragma_table_info(?)`,
    [table],
  );
  const cols = info.map((row) => row.name);
  columnCache.set(table, cols);
  return cols;
}

async function getPrimaryKeyColumns(
  client: SqliteMigrationClient,
  table: string,
): Promise<string[]> {
  const cached = pkCache.get(table);
  if (cached) return cached;
  const info = await client.all<{ name: string; pk: number }>(
    `SELECT name, pk FROM pragma_table_info(?)`,
    [table],
  );
  const pk = info
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
  pkCache.set(table, pk);
  return pk;
}

function coerceSqliteValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function applyRoutineEntries(
  client: SqliteMigrationClient,
  op: SyncV2PullOp,
  userId: string,
): Promise<ApplyPullOutcome> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id || row["user_id"] !== userId) return "rejected";

  const incomingMs = clientTsMs(op);
  const existing = await client.all<{
    updated_at: string;
    deleted_at: string | null;
  }>(
    `SELECT updated_at, deleted_at FROM routine_entries WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  const local = existing[0];
  if (local && isStaleLocal(local.updated_at, incomingMs)) return "skipped";
  if (local && local.deleted_at !== null && op.op !== "delete")
    return "skipped";

  if (op.op === "delete") {
    if (!local) return "skipped";
    await client.run(
      `UPDATE routine_entries
          SET deleted_at = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
      [op.client_ts, op.client_ts, id, userId],
    );
    return "applied";
  }

  const name = typeof row["name"] === "string" ? row["name"] : "";
  const completedAt =
    typeof row["completed_at"] === "string" ? row["completed_at"] : null;
  const createdAt =
    typeof row["created_at"] === "string" ? row["created_at"] : op.client_ts;
  const deletedAt =
    typeof row["deleted_at"] === "string" ? row["deleted_at"] : null;

  await client.run(
    `INSERT INTO routine_entries
       (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [id, userId, name, completedAt, createdAt, op.client_ts, deletedAt],
  );
  return "applied";
}

async function applyRoutineStreaks(
  client: SqliteMigrationClient,
  op: SyncV2PullOp,
  userId: string,
): Promise<ApplyPullOutcome> {
  const row = op.row;
  if (row["user_id"] !== userId) return "rejected";

  if (op.op === "increment") {
    const delta = row["delta"];
    if (typeof delta !== "number" || !Number.isInteger(delta))
      return "rejected";
    const seed = Math.max(0, delta);
    await client.run(
      `INSERT INTO routine_streaks
         (user_id, current_streak, longest_streak, last_completed_at)
       VALUES (?, ?, ?, NULL)
       ON CONFLICT(user_id) DO UPDATE SET
         current_streak = MAX(0, current_streak + ?),
         longest_streak = MAX(
           longest_streak,
           MAX(0, current_streak + ?)
         )`,
      [userId, seed, seed, delta, delta],
    );
    return "applied";
  }

  if (op.op === "delete") {
    await client.run(`DELETE FROM routine_streaks WHERE user_id = ?`, [userId]);
    return "applied";
  }

  const current =
    typeof row["current_streak"] === "number" ? row["current_streak"] : 0;
  const longest =
    typeof row["longest_streak"] === "number" ? row["longest_streak"] : 0;
  const lastCompleted =
    typeof row["last_completed_at"] === "string"
      ? row["last_completed_at"]
      : null;

  await client.run(
    `INSERT INTO routine_streaks
       (user_id, current_streak, longest_streak, last_completed_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       current_streak = excluded.current_streak,
       longest_streak = excluded.longest_streak,
       last_completed_at = excluded.last_completed_at`,
    [userId, current, longest, lastCompleted],
  );
  return "applied";
}

async function applyGenericRegistryRow(
  client: SqliteMigrationClient,
  table: string,
  op: SyncV2PullOp,
  userId: string,
): Promise<ApplyPullOutcome> {
  const row = op.row;
  if (row["user_id"] !== userId) return "rejected";

  const columns = await getTableColumns(client, table);
  const pkColumns = await getPrimaryKeyColumns(client, table);
  if (pkColumns.length === 0) return "rejected";

  const pkValues = pkColumns.map((col) => {
    const value = row[col];
    return typeof value === "string" || typeof value === "number"
      ? value
      : null;
  });
  if (pkValues.some((value) => value === null)) return "rejected";

  const incomingMs = clientTsMs(op);
  const whereClause = pkColumns.map((col) => `${col} = ?`).join(" AND ");
  const hasUpdatedAt = columns.includes("updated_at");
  const hasDeletedAt = columns.includes("deleted_at");

  if (hasUpdatedAt) {
    const existing = await client.all<{
      updated_at: string;
      deleted_at: string | null;
    }>(
      `SELECT updated_at${hasDeletedAt ? ", deleted_at" : ""}
         FROM ${table}
        WHERE ${whereClause}`,
      pkValues,
    );
    const local = existing[0];
    if (local && isStaleLocal(local.updated_at, incomingMs)) return "skipped";
    if (
      hasDeletedAt &&
      local &&
      local.deleted_at !== null &&
      op.op !== "delete"
    ) {
      return "skipped";
    }
  }

  if (op.op === "delete") {
    if (!hasDeletedAt) return "rejected";
    await client.run(
      `UPDATE ${table}
          SET deleted_at = ?, updated_at = ?
        WHERE ${whereClause}`,
      [op.client_ts, op.client_ts, ...pkValues],
    );
    return "applied";
  }

  const payload: Record<string, unknown> = { ...row, updated_at: op.client_ts };
  const insertCols = columns.filter((col) => payload[col] !== undefined);
  if (!insertCols.includes("updated_at") && hasUpdatedAt) {
    insertCols.push("updated_at");
    payload["updated_at"] = op.client_ts;
  }

  const placeholders = insertCols.map(() => "?").join(", ");
  const values = insertCols.map((col) => coerceSqliteValue(payload[col]));
  const nonPkAssignments = insertCols
    .filter((col) => !pkColumns.includes(col))
    .map((col) => `${col} = excluded.${col}`)
    .join(", ");

  if (nonPkAssignments.length === 0) return "skipped";

  await client.run(
    `INSERT INTO ${table} (${insertCols.join(", ")})
     VALUES (${placeholders})
     ON CONFLICT(${pkColumns.join(", ")}) DO UPDATE SET ${nonPkAssignments}`,
    values,
  );
  return "applied";
}

const SPECIAL_HANDLERS: Record<
  string,
  (
    client: SqliteMigrationClient,
    op: SyncV2PullOp,
    userId: string,
  ) => Promise<ApplyPullOutcome>
> = {
  routine_entries: applyRoutineEntries,
  routine_streaks: applyRoutineStreaks,
};

/**
 * Apply one server-side op into the local SQLite module tables.
 * LWW-guard uses strict `>` semantics (ADR-0004 / R1).
 */
export async function applyPullOp(
  client: SqliteMigrationClient,
  op: SyncV2PullOp,
  userId: string,
  localDeviceId: string,
): Promise<ApplyPullOutcome> {
  if (op.origin_device_id !== null && op.origin_device_id === localDeviceId) {
    return "skipped";
  }

  if (!CLIENT_PULL_SUPPORTED_TABLES.has(op.table)) {
    return "rejected";
  }

  const special = SPECIAL_HANDLERS[op.table];
  if (special) {
    return special(client, op, userId);
  }
  return applyGenericRegistryRow(client, op.table, op, userId);
}

/** Test-only: clear pragma caches between cases. */
export function __resetApplyPullOpCachesForTests(): void {
  columnCache.clear();
  pkCache.clear();
}
