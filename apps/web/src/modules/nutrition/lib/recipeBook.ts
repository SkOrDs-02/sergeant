/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { normalizeMacrosNullable, type NullableMacros } from "./macros";
import {
  SERGEANT_STORE,
  migrateLegacyDbOnce,
  openSergeantDb,
} from "../../../shared/lib/idb/sergeantDb";
import { clampNonNegative, generatePrefixedId } from "@sergeant/shared";
import { persistNutritionRecipes } from "./nutritionStorage.js";

/**
 * Pre-PR-#010 saved recipes lived in a dedicated `hub_nutrition_recipe_book`
 * IndexedDB. PR #010 folds them into the shared `sergeant-db` under the
 * `nutrition_recipes` object store (same schema: keyPath="id",
 * index="by_updatedAt"). The legacy DB is migrated lazily on the
 * first read/write of this app session and then dropped — see
 * `apps/web/src/shared/lib/idb/sergeantDb.ts`.
 */
const LEGACY_DB_NAME = "hub_nutrition_recipe_book";
const LEGACY_STORE_NAME = "recipes";
const STORE = SERGEANT_STORE.NUTRITION_RECIPES;

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

export type SaveRecipeResult =
  { ok: true; recipe: SavedRecipe } | { ok: false; error: string };

const ensureMigrated = (): Promise<void> =>
  migrateLegacyDbOnce({
    legacyDbName: LEGACY_DB_NAME,
    copy: async (legacyDb, sergeantDb) => {
      if (!legacyDb.objectStoreNames.contains(LEGACY_STORE_NAME)) return;
      const tx = legacyDb.transaction(LEGACY_STORE_NAME, "readonly");
      const store = tx.objectStore(LEGACY_STORE_NAME);
      const all = await new Promise<SavedRecipe[]>((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () =>
          resolve(Array.isArray(r.result) ? (r.result as SavedRecipe[]) : []);
        r.onerror = () => reject(r.error);
      });
      const writeTx = sergeantDb.transaction(STORE, "readwrite");
      const writeStore = writeTx.objectStore(STORE);
      for (const recipe of all) writeStore.put(recipe);
      await txDone(writeTx);
    },
  });

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function normalizeRecipeForSave(r: unknown): SavedRecipe {
  const raw = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const title = String(raw["title"] || "").trim();
  const id =
    raw["id"] && String(raw["id"]).trim()
      ? String(raw["id"]).trim()
      : generatePrefixedId("rcp");
  return {
    id,
    title,
    timeMinutes:
      raw["timeMinutes"] != null ? clampNonNegative(raw["timeMinutes"]) : null,
    servings:
      raw["servings"] != null ? clampNonNegative(raw["servings"]) : null,
    ingredients: Array.isArray(raw["ingredients"])
      ? (raw["ingredients"] as unknown[])
          .map((x) => String(x))
          .filter(Boolean)
          .slice(0, 80)
      : [],
    steps: Array.isArray(raw["steps"])
      ? (raw["steps"] as unknown[])
          .map((x) => String(x))
          .filter(Boolean)
          .slice(0, 80)
      : [],
    tips: Array.isArray(raw["tips"])
      ? (raw["tips"] as unknown[])
          .map((x) => String(x))
          .filter(Boolean)
          .slice(0, 40)
      : [],
    macros: normalizeMacrosNullable(raw["macros"]),
    createdAt:
      raw["createdAt"] != null
        ? Number(raw["createdAt"]) || Date.now()
        : Date.now(),
    updatedAt: Date.now(),
  };
}

export async function listSavedRecipes(limit = 200): Promise<SavedRecipe[]> {
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return [];
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const all = await new Promise<SavedRecipe[]>((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () =>
        resolve(Array.isArray(r.result) ? (r.result as SavedRecipe[]) : []);
      r.onerror = () => reject(r.error);
    });
    await txDone(tx);
    return all
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, Math.max(1, Number(limit) || 200));
  } catch {
    return [];
  }
}

export async function saveRecipeToBook(
  recipe: unknown,
): Promise<SaveRecipeResult> {
  const r = normalizeRecipeForSave(recipe);
  if (!r.title) return { ok: false, error: "Порожня назва рецепту" };
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return { ok: false, error: "Не вдалося зберегти рецепт" };
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(r);
    await txDone(tx);
    persistNutritionRecipes(await listSavedRecipes(200));
    return { ok: true, recipe: r };
  } catch {
    return { ok: false, error: "Не вдалося зберегти рецепт" };
  }
}

export async function deleteSavedRecipe(id: unknown): Promise<boolean> {
  const key = String(id || "").trim();
  if (!key) return false;
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return false;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    await txDone(tx);
    persistNutritionRecipes(await listSavedRecipes(200));
    return true;
  } catch {
    return false;
  }
}

export function scaleMacros(macros: unknown, factor: unknown): NullableMacros {
  const f = Number(factor);
  const k = Number.isFinite(f) && f > 0 ? f : 1;
  const m = (macros && typeof macros === "object" ? macros : {}) as Partial<
    Record<keyof NullableMacros, unknown>
  >;
  const v = (x: unknown): number | null =>
    x == null ? null : Math.round(clampNonNegative(x) * k * 10) / 10;
  return {
    kcal: v(m.kcal),
    protein_g: v(m.protein_g),
    fat_g: v(m.fat_g),
    carbs_g: v(m.carbs_g),
  };
}
