import {
  buildDelete,
  buildLwwUpsert,
  toIntOrNull,
  toRealOrNull,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { fireSyncOutboxUpsert } from "@/core/syncEngine/fireSyncOutboxUpsert";
import type { FizrukWellbeingSnapshot } from "./diff";

// -----------------------------------------------------------------------
// Table spec
// -----------------------------------------------------------------------

const WELLBEING_UPSERT_SPEC: TableSpec = {
  table: "fizruk_wellbeing",
  insertClause: `INSERT INTO fizruk_wellbeing
       (user_id, date_key, mood, energy, sleep_quality, sleep_hours,
        notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["user_id", "date_key"],
  updateColumns: [
    { column: "mood" },
    { column: "energy" },
    { column: "sleep_quality" },
    { column: "sleep_hours" },
    { column: "notes" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const WELLBEING_UPSERT_SQL = buildLwwUpsert(WELLBEING_UPSERT_SPEC);
const WELLBEING_DELETE_SQL = buildDelete({
  table: "fizruk_wellbeing",
  deletePolicy: "soft",
  matchColumns: ["user_id", "date_key"],
});

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — wellbeing per-(user,date) row
// -----------------------------------------------------------------------

export async function upsertWellbeing(
  client: SqliteMigrationClient,
  e: FizrukWellbeingSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(WELLBEING_UPSERT_SQL, [
    userId,
    e.dateKey,
    toIntOrNull(e.mood),
    toIntOrNull(e.energy),
    toIntOrNull(e.sleepQuality),
    toRealOrNull(e.sleepHours),
    e.notes ?? "",
    clientTs,
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "fizruk_wellbeing",
    op: "insert",
    clientTs,
    row: {
      user_id: userId,
      date_key: e.dateKey,
      mood: toIntOrNull(e.mood),
      energy: toIntOrNull(e.energy),
      sleep_quality: toIntOrNull(e.sleepQuality),
      sleep_hours: toRealOrNull(e.sleepHours),
      notes: e.notes ?? "",
      created_at: clientTs,
    },
  });
}

export async function softDeleteWellbeing(
  client: SqliteMigrationClient,
  dateKey: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(WELLBEING_DELETE_SQL, [
    clientTs,
    clientTs,
    userId,
    dateKey,
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "fizruk_wellbeing",
    op: "delete",
    clientTs,
    row: { user_id: userId, date_key: dateKey },
  });
}
