/**
 * Snapshot extractor for the mobile Nutrition dual-write layer.
 *
 * Stage 4 PR #032 of `docs/planning/storage-roadmap.md`. Reads the
 * MMKV slices that map to `nutrition_*` SQLite tables and produces
 * a `NutritionDualWriteState` blob that the diff layer can compare.
 *
 * Lives in its own file (instead of next to either store) to break
 * the otherwise-circular import between `nutritionStore.ts` and
 * `recipeBookStore.ts` — both call `peekNutritionDualWriteState()`
 * from their respective `save*` paths.
 */

import {
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_PANTRIES_KEY,
  normalizePantries,
  type NutritionLog,
  type Pantry,
} from "@sergeant/nutrition-domain";

import { safeReadLS, safeReadStringLS } from "@/lib/storage";

import {
  isNutritionDualWriteRegistered,
  type NutritionDualWriteState,
} from "./dualWrite";
import type {
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
  NutritionRecipeSnapshot,
} from "./dualWrite/diff";
import { loadNutritionLog, loadNutritionPrefs } from "./nutritionStore";
import { loadSavedRecipes, type SavedRecipe } from "./recipeBookStore";

export function peekNutritionDualWriteState(): NutritionDualWriteState | null {
  if (!isNutritionDualWriteRegistered()) return null;
  try {
    const log = loadNutritionLog();
    const pantries = normalizePantries(
      safeReadLS<unknown>(NUTRITION_PANTRIES_KEY, null),
    );
    const activePantryRaw = safeReadStringLS(NUTRITION_ACTIVE_PANTRY_KEY, null);
    const activePantryId = activePantryRaw ? String(activePantryRaw) : null;
    const prefs = loadNutritionPrefs();
    const recipes = loadSavedRecipes();

    return {
      meals: extractMealSnapshots(log),
      pantries: extractPantrySnapshots(pantries),
      prefs: {
        prefsJson: JSON.stringify(prefs),
        activePantryId,
      },
      recipes: extractRecipeSnapshots(recipes),
    };
  } catch {
    return null;
  }
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
