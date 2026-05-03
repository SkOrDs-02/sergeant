/**
 * Локальна книга рецептів (MMKV), формат узгоджений з web `recipeBook.ts` (SavedRecipe + JSON blob).
 */
import {
  STORAGE_KEYS,
  normalizeMacrosNullable,
  type NullableMacros,
} from "@sergeant/shared";

import { enqueueChange } from "@/sync/enqueue";
import { safeReadLS, safeWriteLS } from "@/lib/storage";

import { triggerNutritionDualWrite } from "./dualWrite";
import { peekNutritionDualWriteState } from "./dualWriteState";

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

type RecipeBookV1 = { recipes: SavedRecipe[] };

function asBook(raw: unknown): RecipeBookV1 {
  if (Array.isArray(raw)) {
    return { recipes: raw.map((x) => normalizeSavedRecipe(x)) };
  }
  const o =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const arr = Array.isArray(o.recipes) ? o.recipes : [];
  return { recipes: arr.map((x) => normalizeSavedRecipe(x)) };
}

export function loadSavedRecipes(): SavedRecipe[] {
  const parsed = asBook(
    safeReadLS<unknown>(STORAGE_KEYS.NUTRITION_SAVED_RECIPES, null),
  );
  const list = Array.isArray(parsed.recipes) ? parsed.recipes : [];
  return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getRecipeById(id: string): SavedRecipe | undefined {
  if (!id) return undefined;
  return loadSavedRecipes().find((r) => r.id === id);
}

export function saveRecipeBook(recipes: readonly SavedRecipe[]): boolean {
  const prev = peekNutritionDualWriteState();
  const book: RecipeBookV1 = { recipes: [...recipes] };
  const ok = safeWriteLS(STORAGE_KEYS.NUTRITION_SAVED_RECIPES, book);
  if (ok && prev !== null) {
    triggerNutritionDualWrite(prev, peekNutritionDualWriteState() ?? prev);
  }
  return ok;
}

/** Оновити або додати рецепт (для майбутнього збереження з UI / AI). */
export function upsertSavedRecipe(partial: unknown): SavedRecipe {
  const next = normalizeSavedRecipe(partial);
  const all = loadSavedRecipes().filter((r) => r.id !== next.id);
  all.push({ ...next, updatedAt: Date.now() });
  saveRecipeBook(all);
  enqueueChange(STORAGE_KEYS.NUTRITION_SAVED_RECIPES);
  return next;
}

export function removeSavedRecipe(id: string): boolean {
  const key = String(id || "").trim();
  if (!key) return false;
  const before = loadSavedRecipes();
  const all = before.filter((r) => r.id !== key);
  if (all.length === before.length) return false;
  const ok = saveRecipeBook(all);
  if (ok) enqueueChange(STORAGE_KEYS.NUTRITION_SAVED_RECIPES);
  return ok;
}

/**
 * Імпорт з експорту web (JSON) / масиву / об'єкта { recipes: [...] }.
 * Кожен елемент нормалізується; існуючі id перезаписуються.
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

  for (const item of list) {
    upsertSavedRecipe(item);
  }
  return { ok: true, count: list.length };
}
