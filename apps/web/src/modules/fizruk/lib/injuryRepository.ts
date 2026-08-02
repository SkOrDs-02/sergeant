import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { isBodyAtlasMuscleId } from "@sergeant/fizruk-domain/data";
import type { FizrukInjury } from "@sergeant/fizruk-domain";
import { enqueueOutboxUpsert } from "../../../core/syncEngine/enqueueOutboxUpsert.js";

function injuryWireRow(injury: FizrukInjury) {
  return {
    id: injury.id,
    user_id: injury.userId,
    muscle_group: injury.muscleGroup,
    noted_at: injury.notedAt,
    cleared_at: injury.clearedAt,
  };
}

export async function markFizrukInjuries(
  client: SqliteMigrationClient,
  userId: string,
  muscleGroups: Iterable<string>,
  notedAt: string,
): Promise<FizrukInjury[]> {
  const unique = [...new Set(muscleGroups)].filter(isBodyAtlasMuscleId);
  const created: FizrukInjury[] = [];

  for (const muscleGroup of unique) {
    const existing = await client.all<{ id: string }>(
      `SELECT id FROM fizruk_injuries
        WHERE user_id = ? AND muscle_group = ? AND cleared_at IS NULL
        LIMIT 1`,
      [userId, muscleGroup],
    );
    if (existing.length > 0) continue;

    const injury: FizrukInjury = {
      id: crypto.randomUUID(),
      userId,
      muscleGroup,
      notedAt,
      clearedAt: null,
    };
    await client.run(
      `INSERT INTO fizruk_injuries
         (id, user_id, muscle_group, noted_at, cleared_at)
       VALUES (?, ?, ?, ?, NULL)`,
      [injury.id, userId, muscleGroup, notedAt],
    );
    await enqueueOutboxUpsert(client, {
      userId,
      table: "fizruk_injuries",
      op: "insert",
      row: injuryWireRow(injury),
      clientTs: notedAt,
      idempotencyKey: crypto.randomUUID(),
    });
    created.push(injury);
  }
  return created;
}

export async function clearFizrukInjury(
  client: SqliteMigrationClient,
  userId: string,
  injuryId: string,
  clearedAt: string,
): Promise<FizrukInjury | null> {
  const rows = await client.all<{
    id: string;
    user_id: string;
    muscle_group: string;
    noted_at: string;
    cleared_at: string | null;
  }>(
    `SELECT id, user_id, muscle_group, noted_at, cleared_at
       FROM fizruk_injuries
      WHERE id = ? AND user_id = ?`,
    [injuryId, userId],
  );
  const row = rows[0];
  if (
    !row ||
    row.cleared_at !== null ||
    !isBodyAtlasMuscleId(row.muscle_group)
  ) {
    return null;
  }

  const injury: FizrukInjury = {
    id: row.id,
    userId: row.user_id,
    muscleGroup: row.muscle_group,
    notedAt: row.noted_at,
    clearedAt,
  };
  await client.run(
    `UPDATE fizruk_injuries SET cleared_at = ?
      WHERE id = ? AND user_id = ? AND cleared_at IS NULL`,
    [clearedAt, injuryId, userId],
  );
  await enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_injuries",
    op: "update",
    row: injuryWireRow(injury),
    clientTs: clearedAt,
    idempotencyKey: crypto.randomUUID(),
  });
  return injury;
}
