/**
 * SQLite-backed read path for Nutrition (meals, pantries, pantry items,
 * prefs, recipes).
 *
 * Stage 4 PR #033 of `docs/planning/storage-roadmap.md`. When the
 * `feature.nutrition.sqlite_v2.read_sqlite` flag is on, the public hooks
 * (`useNutritionLog`, `useNutritionPantries`, etc.) overlay their state
 * from this cache instead of from the LS blob. LS writes still happen
 * — they remain as a safety net during the cutover (PR #033 cuts over
 * reads only; PR #034 drops the LS path).
 *
 * Mirror of `apps/web/src/modules/fizruk/lib/sqliteReader.ts`.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type {
  Meal,
  NutritionDay,
  NutritionLog,
  NutritionPrefs,
  Pantry,
} from "@sergeant/nutrition-domain";
import type { NullableMacros } from "@sergeant/shared";
import type { SavedRecipe } from "./recipeBook";

export interface SqliteNutritionCache {
  /** Nutrition log keyed by date string (YYYY-MM-DD). */
  log: NutritionLog;
  /** User pantries with nested items. */
  pantries: Pantry[];
  /** Active pantry id. */
  activePantryId: string | null;
  /** Nutrition prefs (parsed from prefs_json). */
  prefs: NutritionPrefs | null;
  /** Saved recipes. */
  recipes: SavedRecipe[];
  /** ISO timestamp of the last successful refresh, or null. */
  refreshedAt: string | null;
}

const EMPTY_CACHE: SqliteNutritionCache = {
  log: {},
  pantries: [],
  activePantryId: null,
  prefs: null,
  recipes: [],
  refreshedAt: null,
};

let cache: SqliteNutritionCache = { ...EMPTY_CACHE };

/** Returns the current cached nutrition state (sync, zero-cost). */
export function getCachedNutritionSqliteState(): SqliteNutritionCache {
  return cache;
}

// -----------------------------------------------------------------------
// Row interfaces — mirror the SQLite column shapes from the adapter.
// -----------------------------------------------------------------------

interface MealRow {
  id: string;
  eaten_at: string;
  meal_type: string | null;
  name: string | null;
  label: string | null;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  source: string | null;
  macro_source: string | null;
  amount_g: number | null;
  food_id: string | null;
  is_demo: number | null;
  [key: string]: unknown;
}

interface PantryRow {
  id: string;
  name: string | null;
  text: string | null;
  [key: string]: unknown;
}

interface PantryItemRow {
  id: string;
  pantry_id: string;
  name: string | null;
  qty: number | null;
  unit: string | null;
  notes: string | null;
  sort_order: number | null;
  [key: string]: unknown;
}

interface PrefsRow {
  user_id: string;
  prefs_json: string | null;
  active_pantry_id: string | null;
  [key: string]: unknown;
}

interface RecipeRow {
  id: string;
  name: string | null;
  data_json: string | null;
  [key: string]: unknown;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Extract YYYY-MM-DD from an ISO eaten_at timestamp. */
function toDateKey(eatenAt: string): string {
  return eatenAt.slice(0, 10);
}

/** Extract HH:MM from an ISO eaten_at timestamp. */
function toTimeStr(eatenAt: string): string {
  const t = eatenAt.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(t) ? t : "00:00";
}

function rowToMeal(row: MealRow): Meal {
  const macros: NullableMacros = {
    kcal: row.kcal ?? null,
    protein_g: row.protein_g ?? null,
    fat_g: row.fat_g ?? null,
    carbs_g: row.carbs_g ?? null,
  };
  const meal: Meal = {
    id: row.id,
    name: row.name ?? "",
    time: toTimeStr(row.eaten_at),
    mealType: (row.meal_type ?? "snack") as Meal["mealType"],
    label: row.label ?? "",
    macros,
    source: (row.source ?? "manual") as Meal["source"],
    macroSource: (row.macro_source ?? "manual") as Meal["macroSource"],
    amount_g: row.amount_g ?? null,
    foodId: row.food_id ?? null,
  };
  if (row.is_demo === 1) meal.demo = true;
  return meal;
}

function rowToPantry(
  row: PantryRow,
  itemsByPantry: Map<string, Pantry["items"]>,
): Pantry {
  return {
    id: row.id,
    name: row.name ?? "",
    items: itemsByPantry.get(row.id) ?? [],
    text: row.text ?? "",
  };
}

function rowToRecipe(row: RecipeRow): SavedRecipe | null {
  const data = safeParseJson<Record<string, unknown> | null>(
    row.data_json,
    null,
  );
  if (!data || typeof data !== "object") return null;
  return {
    id: row.id,
    title: typeof data.title === "string" ? data.title : (row.name ?? ""),
    timeMinutes: typeof data.timeMinutes === "number" ? data.timeMinutes : null,
    servings: typeof data.servings === "number" ? data.servings : null,
    ingredients: Array.isArray(data.ingredients)
      ? (data.ingredients as string[])
      : [],
    steps: Array.isArray(data.steps) ? (data.steps as string[]) : [],
    tips: Array.isArray(data.tips) ? (data.tips as string[]) : [],
    macros: {
      kcal:
        typeof (data.macros as Record<string, unknown>)?.kcal === "number"
          ? ((data.macros as Record<string, unknown>).kcal as number)
          : null,
      protein_g:
        typeof (data.macros as Record<string, unknown>)?.protein_g === "number"
          ? ((data.macros as Record<string, unknown>).protein_g as number)
          : null,
      fat_g:
        typeof (data.macros as Record<string, unknown>)?.fat_g === "number"
          ? ((data.macros as Record<string, unknown>).fat_g as number)
          : null,
      carbs_g:
        typeof (data.macros as Record<string, unknown>)?.carbs_g === "number"
          ? ((data.macros as Record<string, unknown>).carbs_g as number)
          : null,
    },
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
  };
}

// -----------------------------------------------------------------------
// Refresh
// -----------------------------------------------------------------------

/**
 * Refresh the nutrition cache from the local SQLite tables. Reads all
 * active (non-tombstoned) rows for `userId` and assembles them into
 * the domain shapes consumed by the hooks.
 */
export async function refreshNutritionSqliteState(
  client: SqliteMigrationClient,
  userId: string,
): Promise<SqliteNutritionCache> {
  const [mealRows, pantryRows, pantryItemRows, prefsRows, recipeRows] =
    await Promise.all([
      client.all<MealRow>(
        `SELECT id, eaten_at, meal_type, name, label,
                kcal, protein_g, fat_g, carbs_g,
                source, macro_source, amount_g, food_id, is_demo
           FROM nutrition_meals
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY eaten_at DESC`,
        [userId],
      ),
      client.all<PantryRow>(
        `SELECT id, name, text
           FROM nutrition_pantries
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY created_at ASC`,
        [userId],
      ),
      client.all<PantryItemRow>(
        `SELECT id, pantry_id, name, qty, unit, notes, sort_order
           FROM nutrition_pantry_items
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY pantry_id ASC, sort_order ASC, id ASC`,
        [userId],
      ),
      client.all<PrefsRow>(
        `SELECT user_id, prefs_json, active_pantry_id
           FROM nutrition_prefs
          WHERE user_id = ?`,
        [userId],
      ),
      client.all<RecipeRow>(
        `SELECT id, name, data_json
           FROM nutrition_recipes
          WHERE user_id = ? AND deleted_at IS NULL
          ORDER BY updated_at DESC`,
        [userId],
      ),
    ]);

  // Build NutritionLog from meal rows.
  const log: NutritionLog = {};
  for (const row of mealRows) {
    const dateKey = toDateKey(row.eaten_at);
    if (!log[dateKey]) {
      log[dateKey] = { meals: [] } as NutritionDay;
    }
    log[dateKey].meals.push(rowToMeal(row));
  }

  // Build items-by-pantry map.
  const itemsByPantry = new Map<string, Pantry["items"]>();
  for (const row of pantryItemRows) {
    const arr = itemsByPantry.get(row.pantry_id) ?? [];
    arr.push({
      name: row.name ?? "",
      qty: row.qty ?? null,
      unit: row.unit ?? null,
      notes: row.notes ?? null,
    });
    itemsByPantry.set(row.pantry_id, arr);
  }

  const pantries = pantryRows.map((row) => rowToPantry(row, itemsByPantry));

  // Prefs singleton.
  const prefsRow = prefsRows[0] ?? null;
  const prefs = prefsRow
    ? safeParseJson<NutritionPrefs | null>(prefsRow.prefs_json, null)
    : null;
  const activePantryId = prefsRow?.active_pantry_id ?? null;

  // Recipes.
  const recipes = recipeRows
    .map(rowToRecipe)
    .filter((r): r is SavedRecipe => r !== null);

  cache = {
    log,
    pantries,
    activePantryId,
    prefs,
    recipes,
    refreshedAt: new Date().toISOString(),
  };
  return cache;
}

/** Reset cache — used by tests and when the flag is toggled off. */
export function clearNutritionSqliteCache(): void {
  cache = { ...EMPTY_CACHE };
}

/**
 * Test helper: seed the cache directly without running migrations / SQLite
 * queries. The provided fields override the empty defaults and the cache
 * is marked as refreshed (`refreshedAt`) so consumers treat it as warm.
 *
 * Stage 8 PR #057n-tombstone — used by `nutritionStorage.test.ts` and the
 * hook tests now that the load/persist surface reads from this cache
 * instead of LS.
 */
export function __setNutritionSqliteCacheForTests(
  partial: Partial<SqliteNutritionCache>,
): void {
  cache = {
    ...EMPTY_CACHE,
    refreshedAt: new Date().toISOString(),
    ...partial,
  };
}
