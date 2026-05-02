/**
 * SQLite-backed read path for routine completions.
 *
 * Stage 4 PR #025 of `docs/planning/storage-roadmap.md`. When the
 * `feature.routine.sqlite_v2.read_sqlite` flag is on, `loadRoutineState()`
 * builds `RoutineState.completions` from the local `routine_entries` table
 * instead of from the LS/MMKV blob. Habits, tags, categories, prefs,
 * pushups, habitOrder and completionNotes still come from LS — those
 * columns don't exist in SQLite yet and migrate in later PRs.
 *
 * The reader is synchronous-looking but wraps the lazy sqlite-wasm
 * singleton. On web the DB is already open by the time the dual-write
 * layer fires, so `getCachedSqliteCompletions()` returns from a warm
 * cache populated by `refreshSqliteCompletions()`. The refresh is
 * called:
 *   - once at boot (after migration),
 *   - after every dual-write cycle,
 *   - after every sync-engine pull.
 *
 * Design: the cache is a plain `Record<string, string[]>` (same shape
 * as `RoutineState.completions`) so the merge into `loadRoutineState`
 * is a single object spread.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

export interface SqliteCompletionsCache {
  /** habit-id → sorted date-key array, same shape as RoutineState.completions */
  completions: Record<string, string[]>;
  /** ISO timestamp of the last successful refresh */
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteCompletionsCache = {
  completions: {},
  refreshedAt: null,
};

let cache: SqliteCompletionsCache = { ...EMPTY_CACHE };

/** Returns the current cached completions (sync, zero-cost). */
export function getCachedSqliteCompletions(): SqliteCompletionsCache {
  return cache;
}

/**
 * Refresh the completions cache from the local SQLite `routine_entries`
 * table. Reads all active (non-tombstoned) rows for `userId`, groups
 * them by habit-id, and sorts date-keys ascending.
 *
 * The `id` column follows the `${habitId}:${dateKey}` convention
 * established in PR #024's `buildCompletionRowId`.
 */
export async function refreshSqliteCompletions(
  client: SqliteMigrationClient,
  userId: string,
): Promise<SqliteCompletionsCache> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM routine_entries
      WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );

  const completions: Record<string, string[]> = {};
  for (const row of rows) {
    const sep = row.id.indexOf(":");
    if (sep <= 0 || sep === row.id.length - 1) continue;
    const habitId = row.id.slice(0, sep);
    const dateKey = row.id.slice(sep + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const list = completions[habitId];
    if (list) list.push(dateKey);
    else completions[habitId] = [dateKey];
  }

  // Sort each habit's date-keys ascending for consistency with LS path
  for (const list of Object.values(completions)) {
    list.sort();
  }

  cache = { completions, refreshedAt: new Date().toISOString() };
  return cache;
}

/** Reset cache — used by tests and when the flag is toggled off. */
export function clearSqliteCompletionsCache(): void {
  cache = { ...EMPTY_CACHE };
}
