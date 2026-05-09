/**
 * Snapshot extractor for the mobile Nutrition dual-write layer.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Reads the
 * SQLite warm cache (Stage 8 PR #057n-tombstone — was MMKV before)
 * and produces a `NutritionDualWriteState` blob that the diff layer
 * can compare.
 *
 * Lives in its own file (instead of next to either store) to break
 * the otherwise-circular import between `nutritionStore.ts` and
 * `recipeBookStore.ts` — both call `peekNutritionDualWriteState()`
 * from their respective `save*` paths.
 */

import {
  defaultNutritionPrefs,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
  type ShoppingList,
} from "@sergeant/nutrition-domain";

import {
  isNutritionDualWriteRegistered,
  triggerNutritionDualWrite,
  type NutritionDualWriteState,
} from "./dualWrite";
import type {
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
  NutritionRecipeSnapshot,
} from "./dualWrite/diff";
import { loadSavedRecipes, type SavedRecipe } from "./recipeBookStore";
import { getCachedNutritionSqliteState } from "./sqliteReader";

export function peekNutritionDualWriteState(): NutritionDualWriteState | null {
  if (!isNutritionDualWriteRegistered()) return null;
  try {
    const cache = getCachedNutritionSqliteState();
    const prefs: NutritionPrefs = cache.prefs ?? defaultNutritionPrefs();
    const recipes = loadSavedRecipes();

    return {
      meals: extractMealSnapshots(cache.log),
      pantries: extractPantrySnapshots(cache.pantries),
      prefs: {
        prefsJson: JSON.stringify(prefs),
        activePantryId: cache.activePantryId,
      },
      recipes: extractRecipeSnapshots(recipes),
      // Stage 11 / PR #070n-mobile-dualwrite — peek water-log + shopping-list
      // from the warm cache. Pre-tombstone these slices may be empty
      // until the call site below dual-writes them on first save —
      // that's fine: the diff treats `0 → N` as a write op and the
      // subsequent reads re-warm them.
      waterLog: cache.waterLog ?? {},
      shoppingList: cache.shoppingList
        ? { dataJson: JSON.stringify(cache.shoppingList) }
        : null,
    };
  } catch {
    return null;
  }
}

/**
 * Persist the entire water-log map. Mirrors `persistNutritionLog` — the
 * caller passes the full `Record<dateKey, volumeMl>` and the diff
 * layer emits one `water-log-set` op per changed date. Pre-boot or
 * pre-auth (`peekNutritionDualWriteState() === null`) is a no-op so
 * first-paint stays on the in-memory hook state.
 *
 * Stage 11 / PR #070n-mobile-dualwrite.
 */
export function persistNutritionWaterLog(
  waterLog: Record<string, number> | null | undefined,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const safe: Record<string, number> = {};
  if (waterLog && typeof waterLog === "object") {
    for (const [k, v] of Object.entries(waterLog)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) safe[k] = Math.round(n);
    }
  }
  const next: NutritionDualWriteState = { ...prev, waterLog: safe };
  triggerNutritionDualWrite(prev, next);
  return true;
}

/**
 * Persist the shopping-list singleton. The whole document is sent as
 * one `shopping-list-set` op carrying `dataJson` for `data_json`.
 *
 * Stage 11 / PR #070n-mobile-dualwrite.
 */
export function persistNutritionShoppingList(
  shoppingList: ShoppingList | null | undefined,
): boolean {
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const next: NutritionDualWriteState = {
    ...prev,
    shoppingList: shoppingList
      ? { dataJson: JSON.stringify(shoppingList) }
      : null,
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

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
  // Pantry items in MMKV are positional and have no stable `id`. Generate
  // a deterministic id from `pantryId::index::name` so the same item gets
  // the same row across reads — mirrors web `nutritionStorage.ts`.
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

function extractRecipeSnapshots(
  recipes: readonly SavedRecipe[],
): NutritionRecipeSnapshot[] {
  return recipes.map((r) => ({
    id: r.id,
    title: r.title,
    dataJson: JSON.stringify(r),
  }));
}
