import type { RoutineState } from "@sergeant/routine-domain";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

/**
 * Parity probe for the Routine SQLite dual-write layer.
 *
 * Stage 8 §3 of `docs/planning/storage-roadmap.md` defines a
 * `<module>.sqlite.dualwrite.parity` decision-gate metric: whenever
 * the LS-derived state and the SQLite-derived state should be
 * identical (which is the steady-state invariant once the dual-write
 * `applied` outcome returns success), they are compared and a
 * `recordParityCheck` tick is emitted on the global Sentry scope.
 *
 * **Stage 10 / PR #070r-dualwrite** extends the probe from the
 * completions-only comparison (routine_entries id-set) to all 7 new
 * tables:
 *
 *   - `routine_habits` (id-set parity)
 *   - `routine_tags` (id-set parity)
 *   - `routine_categories` (id-set parity)
 *   - `routine_prefs` (JSON blob parity)
 *   - `routine_pushups` (date-key set parity)
 *   - `routine_habit_order` (JSON array parity)
 *   - `routine_completion_notes` (note-key set parity)
 *
 * The probe is best-effort: it must NEVER throw, and any read failure
 * is surfaced as a `read.fallback` — distinct from a real parity
 * mismatch — so triage can tell `SELECT failing` apart from `LS and
 * SQLite genuinely disagree`. The orchestrator implements that
 * distinction.
 */

interface ParityProbeOutcome {
  result: "match" | "mismatch";
  details: Record<string, unknown>;
}

/**
 * Read the active Routine state from SQLite for `userId` and compare
 * it to the LS-derived `next`. All entity classes are compared by
 * id-set cardinality; singleton tables (prefs, habit_order) are
 * compared by JSON equality.
 *
 * The function may throw if any SQLite read fails. The caller is
 * expected to catch and route that to `recordReadFallback` rather
 * than `recordParityCheck("…", "mismatch", …)` — see `./index.ts`.
 */
export async function probeRoutineParity(
  client: SqliteMigrationClient,
  userId: string,
  next: RoutineState,
): Promise<ParityProbeOutcome> {
  // --- Completions (routine_entries) ---
  const completionsDiff = await probeCompletions(client, userId, next);

  // --- Habits (routine_habits) ---
  const habitsDiff = await probeIdSet(
    client,
    "routine_habits",
    userId,
    next.habits.map((h) => h.id),
  );

  // --- Tags (routine_tags) ---
  const tagsDiff = await probeIdSet(
    client,
    "routine_tags",
    userId,
    next.tags.map((t) => t.id),
  );

  // --- Categories (routine_categories) ---
  const categoriesDiff = await probeIdSet(
    client,
    "routine_categories",
    userId,
    next.categories.map((c) => c.id),
  );

  // --- Pushups (routine_pushups) ---
  const pushupsDiff = await probePushups(client, userId, next);

  // --- Completion notes (routine_completion_notes) ---
  const notesDiff = await probeNotes(client, userId, next);

  // --- Prefs (routine_prefs) — JSON blob equality ---
  const prefsDiff = await probePrefs(client, userId, next);

  // --- Habit order (routine_habit_order) — JSON array equality ---
  const orderDiff = await probeHabitOrder(client, userId, next);

  const allMatch =
    completionsDiff.match &&
    habitsDiff.match &&
    tagsDiff.match &&
    categoriesDiff.match &&
    pushupsDiff.match &&
    notesDiff.match &&
    prefsDiff.match &&
    orderDiff.match;

  const details: Record<string, unknown> = {
    completions: completionsDiff.details,
    habits: habitsDiff.details,
    tags: tagsDiff.details,
    categories: categoriesDiff.details,
    pushups: pushupsDiff.details,
    notes: notesDiff.details,
    prefs: prefsDiff.details,
    order: orderDiff.details,
  };

  return { result: allMatch ? "match" : "mismatch", details };
}

// -----------------------------------------------------------------------
// Completions (routine_entries) — carried over from the pre-Stage 10 probe
// -----------------------------------------------------------------------

interface DiffResult {
  match: boolean;
  details: Record<string, unknown>;
}

async function probeCompletions(
  client: SqliteMigrationClient,
  userId: string,
  next: RoutineState,
): Promise<DiffResult> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM routine_entries
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );

  const sqliteSet = new Set<string>();
  for (const row of rows) {
    const sep = row.id.indexOf(":");
    if (sep <= 0 || sep === row.id.length - 1) continue;
    const dateKey = row.id.slice(sep + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    sqliteSet.add(row.id);
  }

  const lsSet = buildExpectedCompletionSet(next.completions);
  return compareIdSets(lsSet, sqliteSet);
}

// -----------------------------------------------------------------------
// Generic id-set probe (habits, tags, categories)
// -----------------------------------------------------------------------

async function probeIdSet(
  client: SqliteMigrationClient,
  table: string,
  userId: string,
  lsIds: string[],
): Promise<DiffResult> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM ${table}
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  const sqliteSet = new Set<string>();
  for (const row of rows) {
    if (typeof row.id === "string" && row.id.length > 0) sqliteSet.add(row.id);
  }
  const lsSet = new Set(lsIds);
  return compareIdSets(lsSet, sqliteSet);
}

// -----------------------------------------------------------------------
// Pushups (routine_pushups) — compare by date_key set
// -----------------------------------------------------------------------

async function probePushups(
  client: SqliteMigrationClient,
  userId: string,
  next: RoutineState,
): Promise<DiffResult> {
  const rows = await client.all<{ date_key: string; reps: number }>(
    `SELECT date_key, reps FROM routine_pushups WHERE user_id = ?`,
    [userId],
  );
  const sqliteMap = new Map<string, number>();
  for (const row of rows) sqliteMap.set(row.date_key, row.reps);

  const lsMap = next.pushupsByDate ?? {};
  const allKeys = new Set([...Object.keys(lsMap), ...sqliteMap.keys()]);

  let mismatch = false;
  let lsOnly = 0;
  let sqliteOnly = 0;
  for (const key of allKeys) {
    const lsVal = lsMap[key] ?? 0;
    const sqliteVal = sqliteMap.get(key) ?? 0;
    if (lsVal !== sqliteVal) {
      mismatch = true;
      if (sqliteVal === 0) lsOnly += 1;
      else if (lsVal === 0) sqliteOnly += 1;
    }
  }

  if (!mismatch) {
    return {
      match: true,
      details: { ls: Object.keys(lsMap).length, sqlite: sqliteMap.size },
    };
  }
  return {
    match: false,
    details: {
      ls: Object.keys(lsMap).length,
      sqlite: sqliteMap.size,
      lsOnly,
      sqliteOnly,
    },
  };
}

// -----------------------------------------------------------------------
// Completion notes (routine_completion_notes) — compare by note_key set
// -----------------------------------------------------------------------

async function probeNotes(
  client: SqliteMigrationClient,
  userId: string,
  next: RoutineState,
): Promise<DiffResult> {
  const rows = await client.all<{ note_key: string }>(
    `SELECT note_key FROM routine_completion_notes
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  const sqliteSet = new Set<string>();
  for (const row of rows) sqliteSet.add(row.note_key);

  const lsNotes = next.completionNotes ?? {};
  const lsSet = new Set<string>();
  for (const [key, val] of Object.entries(lsNotes)) {
    if (typeof val === "string" && val.trim() !== "") lsSet.add(key);
  }

  return compareIdSets(lsSet, sqliteSet);
}

// -----------------------------------------------------------------------
// Prefs (routine_prefs) — JSON blob equality
// -----------------------------------------------------------------------

async function probePrefs(
  client: SqliteMigrationClient,
  userId: string,
  next: RoutineState,
): Promise<DiffResult> {
  const rows = await client.all<{ data_json: string }>(
    `SELECT data_json FROM routine_prefs WHERE user_id = ?`,
    [userId],
  );
  const sqliteJson = rows.length > 0 ? rows[0]!.data_json : "{}";
  const lsJson = JSON.stringify(next.prefs ?? {});
  const match = sqliteJson === lsJson;
  return {
    match,
    details: match
      ? { equal: true }
      : { lsLen: lsJson.length, sqliteLen: sqliteJson.length },
  };
}

// -----------------------------------------------------------------------
// Habit order (routine_habit_order) — JSON array equality
// -----------------------------------------------------------------------

async function probeHabitOrder(
  client: SqliteMigrationClient,
  userId: string,
  next: RoutineState,
): Promise<DiffResult> {
  const rows = await client.all<{ order_json: string }>(
    `SELECT order_json FROM routine_habit_order WHERE user_id = ?`,
    [userId],
  );
  const sqliteJson = rows.length > 0 ? rows[0]!.order_json : "[]";
  const lsJson = JSON.stringify(next.habitOrder ?? []);
  const match = sqliteJson === lsJson;
  return {
    match,
    details: match
      ? { equal: true }
      : { lsLen: lsJson.length, sqliteLen: sqliteJson.length },
  };
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function buildExpectedCompletionSet(
  completions: Record<string, string[]> | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!completions || typeof completions !== "object") return out;
  for (const [habitId, dateKeys] of Object.entries(completions)) {
    if (!Array.isArray(dateKeys)) continue;
    for (const dk of dateKeys) {
      if (typeof dk !== "string" || dk.length === 0) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
      out.add(`${habitId}:${dk}`);
    }
  }
  return out;
}

function compareIdSets(lsSet: Set<string>, sqliteSet: Set<string>): DiffResult {
  if (lsSet.size === sqliteSet.size) {
    let allMatch = true;
    for (const key of lsSet) {
      if (!sqliteSet.has(key)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      return {
        match: true,
        details: { ls: lsSet.size, sqlite: sqliteSet.size },
      };
    }
  }

  let lsOnly = 0;
  let sqliteOnly = 0;
  for (const key of lsSet) if (!sqliteSet.has(key)) lsOnly += 1;
  for (const key of sqliteSet) if (!lsSet.has(key)) sqliteOnly += 1;

  return {
    match: false,
    details: {
      ls: lsSet.size,
      sqlite: sqliteSet.size,
      lsOnly,
      sqliteOnly,
    },
  };
}
