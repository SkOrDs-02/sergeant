import {
  buildDelete,
  buildLwwUpsert,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "@/core/syncEngine/enqueueOutboxUpsert";
import type { FizrukCustomExerciseSnapshot } from "./diff";

// -----------------------------------------------------------------------
// Table spec
// -----------------------------------------------------------------------

const CUSTOM_EXERCISE_UPSERT_SPEC: TableSpec = {
  table: "fizruk_custom_exercises",
  insertClause: `INSERT INTO fizruk_custom_exercises
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

const CUSTOM_EXERCISE_UPSERT_SQL = buildLwwUpsert(CUSTOM_EXERCISE_UPSERT_SPEC);
const CUSTOM_EXERCISE_DELETE_SQL = buildDelete({
  table: "fizruk_custom_exercises",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});

// -----------------------------------------------------------------------
// Custom exercise upsert / soft-delete
// -----------------------------------------------------------------------

export async function upsertCustomExercise(
  client: SqliteMigrationClient,
  exercise: FizrukCustomExerciseSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const dataJson = JSON.stringify(exercise);
  await client.run(CUSTOM_EXERCISE_UPSERT_SQL, [
    exercise.id,
    userId,
    dataJson,
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_custom_exercises",
    op: "insert",
    row: { id: exercise.id, user_id: userId, data_json: dataJson },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

export async function softDeleteCustomExercise(
  client: SqliteMigrationClient,
  exerciseId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(CUSTOM_EXERCISE_DELETE_SQL, [
    clientTs,
    clientTs,
    exerciseId,
    userId,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_custom_exercises",
    op: "delete",
    row: { id: exerciseId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}
