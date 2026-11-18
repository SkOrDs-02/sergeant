/**
 * Dual-write памʼяті типу виміру вправи (`fizruk_exercise_prefs`, міграція
 * 173 / клієнтська 011, спека `fizruk-exercise-measure-type.md`, зріз 5).
 *
 * Окремий файл заради module-size (Hard Rule #18), як
 * `adapter.customActivities.ts`. LWW-upsert зі скиданням `deleted_at`,
 * soft-delete = «повернути дефолт каталогу», outbox-рядок із тим самим
 * `id` (= id вправи). PK `(user_id, id)`, як `routine_habit_counts`.
 *
 * AI-NOTE: таблицю старий сервер не знає. Клієнт шле `sync_protocol` 3,
 * тож такий оп отримує `retry / unknown_table` і чекає деплою бекенду без
 * втрати даних і без витрати спроб (журнал скіла sync, 2026-10-23).
 */

import {
  buildLwwUpsert,
  type DualWriteRuntime,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import type { FizrukExercisePrefSnapshot } from "./diff/index.js";

export const EXERCISE_PREF_UPSERT_SQL = buildLwwUpsert({
  table: "fizruk_exercise_prefs",
  insertClause: `INSERT INTO fizruk_exercise_prefs
           (id, user_id, measure, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["user_id", "id"],
  updateColumns: [
    { column: "measure" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
});

export const EXERCISE_PREF_SOFT_DELETE_SQL = `UPDATE fizruk_exercise_prefs
            SET deleted_at = ?, updated_at = ?
          WHERE user_id = ?
            AND id = ?
            AND updated_at < ?`;

export async function upsertExercisePref(
  client: SqliteMigrationClient,
  pref: FizrukExercisePrefSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(EXERCISE_PREF_UPSERT_SQL, [
    pref.id,
    userId,
    pref.measure,
    clientTs,
    clientTs,
  ]);
  await enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_exercise_prefs",
    op: "insert",
    row: { id: pref.id, user_id: userId, measure: pref.measure },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

export async function softDeleteExercisePref(
  client: SqliteMigrationClient,
  exerciseId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(EXERCISE_PREF_SOFT_DELETE_SQL, [
    clientTs,
    clientTs,
    userId,
    exerciseId,
    clientTs,
  ]);
  await enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_exercise_prefs",
    op: "delete",
    row: { id: exerciseId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}
