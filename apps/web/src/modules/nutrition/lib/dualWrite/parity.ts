import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { NutritionDualWriteState } from "./diff.js";

/**
 * Parity probe for the Nutrition SQLite dual-write layer.
 *
 * Stage 8 §3 of `docs/planning/storage-roadmap.md` defines a
 * `<module>.sqlite.dualwrite.parity` decision-gate metric: whenever
 * the LS-derived state and the SQLite-derived state should be
 * identical (which is the steady-state invariant once the dual-write
 * `applied` outcome returns success), they are compared and a
 * `recordParityCheck` tick is emitted on the global Sentry scope.
 *
 * The orchestrator (`./index.ts`) calls this helper after every
 * successful `applyNutritionDualWriteOps` apply. Nutrition SQLite
 * mirrors six entity classes:
 *
 *   1. **Meals** — top-level rows in `nutrition_meals`.
 *   2. **Pantries** — top-level rows in `nutrition_pantries`. Child
 *      `nutrition_pantry_items` rows are NOT compared directly: child
 *      drift would surface as an `applied:errored` spike on the next
 *      apply.
 *   3. **Prefs** — singleton row in `nutrition_prefs` (no `id`, keyed
 *      by `user_id`). Compared as a presence boolean: LS-side has prefs
 *      iff `next.prefs !== null`; SQLite-side iff a row exists for
 *      `user_id`.
 *   4. **Recipes** — top-level rows in `nutrition_recipes`.
 *   5. **Water log** — `nutrition_water_log` rows compared by
 *      (date_key, volume_ml) parity. Stage 11 / PR #070n-dualwrite.
 *   6. **Shopping list** — singleton `nutrition_shopping_list` blob
 *      compared by JSON-string equality. Stage 11 / PR #070n-dualwrite.
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
 * Read the active Nutrition entity ids from SQLite for `userId` and
 * compare them to the LS-derived `next` snapshot. The two are
 * expected to be byte-identical right after a successful dual-write
 * apply — any divergence is a Stage 8 decision-gate signal.
 *
 * The function may throw if any of the SQLite reads fail. The caller
 * is expected to catch and route that to `recordReadFallback` rather
 * than `recordParityCheck("…", "mismatch", …)` — see `./index.ts`.
 */
export async function probeNutritionParity(
  client: SqliteMigrationClient,
  userId: string,
  next: NutritionDualWriteState,
): Promise<ParityProbeOutcome> {
  const sqliteMeals = await readActiveIds(client, "nutrition_meals", userId);
  const sqlitePantries = await readActiveIds(
    client,
    "nutrition_pantries",
    userId,
  );
  const sqliteRecipes = await readActiveIds(
    client,
    "nutrition_recipes",
    userId,
  );
  const sqliteHasPrefs = await readPrefsExists(client, userId);

  const lsMeals = buildIdSet(next.meals);
  const lsPantries = buildIdSet(next.pantries);
  const lsRecipes = buildIdSet(next.recipes);
  const lsHasPrefs = next.prefs !== null && next.prefs !== undefined;

  const mealsDiff = compareSets(lsMeals, sqliteMeals);
  const pantriesDiff = compareSets(lsPantries, sqlitePantries);
  const recipesDiff = compareSets(lsRecipes, sqliteRecipes);
  const prefsDiff = lsHasPrefs === sqliteHasPrefs;
  // Stage 11 — water log and shopping list parity probes.
  const waterDiff = await probeWaterLog(client, userId, next);
  const shoppingDiff = await probeShoppingList(client, userId, next);

  const allMatch =
    mealsDiff.match &&
    pantriesDiff.match &&
    recipesDiff.match &&
    prefsDiff &&
    waterDiff.match &&
    shoppingDiff.match;

  if (allMatch) {
    return {
      result: "match",
      details: {
        meals: { ls: lsMeals.size, sqlite: sqliteMeals.size },
        pantries: { ls: lsPantries.size, sqlite: sqlitePantries.size },
        recipes: { ls: lsRecipes.size, sqlite: sqliteRecipes.size },
        prefs: { ls: lsHasPrefs, sqlite: sqliteHasPrefs },
        waterLog: waterDiff.details,
        shoppingList: shoppingDiff.details,
      },
    };
  }

  // Mismatch: surface the symmetric-difference cardinality per entity
  // class so triage can read the bucket without a follow-up query. We
  // deliberately do NOT include the actual ids — meal / pantry /
  // recipe ids are user-data and Sentry breadcrumbs leak into events.
  return {
    result: "mismatch",
    details: {
      meals: {
        ls: lsMeals.size,
        sqlite: sqliteMeals.size,
        lsOnly: mealsDiff.lsOnly,
        sqliteOnly: mealsDiff.sqliteOnly,
      },
      pantries: {
        ls: lsPantries.size,
        sqlite: sqlitePantries.size,
        lsOnly: pantriesDiff.lsOnly,
        sqliteOnly: pantriesDiff.sqliteOnly,
      },
      recipes: {
        ls: lsRecipes.size,
        sqlite: sqliteRecipes.size,
        lsOnly: recipesDiff.lsOnly,
        sqliteOnly: recipesDiff.sqliteOnly,
      },
      prefs: { ls: lsHasPrefs, sqlite: sqliteHasPrefs },
      waterLog: waterDiff.details,
      shoppingList: shoppingDiff.details,
    },
  };
}

async function readActiveIds(
  client: SqliteMigrationClient,
  table: "nutrition_meals" | "nutrition_pantries" | "nutrition_recipes",
  userId: string,
): Promise<Set<string>> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM ${table}
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );
  const out = new Set<string>();
  for (const row of rows) {
    if (typeof row.id === "string" && row.id.length > 0) out.add(row.id);
  }
  return out;
}

async function readPrefsExists(
  client: SqliteMigrationClient,
  userId: string,
): Promise<boolean> {
  // `nutrition_prefs` is a singleton row keyed by `user_id` — there
  // is no `id` column and no soft-delete column (per migration 035).
  // A presence check is the only meaningful parity signal.
  const rows = await client.all<{ user_id: string }>(
    `SELECT user_id FROM nutrition_prefs WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  return rows.length > 0;
}

function buildIdSet(items: readonly { id: string }[]): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      item.id.length > 0
    ) {
      out.add(item.id);
    }
  }
  return out;
}

interface SetCompareOutcome {
  match: boolean;
  lsOnly: number;
  sqliteOnly: number;
}

function compareSets(ls: Set<string>, sqlite: Set<string>): SetCompareOutcome {
  if (ls.size === sqlite.size) {
    let allMatch = true;
    for (const key of ls) {
      if (!sqlite.has(key)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return { match: true, lsOnly: 0, sqliteOnly: 0 };
  }
  let lsOnly = 0;
  let sqliteOnly = 0;
  for (const key of ls) if (!sqlite.has(key)) lsOnly += 1;
  for (const key of sqlite) if (!ls.has(key)) sqliteOnly += 1;
  return { match: false, lsOnly, sqliteOnly };
}

// -----------------------------------------------------------------------
// Stage 11 — water log probe (compare per-(date_key, volume_ml))
// -----------------------------------------------------------------------

interface DiffResult {
  match: boolean;
  details: Record<string, unknown>;
}

async function probeWaterLog(
  client: SqliteMigrationClient,
  userId: string,
  next: NutritionDualWriteState,
): Promise<DiffResult> {
  const rows = await client.all<{ date_key: string; volume_ml: number }>(
    `SELECT date_key, volume_ml FROM nutrition_water_log WHERE user_id = ?`,
    [userId],
  );
  const sqliteMap = new Map<string, number>();
  for (const row of rows) sqliteMap.set(row.date_key, row.volume_ml);

  const lsMap = next.waterLog ?? {};
  // The diff layer emits a `water-log-set` op with `volumeMl = 0`
  // when an LS entry is removed; the SQLite row stays as `volume_ml = 0`
  // (no soft-delete column). So treat «missing key» and «value 0» as
  // equivalent for parity, mirroring routine_pushups.
  const allKeys = new Set([...Object.keys(lsMap), ...sqliteMap.keys()]);

  let lsOnly = 0;
  let sqliteOnly = 0;
  let mismatchedValues = 0;
  for (const key of allKeys) {
    const lsVal = lsMap[key] ?? 0;
    const sqliteVal = sqliteMap.get(key) ?? 0;
    if (lsVal === sqliteVal) continue;
    if (sqliteVal === 0) lsOnly += 1;
    else if (lsVal === 0) sqliteOnly += 1;
    else mismatchedValues += 1;
  }

  if (lsOnly === 0 && sqliteOnly === 0 && mismatchedValues === 0) {
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
      mismatchedValues,
    },
  };
}

// -----------------------------------------------------------------------
// Stage 11 — shopping list probe (compare singleton JSON blob)
// -----------------------------------------------------------------------

async function probeShoppingList(
  client: SqliteMigrationClient,
  userId: string,
  next: NutritionDualWriteState,
): Promise<DiffResult> {
  const rows = await client.all<{ data_json: string }>(
    `SELECT data_json FROM nutrition_shopping_list WHERE user_id = ?`,
    [userId],
  );
  const sqliteHas = rows.length > 0;
  const lsHas = next.shoppingList !== null && next.shoppingList !== undefined;

  if (!lsHas && !sqliteHas) {
    return { match: true, details: { ls: false, sqlite: false } };
  }
  if (lsHas !== sqliteHas) {
    return { match: false, details: { ls: lsHas, sqlite: sqliteHas } };
  }
  // Both sides have a row — compare the JSON blob byte-for-byte.
  const sqliteJson = rows[0]?.data_json ?? '{"categories":[]}';
  const lsJson = next.shoppingList?.dataJson ?? '{"categories":[]}';
  const equal = sqliteJson === lsJson;
  return {
    match: equal,
    details: equal
      ? { ls: true, sqlite: true, equal: true }
      : {
          ls: true,
          sqlite: true,
          lsLen: lsJson.length,
          sqliteLen: sqliteJson.length,
        },
  };
}
