import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  buildLwwUpsert,
  type DualWriteRuntime,
} from "@sergeant/dualwrite-core";

import { fireSyncOutboxUpsert } from "../../../../core/syncEngine/fireSyncOutboxUpsert.js";
import type { HabitCountDeleteOp, HabitCountUpsertOp } from "./diff.js";

/**
 * `routine_habit_counts` — кроки лічильника звички за день (міграція 170,
 * клієнтська 012, Р-1 (а)). Окремий файл, бо `adapter.ts` упирається в
 * ліміт 600 рядків (Hard Rule #18). Форма як у `routine_habit_skips`:
 * LWW-upsert, soft-delete, outbox-рядок із тим самим `id`.
 *
 * `id` = `habitId__dateKey` (той самий формат, що `skip_key`); сервер
 * звіряє його з парою `habit_id` + `date_key` (`applyHabitCounts.ts`).
 * Таблицю старий сервер не знає: клієнт шле `sync_protocol` новішої версії,
 * тож такий оп отримує `retry / unknown_table` і чекає деплою бекенду, а не
 * відхиляється назавжди (журнал рішень скіла sync, 2026-10-23).
 */

export const HABIT_COUNT_UPSERT_SQL = buildLwwUpsert({
  table: "routine_habit_counts",
  insertClause: `INSERT INTO routine_habit_counts
           (id, user_id, habit_id, date_key, count, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["user_id", "id"],
  updateColumns: [
    { column: "habit_id" },
    { column: "date_key" },
    { column: "count" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 9,
  setIndent: 11,
  alignSetColumns: false,
});

export const HABIT_COUNT_SOFT_DELETE_SQL = `UPDATE routine_habit_counts
            SET deleted_at = ?, updated_at = ?
          WHERE user_id = ?
            AND id = ?
            AND updated_at < ?`;

export function habitCountRowId(habitId: string, dateKey: string): string {
  return `${habitId}__${dateKey}`;
}

export async function upsertHabitCount(
  client: SqliteMigrationClient,
  op: HabitCountUpsertOp,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const id = habitCountRowId(op.habitId, op.dateKey);
  await client.run(HABIT_COUNT_UPSERT_SQL, [
    id,
    userId,
    op.habitId,
    op.dateKey,
    op.count,
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "routine_habit_counts",
    op: "insert",
    clientTs,
    row: {
      id,
      user_id: userId,
      habit_id: op.habitId,
      date_key: op.dateKey,
      count: op.count,
    },
  });
}

export async function deleteHabitCount(
  client: SqliteMigrationClient,
  op: HabitCountDeleteOp,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const id = habitCountRowId(op.habitId, op.dateKey);
  await client.run(HABIT_COUNT_SOFT_DELETE_SQL, [
    clientTs,
    clientTs,
    userId,
    id,
    clientTs,
  ]);
  fireSyncOutboxUpsert(client, {
    userId,
    table: "routine_habit_counts",
    op: "delete",
    clientTs,
    row: { id, user_id: userId },
  });
}
