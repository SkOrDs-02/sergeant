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
import {
  removeNutritionRecipe,
  upsertNutritionRecipe,
} from "./nutritionStorage.js";
import { getNutritionDualWriteUserId } from "./sqliteWriter/index.js";
import { getCachedNutritionSqliteState } from "./sqliteReader.js";

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

/**
 * data-09: запис книги в IndexedDB. Стор `nutrition_recipes` лежить у спільній
 * для пристрою `sergeant-db` (не user-scoped), тож кожен запис несе `ownerId` -
 * id користувача, що його зберіг, а читання віддає лише його власні записи.
 * Джерело істини книги поточного користувача - його SQLite-кеш
 * (`cache.recipes`, свій для кожного акаунта): читання зливає його з власними
 * записами IDB за id. Записи без `ownerId` (до партиціювання, анонімна міграція)
 * належать користувачу, лише якщо їхній id є в його кеші; записи інших акаунтів
 * не показуємо й не видаляємо локально.
 */
interface StoredRecipe extends SavedRecipe {
  ownerId?: string;
}

/**
 * Рецепти, видалені в цій сесії, але ще присутні в SQLite-кеші (op ще не
 * застосований): без цього читання одразу після видалення воскресило б рядок із
 * кешу. Ключ `owner:id`; повторне збереження id знімає позначку.
 */
const recentlyDeleted = new Set<string>();
const tombstoneKey = (owner: string, id: string) => `${owner}:${id}`;

function cachedRecipesOfCurrentUser(): SavedRecipe[] {
  const cache = getCachedNutritionSqliteState();
  return cache.refreshedAt === null ? [] : cache.recipes;
}

function stripOwner(r: StoredRecipe): SavedRecipe {
  const { ownerId: _ownerId, ...recipe } = r;
  return recipe;
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
      const ownerId = getNutritionDualWriteUserId();
      for (const recipe of all) {
        writeStore.put(ownerId ? { ...recipe, ownerId } : recipe);
      }
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
    return await listSavedRecipesOrThrow(limit);
  } catch {
    return [];
  }
}

/**
 * Те саме читання книги, але збій не перетворюється на `[]`. Для екранів, яким
 * треба відрізнити «рецептів немає» від «книгу не вдалося прочитати»
 * (`useSavedRecipes`). Решта читачів лишаються на `listSavedRecipes`.
 */
export async function listSavedRecipesOrThrow(
  limit = 200,
): Promise<SavedRecipe[]> {
  await ensureMigrated();
  const db = await openSergeantDb();
  if (!db) throw new Error("Saved recipe storage unavailable");
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const all = await new Promise<StoredRecipe[]>((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () =>
      resolve(Array.isArray(r.result) ? (r.result as StoredRecipe[]) : []);
    r.onerror = () => reject(r.error);
  });
  await txDone(tx);
  // Власник невідомий (auth ще резолвиться) - не показуємо нічого: спільна IDB
  // могла б віддати чужі рецепти.
  const owner = getNutritionDualWriteUserId();
  if (!owner) return [];
  const byId = new Map<string, SavedRecipe>();
  // Спершу кеш (рядки без ownerId з IDB, що є в кеші, так само потрапляють
  // сюди), далі власні записи IDB: свіжіший за updatedAt перемагає.
  for (const r of cachedRecipesOfCurrentUser()) {
    if (!recentlyDeleted.has(tombstoneKey(owner, r.id))) byId.set(r.id, r);
  }
  for (const stored of all) {
    if (stored.ownerId !== owner) continue;
    const r = stripOwner(stored);
    const cached = byId.get(r.id);
    if (!cached || (r.updatedAt || 0) >= (cached.updatedAt || 0)) {
      byId.set(r.id, r);
    }
  }
  return [...byId.values()]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, Math.max(1, Number(limit) || 200));
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
    const owner = getNutritionDualWriteUserId();
    if (owner) recentlyDeleted.delete(tombstoneKey(owner, r.id));
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(owner ? { ...r, ownerId: owner } : r);
    await txDone(tx);
    // data-09: лише дельта цієї дії, а не весь вміст спільної IDB.
    upsertNutritionRecipe(r);
    return { ok: true, recipe: r };
  } catch {
    return { ok: false, error: "Не вдалося зберегти рецепт" };
  }
}

/**
 * data-35: дзеркалить відновлення книги з бекапу в IndexedDB. SQLite-кеш
 * оновлює `restoreNutritionRecipes`, але читання книги зливає кеш з власними
 * записами IDB (новіший `updatedAt` перемагає), тож без цього дзеркала
 * рецепт, видалений відновленням, воскрес би з IDB, а старіша версія з файлу
 * програла б новішій копії в IDB. `prune` (режим replace) прибирає з IDB власні
 * записи, яких немає у файлі. Best effort: збій IDB не скасовує запис у SQLite.
 */
export async function mirrorRestoredRecipesToIdb(
  recipes: readonly SavedRecipe[],
  { prune }: { prune: boolean },
): Promise<void> {
  try {
    const owner = getNutritionDualWriteUserId();
    if (!owner) return;
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return;
    const keep = new Set(recipes.map((r) => r.id));
    const removed = new Set<string>();
    if (prune) {
      for (const r of cachedRecipesOfCurrentUser()) {
        if (!keep.has(r.id)) removed.add(r.id);
      }
      const readTx = db.transaction(STORE, "readonly");
      const stored = await new Promise<StoredRecipe[]>((resolve, reject) => {
        const req = readTx.objectStore(STORE).getAll();
        req.onsuccess = () =>
          resolve(
            Array.isArray(req.result) ? (req.result as StoredRecipe[]) : [],
          );
        req.onerror = () => reject(req.error);
      });
      for (const r of stored) {
        if (r.ownerId === owner && !keep.has(r.id)) removed.add(r.id);
      }
    }
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const r of recipes) {
      recentlyDeleted.delete(tombstoneKey(owner, r.id));
      store.put({ ...r, ownerId: owner });
    }
    for (const id of removed) {
      recentlyDeleted.add(tombstoneKey(owner, id));
      store.delete(id);
    }
    await txDone(tx);
  } catch {
    // Дзеркало вторинне: джерело істини книги - SQLite-кеш.
  }
}

function readStoredRecipe(
  db: IDBDatabase,
  key: string,
): Promise<StoredRecipe | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as StoredRecipe | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteSavedRecipe(id: unknown): Promise<boolean> {
  const key = String(id || "").trim();
  if (!key) return false;
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return false;
    // Невідомий власник: не знаємо, чий це запис, - нічого не чіпаємо.
    const owner = getNutritionDualWriteUserId();
    if (!owner) return false;
    const existing = await readStoredRecipe(db, key);
    // Власний кеш має пріоритет: id у ньому означає, що рецепт цього
    // користувача (кеш свій для кожного акаунта).
    const inOwnCache = cachedRecipesOfCurrentUser().some((r) => r.id === key);
    // Запис чужого акаунта у спільній IDB, якого немає в нашому кеші, або
    // безвласний запис невідомого походження: ні локально, ні на сервер.
    if (existing && !inOwnCache && existing.ownerId !== owner) return false;
    // Рецепт цього користувача: власний запис IDB або безвласний (до
    // партиціювання, анонімна міграція), що є в його кеші.
    if (existing && (existing.ownerId === owner || !existing.ownerId)) {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      await txDone(tx);
    }
    recentlyDeleted.add(tombstoneKey(owner, key));
    // data-09: один `recipe-delete`, а не диф усього списку з IDB. Диф іде
    // проти кешу ПОТОЧНОГО користувача, тож id, якого в ньому немає, op не дає.
    removeNutritionRecipe(key);
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
