/**
 * Snapshot extractor for the mobile Nutrition dual-write layer.
 *
 * Stage 4 PR #032 of `https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/storage-roadmap.md`. Reads the
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
  resolvePantryItemIds,
  type NutritionLog,
  type NutritionPrefs,
  type Pantry,
} from "@sergeant/nutrition-domain";

import {
  isNutritionDualWriteRegistered,
  type NutritionDualWriteState,
} from "./sqliteWriter";
import type {
  NutritionMealSnapshot,
  NutritionPantrySnapshot,
  NutritionRecipeSnapshot,
} from "./sqliteWriter/diff";
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
      // from the warm cache. After Stage 8 PR #057n-tombstone-mobile the
      // SQLite slices are the only source; a cold cache yields empty
      // defaults so the diff treats first save as `0 → N`.
      waterLog: cache.waterLog ?? {},
      shoppingList: cache.shoppingList
        ? { dataJson: JSON.stringify(cache.shoppingList) }
        : null,
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
  // data-40: id позиції стабільний і береться з `PantryItem.id` (його видає
  // `mergeItems`, а рідер SQLite повертає як `row.id`). Раніше id виводився з
  // місця в масиві і перейменовував рядок `pi_…` на позиційний при кожному
  // записі; зі старою вебвкладкою це воскрешало tombstone і плодило дубль.
  // Позиція без id отримує легасі-id за позицією (той, що вже лежить у рядку).
  // `taken` спільний для всіх місць: PK рядка — `(user_id, id)`.
  const taken = new Set<string>();
  return pantries.map((p) => {
    const items = p.items ?? [];
    const ids = resolvePantryItemIds(p.id, items, taken);
    return {
      id: p.id,
      name: p.name,
      text: p.text,
      items: items.map((it, idx) => ({
        id: ids[idx] as string,
        name: it.name,
        qty: typeof it.qty === "number" ? it.qty : null,
        unit: typeof it.unit === "string" ? it.unit : null,
        notes: typeof it.notes === "string" ? it.notes : null,
        // Дзеркало web: варіанти покупок їдуть одним JSON-полем разом зі
        // своєю позицією (міграція 130). Без цього рядка синк із телефону
        // затирав би картку продукту, яку щойно записав веб.
        sources:
          Array.isArray(it.sources) && it.sources.length > 0
            ? JSON.stringify(it.sources)
            : null,
      })),
    };
  });
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
