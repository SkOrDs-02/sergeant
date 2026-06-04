import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukCustomExerciseSnapshot } from "./diff";

// -----------------------------------------------------------------------
// Custom exercise upsert / soft-delete
// -----------------------------------------------------------------------

export async function upsertCustomExercise(
  client: SqliteMigrationClient,
  exercise: FizrukCustomExerciseSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  const dataJson = JSON.stringify(exercise);
  await client.run(
    `INSERT INTO fizruk_custom_exercises
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       data_json  = excluded.data_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL
     WHERE excluded.updated_at > fizruk_custom_exercises.updated_at`,
    [exercise.id, userId, dataJson, clientTs, clientTs],
  );
}

export async function softDeleteCustomExercise(
  client: SqliteMigrationClient,
  exerciseId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_custom_exercises
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, exerciseId, userId, clientTs],
  );
}
