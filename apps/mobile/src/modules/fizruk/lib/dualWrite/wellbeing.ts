import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukWellbeingSnapshot } from "./diff";
import { toIntOrNull, toRealOrNull } from "./_helpers";

// -----------------------------------------------------------------------
// Stage 12.5 / PR #070f2-mobile-dualwrite — wellbeing per-(user,date) row
// -----------------------------------------------------------------------

export async function upsertWellbeing(
  client: SqliteMigrationClient,
  e: FizrukWellbeingSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_wellbeing
       (user_id, date_key, mood, energy, sleep_quality, sleep_hours,
        notes, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(user_id, date_key) DO UPDATE SET
       mood          = excluded.mood,
       energy        = excluded.energy,
       sleep_quality = excluded.sleep_quality,
       sleep_hours   = excluded.sleep_hours,
       notes         = excluded.notes,
       updated_at    = excluded.updated_at,
       deleted_at    = NULL
     WHERE excluded.updated_at > fizruk_wellbeing.updated_at`,
    [
      userId,
      e.dateKey,
      toIntOrNull(e.mood),
      toIntOrNull(e.energy),
      toIntOrNull(e.sleepQuality),
      toRealOrNull(e.sleepHours),
      e.notes ?? "",
      clientTs,
      clientTs,
    ],
  );
}

export async function softDeleteWellbeing(
  client: SqliteMigrationClient,
  dateKey: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_wellbeing
        SET deleted_at = ?, updated_at = ?
      WHERE user_id = ? AND date_key = ? AND updated_at < ?`,
    [clientTs, clientTs, userId, dateKey, clientTs],
  );
}
