/**
 * Локальна книга рецептів (mobile).
 *
 * Stage 13 PR #073 of `docs/planning/storage-roadmap.md` —
 * `loadSavedRecipes` reads recipes з SQLite warm cache (`nutrition_recipes`),
 * `saveRecipeBook` диспатчить через `triggerNutritionDualWrite` без
 * MMKV-write. Boot-time `residualImport.ts` дренує старі MMKV-блоби
 * `nutrition_recipe_book_v1` у SQLite і видаляє ключ.
 *
 * Mirror того ж pattern, що Stage 11 / PR #057n-tombstone-mobile
 * розгорнув для water-log + shopping-list.
 */
import { normalizeMacrosNullable, type NullableMacros } from "@sergeant/shared";

import {
  isNutritionDualWriteRegistered,
  triggerNutritionDualWrite,
  type NutritionDualWriteState,
} from "./dualWrite";
import type { NutritionRecipeSnapshot } from "./dualWrite/diff";
import { peekNutritionDualWriteState } from "./dualWriteState";
import { getCachedNutritionSqliteState } from "./sqliteReader";

export interface SavedRecipe {
  id: string;
  title: string;
  timeMinutes: number | null;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tips: string[];
  macros: NullableMacros;
  createdAt: number;
  updatedAt: number;
}

function clamp0(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** Нормалізація одного рецепта (як `normalizeRecipeForSave` на web). */
export function normalizeSavedRecipe(raw: unknown): SavedRecipe {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const title = String(o.title || "").trim();
  const id =
    o.id && String(o.id).trim()
      ? String(o.id).trim()
      : `rcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    title: title || "Без назви",
    timeMinutes: o.timeMinutes != null ? clamp0(o.timeMinutes) : null,
    servings: o.servings != null ? clamp0(o.servings) : null,
    ingredients: Array.isArray(o.ingredients)
      ? (o.ingredients as unknown[])
          .map((x) => String(x))
          .filter(Boolean)
          .slice(0, 80)
      : [],
    steps: Array.isArray(o.steps)
      ? (o.steps as unknown[])
          .map((x) => String(x))
          .filter(Boolean)
          .slice(0, 80)
      : [],
    tips: Array.isArray(o.tips)
      ? (o.tips as unknown[])
          .map((x) => String(x))
          .filter(Boolean)
          .slice(0, 40)
      : [],
    macros: normalizeMacrosNullable(o.macros) as NullableMacros,
    createdAt:
      o.createdAt != null ? Number(o.createdAt) || Date.now() : Date.now(),
    updatedAt:
      o.updatedAt != null ? Number(o.updatedAt) || Date.now() : Date.now(),
  };
}

export function loadSavedRecipes(): SavedRecipe[] {
  const cache = getCachedNutritionSqliteState();
  return [...cache.recipes].sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
}

export function getRecipeById(id: string): SavedRecipe | undefined {
  if (!id) return undefined;
  return loadSavedRecipes().find((r) => r.id === id);
}

export function extractRecipeSnapshots(
  recipes: readonly SavedRecipe[],
): NutritionRecipeSnapshot[] {
  return recipes.map((r) => ({
    id: r.id,
    title: r.title,
    dataJson: JSON.stringify(r),
  }));
}

export function saveRecipeBook(recipes: readonly SavedRecipe[]): boolean {
  if (!isNutritionDualWriteRegistered()) return true;
  const prev = peekNutritionDualWriteState();
  if (prev === null) return true;
  const next: NutritionDualWriteState = {
    ...prev,
    recipes: extractRecipeSnapshots(recipes),
  };
  triggerNutritionDualWrite(prev, next);
  return true;
}

/** Оновити або додати рецепт (для майбутнього збереження з UI / AI). */
export function upsertSavedRecipe(partial: unknown): SavedRecipe {
  const next = normalizeSavedRecipe(partial);
  const all = loadSavedRecipes().filter((r) => r.id !== next.id);
  all.push({ ...next, updatedAt: Date.now() });
  saveRecipeBook(all);
  return next;
}

export function removeSavedRecipe(id: string): boolean {
  const key = String(id || "").trim();
  if (!key) return false;
  const before = loadSavedRecipes();
  const all = before.filter((r) => r.id !== key);
  if (all.length === before.length) return false;
  return saveRecipeBook(all);
}

/**
 * Імпорт з експорту web (JSON) / масиву / об'єкта { recipes: [...] }.
 * Кожен елемент нормалізується; існуючі id перезаписуються. Усі updates
 * батчаться в один `saveRecipeBook` щоб уникнути race-у з SQLite cache
 * refresh-ом між послідовними викликами.
 */
export function importRecipesFromJson(
  raw: string,
): { ok: true; count: number } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Невалідний JSON" };
  }

  let list: unknown[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    "recipes" in parsed &&
    Array.isArray((parsed as { recipes: unknown }).recipes)
  ) {
    list = (parsed as { recipes: unknown[] }).recipes;
  } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    list = [parsed];
  } else {
    return { ok: false, error: "Очікується об’єкт рецепта або масив" };
  }

  if (list.length === 0) {
    return { ok: false, error: "Порожній список" };
  }

  const byId = new Map<string, SavedRecipe>(
    loadSavedRecipes().map((r) => [r.id, r]),
  );
  for (const item of list) {
    const next = normalizeSavedRecipe(item);
    byId.set(next.id, { ...next, updatedAt: Date.now() });
  }
  saveRecipeBook([...byId.values()]);
  return { ok: true, count: list.length };
}
