import {
  buildDelete,
  buildLwwUpsert,
  toIntOrNull,
  toRealOrNull,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukDailyLogSnapshot } from "./diff";

// -----------------------------------------------------------------------
// Table spec
// -----------------------------------------------------------------------

const DAILY_LOG_UPSERT_SPEC: TableSpec = {
  table: "fizruk_daily_log",
  insertClause: `INSERT INTO fizruk_daily_log
       (id, user_id, entry_at, weight_kg, sleep_hours, energy_level, mood,
        note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "entry_at" },
    { column: "weight_kg" },
    { column: "sleep_hours" },
    { column: "energy_level" },
    { column: "mood" },
    { column: "note" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
  // Hand-written SQL aligned one column wider than this table's own max
  // (`energy_level`, 12 chars) — see `alignWidth` doc.
  alignWidth: 13,
};

const DAILY_LOG_UPSERT_SQL = buildLwwUpsert(DAILY_LOG_UPSERT_SPEC);
const DAILY_LOG_DELETE_SQL = buildDelete({
  table: "fizruk_daily_log",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — daily-log per-row upsert / soft-delete
// -----------------------------------------------------------------------

export async function upsertDailyLog(
  client: SqliteMigrationClient,
  e: FizrukDailyLogSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(DAILY_LOG_UPSERT_SQL, [
    e.id,
    userId,
    e.at,
    toRealOrNull(e.weightKg),
    toRealOrNull(e.sleepHours),
    toIntOrNull(e.energyLevel),
    toIntOrNull(e.mood),
    e.note ?? "",
    clientTs,
    clientTs,
  ]);
}

export async function softDeleteDailyLog(
  client: SqliteMigrationClient,
  entryId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(DAILY_LOG_DELETE_SQL, [
    clientTs,
    clientTs,
    entryId,
    userId,
    clientTs,
  ]);
}
