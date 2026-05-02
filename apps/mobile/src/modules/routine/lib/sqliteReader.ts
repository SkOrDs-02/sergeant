/**
 * SQLite-backed read path for routine completions (mobile).
 *
 * Mirror of `apps/web/src/modules/routine/lib/sqliteReader.ts`.
 * See the web copy for the full design rationale (PR #025 of
 * `docs/planning/storage-roadmap.md`).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

export interface SqliteCompletionsCache {
  completions: Record<string, string[]>;
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteCompletionsCache = {
  completions: {},
  refreshedAt: null,
};

let cache: SqliteCompletionsCache = { ...EMPTY_CACHE };

export function getCachedSqliteCompletions(): SqliteCompletionsCache {
  return cache;
}

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

  for (const list of Object.values(completions)) {
    list.sort();
  }

  cache = { completions, refreshedAt: new Date().toISOString() };
  return cache;
}

export function clearSqliteCompletionsCache(): void {
  cache = { ...EMPTY_CACHE };
}
