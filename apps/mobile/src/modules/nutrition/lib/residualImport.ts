/**
 * Boot-time residual-import helper for the mobile Nutrition MMKV keys.
 *
 * Stage 8 PR #057n-tombstone of `docs/planning/storage-roadmap.md`
 * (mobile parity for `apps/web/src/modules/nutrition/lib/residualImport.ts`).
 * Stage 13 PR #073 extended this drain to also cover the saved-recipes
 * MMKV blob (`nutrition_recipe_book_v1`).
 *
 * Reads any leftover values from the now-deprecated MMKV keys
 * (`nutrition_log_v1`, `nutrition_pantries_v1`,
 * `nutrition_active_pantry_v1`, `nutrition_prefs_v1`,
 * `nutrition_water_v1`, `nutrition_shopping_list_v1`,
 * `nutrition_recipe_book_v1`), imports them into the local
 * `nutrition_*` SQLite tables (idempotent + LWW-safe), and then
 * deletes the MMKV entries. Subsequent boots no-op because the MMKV
 * keys are gone.
 *
 * The import uses a deliberately stale `clientTs` (epoch zero) so the
 * adapter's LWW guard always lets existing SQLite rows win — we never
 * clobber newer SQLite data with a stale MMKV snapshot.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PANTRIES_KEY,
  NUTRITION_PREFS_KEY,
  SHOPPING_LIST_KEY,
  WATER_LOG_KEY,
  defaultNutritionPrefs,
  normalizeNutritionLog,
  normalizeNutritionPrefs,
  normalizePantries,
  normalizeShoppingList,
  normalizeWaterLog,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
} from "@sergeant/nutrition-domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { safeReadLS, safeReadStringLS, safeRemoveLS } from "@/lib/storage";

import { applyNutritionDualWriteOps } from "./dualWrite/adapter";
import {
  diffNutritionDualWriteOps,
  type NutritionDualWriteState,
  type NutritionMealSnapshot,
  type NutritionPantrySnapshot,
  type NutritionRecipeSnapshot,
} from "./dualWrite/diff";
import { normalizeSavedRecipe, type SavedRecipe } from "./recipeBookStore";

const STALE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const EMPTY_STATE: NutritionDualWriteState = {
  meals: [],
  pantries: [],
  prefs: null,
  recipes: [],
  waterLog: {},
  shoppingList: null,
};

export interface ResidualImportResult {
  /** `true` when at least one MMKV key had data that was imported. */
  readonly imported: boolean;
  /** `true` when MMKV keys were present and have been deleted. */
  readonly cleaned: boolean;
}

/**
 * Import any residual Nutrition MMKV data into SQLite, then delete the
 * MMKV entries. Always returns successfully — failures fall back to a
 * no-op so the boot path can keep going.
 */
export async function importNutritionResidualFromMmkv(
  client: SqliteMigrationClient,
  userId: string,
): Promise<ResidualImportResult> {
  const log = readLogFromMmkv();
  const pantries = readPantriesFromMmkv();
  const activePantryId = readActivePantryFromMmkv();
  const prefs = readPrefsFromMmkv();
  const waterLog = readWaterLogFromMmkv();
  const shoppingList = readShoppingListFromMmkv();
  const recipes = readRecipesFromMmkv();

  const hasAny =
    log !== null ||
    pantries !== null ||
    activePantryId !== null ||
    prefs !== null ||
    waterLog !== null ||
    shoppingList !== null ||
    recipes !== null;
  if (!hasAny) return { imported: false, cleaned: false };

  // Build a NutritionDualWriteState from whatever was found in MMKV.
  // Slots that are missing fall back to the empty / default value so
  // the diff against `EMPTY_STATE` only emits ops for slots we have.
  const normalizedShopping = shoppingList
    ? normalizeShoppingList(shoppingList)
    : null;
  const next: NutritionDualWriteState = {
    meals: log ? extractMealSnapshots(normalizeNutritionLog(log)) : [],
    pantries: pantries
      ? extractPantrySnapshots(normalizePantries(pantries))
      : [],
    prefs:
      prefs !== null || activePantryId !== null
        ? {
            prefsJson: JSON.stringify(
              prefs ? normalizeNutritionPrefs(prefs) : defaultNutritionPrefs(),
            ),
            activePantryId,
          }
        : null,
    // Stage 13 PR #073 — drain the saved-recipe blob. Each recipe is
    // normalized against `SavedRecipe` and serialized into
    // `nutrition_recipes.data_json`. The MMKV blob shape was
    // `{ recipes: SavedRecipe[] }` (or a bare array on legacy builds);
    // both layouts collapse via `extractRecipesFromMmkvBlob`.
    recipes: recipes
      ? extractRecipeSnapshots(extractRecipesFromMmkvBlob(recipes))
      : [],
    // Stage 11 / PR #057n-tombstone-mobile — also drain the water-log
    // and shopping-list slices. Empty MMKV maps yield empty SQLite rows
    // (the diff emits no ops for `{} → {}`), so this is a free no-op
    // for users who never logged water / shopping items on the old build.
    waterLog: waterLog ? normalizeWaterLog(waterLog) : {},
    shoppingList: normalizedShopping
      ? { dataJson: JSON.stringify(normalizedShopping) }
      : null,
  };

  const ops = diffNutritionDualWriteOps(EMPTY_STATE, next);

  if (ops.length > 0) {
    try {
      await applyNutritionDualWriteOps(client, ops, {
        userId,
        clientTs: STALE_TIMESTAMP,
      });
    } catch (err) {
      console.warn(
        "[nutrition.residualImport] apply failed; MMKV keys retained",
        err instanceof Error ? err.message : err,
      );
      return { imported: false, cleaned: false };
    }
  }

  // Delete the MMKV keys after a successful import. Done unconditionally
  // (i.e. even when ops.length === 0, e.g. MMKV held only an empty `{}`)
  // so a half-cleared MMKV state can't keep retriggering the import on
  // every boot.
  safeRemoveLS(NUTRITION_LOG_KEY);
  safeRemoveLS(NUTRITION_PANTRIES_KEY);
  safeRemoveLS(NUTRITION_ACTIVE_PANTRY_KEY);
  safeRemoveLS(NUTRITION_PREFS_KEY);
  safeRemoveLS(WATER_LOG_KEY);
  safeRemoveLS(SHOPPING_LIST_KEY);
  safeRemoveLS(STORAGE_KEYS.NUTRITION_SAVED_RECIPES);

  return { imported: ops.length > 0, cleaned: true };
}

// -----------------------------------------------------------------------
// MMKV readers — defensive: any throw collapses to `null` so the import
// proceeds with whatever else was readable.
// -----------------------------------------------------------------------

function readLogFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(NUTRITION_LOG_KEY, null);
  } catch {
    return null;
  }
}

function readPantriesFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(NUTRITION_PANTRIES_KEY, null);
  } catch {
    return null;
  }
}

function readActivePantryFromMmkv(): string | null {
  try {
    const raw = safeReadStringLS(NUTRITION_ACTIVE_PANTRY_KEY, null);
    return raw === null ? null : String(raw);
  } catch {
    return null;
  }
}

function readPrefsFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(NUTRITION_PREFS_KEY, null);
  } catch {
    return null;
  }
}

function readWaterLogFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(WATER_LOG_KEY, null);
  } catch {
    return null;
  }
}

function readShoppingListFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(SHOPPING_LIST_KEY, null);
  } catch {
    return null;
  }
}

function readRecipesFromMmkv(): unknown | null {
  try {
    return safeReadLS<unknown>(STORAGE_KEYS.NUTRITION_SAVED_RECIPES, null);
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------
// Snapshot extractors — copies of the helpers that previously lived in
// `dualWriteState.ts` (private). The MMKV-read path that owned them is
// gone; the residual-import is the last consumer of the MMKV layout.
// -----------------------------------------------------------------------

function extractMealSnapshots(log: NutritionLog): NutritionMealSnapshot[] {
  const out: NutritionMealSnapshot[] = [];
  for (const [dateKey, day] of Object.entries(log)) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    for (const m of meals) {
      if (!m || typeof m !== "object" || !m.id) continue;
      out.push({
        id: String(m.id),
        dateKey,
        time: typeof m.time === "string" ? m.time : "",
        mealType: typeof m.mealType === "string" ? m.mealType : "snack",
        name: typeof m.name === "string" ? m.name : "",
        label: typeof m.label === "string" ? m.label : "",
        macros: m.macros ?? null,
        source: typeof m.source === "string" ? m.source : "manual",
        macroSource:
          typeof m.macroSource === "string" ? m.macroSource : "manual",
        amountG: typeof m.amount_g === "number" ? m.amount_g : null,
        foodId: typeof m.foodId === "string" ? m.foodId : null,
        isDemo: m.demo === true,
      });
    }
  }
  return out;
}

function extractPantrySnapshots(
  pantries: readonly Pantry[],
): NutritionPantrySnapshot[] {
  return pantries.map((p) => ({
    id: p.id,
    name: p.name,
    text: p.text,
    items: (p.items ?? []).map((it, idx) => ({
      id: `${p.id}::${idx}::${it.name ?? ""}`,
      name: it.name,
      qty: typeof it.qty === "number" ? it.qty : null,
      unit: typeof it.unit === "string" ? it.unit : null,
      notes: typeof it.notes === "string" ? it.notes : null,
    })),
  }));
}

function extractRecipesFromMmkvBlob(raw: unknown): SavedRecipe[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (
    raw &&
    typeof raw === "object" &&
    "recipes" in raw &&
    Array.isArray((raw as { recipes: unknown }).recipes)
  ) {
    list = (raw as { recipes: unknown[] }).recipes;
  } else {
    return [];
  }
  return list.map((item) => normalizeSavedRecipe(item));
}

function extractRecipeSnapshots(
  recipes: readonly SavedRecipe[],
): NutritionRecipeSnapshot[] {
  return recipes.map((r) => ({
    id: r.id,
    title: r.title,
    dataJson: JSON.stringify(r),
  }));
}

// Internal exports for tests.
export const __testing = {
  STALE_TIMESTAMP,
  extractMealSnapshots,
  extractPantrySnapshots,
  extractRecipesFromMmkvBlob,
  extractRecipeSnapshots,
};

// Tell TS we use NutritionPrefs in the doc comment scope.
export type { NutritionPrefs };
