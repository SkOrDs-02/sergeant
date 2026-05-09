/**
 * SQLite-backed read path for routine state fields (mobile).
 *
 * Mirror of `apps/web/src/modules/routine/lib/sqliteReader.ts`. See
 * the web copy for the full design rationale (PR #025 of
 * `docs/planning/storage-roadmap.md`).
 *
 * **Stage 10 mobile mirror** extends the reader from completions-only
 * (routine_entries) to all 7 new tables introduced in PR #070r-schema:
 *
 *   - `routine_habits` → `Habit[]`
 *   - `routine_tags` → `Tag[]`
 *   - `routine_categories` → `Category[]`
 *   - `routine_prefs` → `RoutinePrefs`
 *   - `routine_pushups` → `Record<string, number>`
 *   - `routine_habit_order` → `string[]`
 *   - `routine_completion_notes` → `Record<string, string>`
 *
 * The reader is synchronous-looking but wraps the lazy expo-sqlite
 * client. Cache is populated by `refreshSqliteRoutineState()`, which
 * is called once at boot (after migration) and after every dual-write
 * cycle. MMKV remains the source-of-truth for the mobile read path
 * until the Stage 10 mobile MMKV-write drop follow-up; this cache
 * exists today so parity probes have a canonical SQLite snapshot to
 * compare LS against.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  Habit,
  Tag,
  Category,
  RoutinePrefs,
} from "@sergeant/routine-domain";

// -----------------------------------------------------------------------
// Legacy completions cache (unchanged API, still used by loadRoutineState)
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// Stage 10: full-state SQLite read cache
// -----------------------------------------------------------------------

export interface SqliteRoutineStateCache {
  habits: Habit[];
  tags: Tag[];
  categories: Category[];
  prefs: RoutinePrefs;
  pushupsByDate: Record<string, number>;
  habitOrder: string[];
  completionNotes: Record<string, string>;
  refreshedAt: string | null;
}

const EMPTY_STATE_CACHE: SqliteRoutineStateCache = {
  habits: [],
  tags: [],
  categories: [],
  prefs: {},
  pushupsByDate: {},
  habitOrder: [],
  completionNotes: {},
  refreshedAt: null,
};

let stateCache: SqliteRoutineStateCache = { ...EMPTY_STATE_CACHE };

/** Returns the current full-state cache (sync, zero-cost). */
export function getCachedSqliteRoutineState(): SqliteRoutineStateCache {
  return stateCache;
}

/**
 * Refresh the full-state cache from all Stage 10 SQLite tables.
 * Call after boot migration, after dual-write, and after sync pull.
 */
export async function refreshSqliteRoutineState(
  client: SqliteMigrationClient,
  userId: string,
): Promise<SqliteRoutineStateCache> {
  const [habits, tags, categories, prefs, pushups, order, notes] =
    await Promise.all([
      readHabits(client, userId),
      readTags(client, userId),
      readCategories(client, userId),
      readPrefs(client, userId),
      readPushups(client, userId),
      readHabitOrder(client, userId),
      readCompletionNotes(client, userId),
    ]);

  stateCache = {
    habits,
    tags,
    categories,
    prefs,
    pushupsByDate: pushups,
    habitOrder: order,
    completionNotes: notes,
    refreshedAt: new Date().toISOString(),
  };
  return stateCache;
}

/** Reset full-state cache — used by tests. */
export function clearSqliteRoutineStateCache(): void {
  stateCache = { ...EMPTY_STATE_CACHE };
}

/**
 * Test helper: seed the full-state cache directly without running
 * migrations / SQLite queries.
 */
export function __setRoutineSqliteStateCacheForTests(
  partial: Partial<SqliteRoutineStateCache>,
): void {
  stateCache = {
    ...EMPTY_STATE_CACHE,
    refreshedAt: new Date().toISOString(),
    ...partial,
  };
}

/**
 * Test helper: seed the legacy completions cache.
 */
export function __setRoutineSqliteCompletionsCacheForTests(
  partial: Partial<SqliteCompletionsCache>,
): void {
  cache = {
    ...EMPTY_CACHE,
    refreshedAt: new Date().toISOString(),
    ...partial,
  };
}

// -----------------------------------------------------------------------
// Per-table readers (Stage 10)
// -----------------------------------------------------------------------

interface HabitRow extends Record<string, unknown> {
  id: string;
  name: string;
  emoji: string;
  tag_ids_json: string;
  category_id: string | null;
  archived: number;
  paused: number;
  recurrence: string;
  start_date: string | null;
  end_date: string | null;
  time_of_day: string;
  reminder_times_json: string;
  weekdays_json: string;
  created_at: string;
}

async function readHabits(
  client: SqliteMigrationClient,
  userId: string,
): Promise<Habit[]> {
  const rows = await client.all<HabitRow>(
    `SELECT id, name, emoji, tag_ids_json, category_id,
            archived, paused, recurrence, start_date, end_date,
            time_of_day, reminder_times_json, weekdays_json, created_at
       FROM routine_habits
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY id ASC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji || undefined,
    tagIds: safeJsonParse<string[]>(r.tag_ids_json, []),
    categoryId: r.category_id ?? undefined,
    archived: r.archived === 1,
    paused: r.paused === 1,
    recurrence: r.recurrence,
    startDate: r.start_date ?? undefined,
    endDate: r.end_date ?? undefined,
    timeOfDay: r.time_of_day || undefined,
    reminderTimes: safeJsonParse<string[]>(r.reminder_times_json, []),
    weekdays: safeJsonParse<number[]>(r.weekdays_json, []),
    createdAt: r.created_at,
  }));
}

interface TagRow extends Record<string, unknown> {
  id: string;
  name: string;
  scope: string;
}

async function readTags(
  client: SqliteMigrationClient,
  userId: string,
): Promise<Tag[]> {
  const rows = await client.all<TagRow>(
    `SELECT id, name, scope FROM routine_tags
      WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope || undefined,
  }));
}

interface CategoryRow extends Record<string, unknown> {
  id: string;
  name: string;
  emoji: string;
}

async function readCategories(
  client: SqliteMigrationClient,
  userId: string,
): Promise<Category[]> {
  const rows = await client.all<CategoryRow>(
    `SELECT id, name, emoji FROM routine_categories
      WHERE user_id = ? AND deleted_at IS NULL ORDER BY id ASC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    emoji: r.emoji || undefined,
  }));
}

async function readPrefs(
  client: SqliteMigrationClient,
  userId: string,
): Promise<RoutinePrefs> {
  const rows = await client.all<
    { data_json: string } & Record<string, unknown>
  >(`SELECT data_json FROM routine_prefs WHERE user_id = ?`, [userId]);
  if (rows.length === 0) return {};
  return safeJsonParse<RoutinePrefs>(rows[0]!.data_json, {});
}

async function readPushups(
  client: SqliteMigrationClient,
  userId: string,
): Promise<Record<string, number>> {
  const rows = await client.all<
    { date_key: string; reps: number } & Record<string, unknown>
  >(`SELECT date_key, reps FROM routine_pushups WHERE user_id = ?`, [userId]);
  const out: Record<string, number> = {};
  for (const row of rows) out[row.date_key] = row.reps;
  return out;
}

async function readHabitOrder(
  client: SqliteMigrationClient,
  userId: string,
): Promise<string[]> {
  const rows = await client.all<
    { order_json: string } & Record<string, unknown>
  >(`SELECT order_json FROM routine_habit_order WHERE user_id = ?`, [userId]);
  if (rows.length === 0) return [];
  return safeJsonParse<string[]>(rows[0]!.order_json, []);
}

async function readCompletionNotes(
  client: SqliteMigrationClient,
  userId: string,
): Promise<Record<string, string>> {
  const rows = await client.all<
    { note_key: string; note: string } & Record<string, unknown>
  >(
    `SELECT note_key, note FROM routine_completion_notes
      WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  const out: Record<string, string> = {};
  for (const row of rows) out[row.note_key] = row.note;
  return out;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
