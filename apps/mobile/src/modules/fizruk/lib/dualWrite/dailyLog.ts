import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { FizrukDailyLogSnapshot } from "./diff";
import { toIntOrNull, toRealOrNull } from "./_helpers";

// -----------------------------------------------------------------------
// Stage 12 / PR #070f-mobile-dualwrite — daily-log per-row upsert / soft-delete
// -----------------------------------------------------------------------

export async function upsertDailyLog(
  client: SqliteMigrationClient,
  e: FizrukDailyLogSnapshot,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `INSERT INTO fizruk_daily_log
       (id, user_id, entry_at, weight_kg, sleep_hours, energy_level, mood,
        note, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       entry_at      = excluded.entry_at,
       weight_kg     = excluded.weight_kg,
       sleep_hours   = excluded.sleep_hours,
       energy_level  = excluded.energy_level,
       mood          = excluded.mood,
       note          = excluded.note,
       updated_at    = excluded.updated_at,
       deleted_at    = NULL
     WHERE excluded.updated_at > fizruk_daily_log.updated_at`,
    [
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
    ],
  );
}

export async function softDeleteDailyLog(
  client: SqliteMigrationClient,
  entryId: string,
  userId: string,
  clientTs: string,
): Promise<void> {
  await client.run(
    `UPDATE fizruk_daily_log
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    [clientTs, clientTs, entryId, userId, clientTs],
  );
}
