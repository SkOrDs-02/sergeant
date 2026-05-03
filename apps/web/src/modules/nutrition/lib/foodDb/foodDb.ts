import type { Macros } from "../macros";
import type { SeedFood } from "./seedFoodsUk";
import {
  SERGEANT_STORE,
  migrateLegacyDbOnce,
  openSergeantDb,
} from "../../../../shared/lib/idb/sergeantDb";

/**
 * Lazy-loader для 1600+ seed-продуктів. Статичний import затягував весь
 * масив у initial bundle (~300 KB min+gz), хоча він потрібен лише при
 * першому відкритті Харчування (або якщо база порожня). `import()`
 * ізолює ці дані у власний chunk, який vite/rollup вантажить на вимогу.
 */
async function loadSeedFoods(): Promise<readonly SeedFood[]> {
  const mod = await import("./seedFoodsUk");
  return mod.SEED_FOODS_UK;
}

/**
 * Pre-PR-#010 the food catalogue + barcode lookup lived in a dedicated
 * `hub_nutrition_food_db` IndexedDB. PR #010 folds them into the shared
 * `sergeant-db` under the `nutrition_foods` (keyPath="id",
 * index="by_norm") and `nutrition_barcodes` (out-of-line) object stores.
 * Both old stores are migrated lazily on the first read/write of this
 * app session and the legacy DB is then dropped.
 */
const LEGACY_DB_NAME = "hub_nutrition_food_db";
const LEGACY_STORE_PRODUCTS = "products";
const LEGACY_STORE_BARCODES = "barcodes";
const STORE_PRODUCTS = SERGEANT_STORE.NUTRITION_FOODS;
const STORE_BARCODES = SERGEANT_STORE.NUTRITION_BARCODES;

export interface FoodProduct {
  id: string;
  name: string;
  brand: string;
  norm: string;
  defaultGrams: number;
  per100: Macros;
  updatedAt: number;
}

export interface FoodProductInput {
  id?: unknown;
  name?: unknown;
  brand?: unknown;
  norm?: unknown;
  defaultGrams?: unknown;
  per100?: unknown;
  updatedAt?: unknown;
}

export type UpsertFoodResult =
  | { ok: true; product: FoodProduct }
  | { ok: false; error: string };

function normText(s: unknown): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");
}

function clamp0(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function normalizeMacros(per100: unknown): Macros {
  const m =
    per100 && typeof per100 === "object"
      ? (per100 as Record<string, unknown>)
      : {};
  return {
    kcal: clamp0(m.kcal),
    protein_g: clamp0(m.protein_g),
    fat_g: clamp0(m.fat_g),
    carbs_g: clamp0(m.carbs_g),
  };
}

const ensureMigrated = (): Promise<void> =>
  migrateLegacyDbOnce({
    legacyDbName: LEGACY_DB_NAME,
    copy: async (legacyDb, sergeantDb) => {
      // Products store: keyPath="id" — entries carry their own keys, so
      // we just put() them as-is into the new keyPath store.
      if (legacyDb.objectStoreNames.contains(LEGACY_STORE_PRODUCTS)) {
        const tx = legacyDb.transaction(LEGACY_STORE_PRODUCTS, "readonly");
        const all = await new Promise<FoodProduct[]>((resolve, reject) => {
          const r = tx.objectStore(LEGACY_STORE_PRODUCTS).getAll();
          r.onsuccess = () =>
            resolve(Array.isArray(r.result) ? (r.result as FoodProduct[]) : []);
          r.onerror = () => reject(r.error);
        });
        const writeTx = sergeantDb.transaction(STORE_PRODUCTS, "readwrite");
        const writeStore = writeTx.objectStore(STORE_PRODUCTS);
        for (const product of all) writeStore.put(product);
        await txDone(writeTx);
      }
      // Barcodes store: out-of-line keys (the barcode string is the
      // key, the food id is the value), so copy keys+values together.
      if (legacyDb.objectStoreNames.contains(LEGACY_STORE_BARCODES)) {
        const tx = legacyDb.transaction(LEGACY_STORE_BARCODES, "readonly");
        const store = tx.objectStore(LEGACY_STORE_BARCODES);
        const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const r = store.getAllKeys();
          r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result : []);
          r.onerror = () => reject(r.error);
        });
        const values = await new Promise<unknown[]>((resolve, reject) => {
          const r = store.getAll();
          r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result : []);
          r.onerror = () => reject(r.error);
        });
        const writeTx = sergeantDb.transaction(STORE_BARCODES, "readwrite");
        const writeStore = writeTx.objectStore(STORE_BARCODES);
        for (let i = 0; i < keys.length; i++) {
          writeStore.put(values[i], keys[i]);
        }
        await txDone(writeTx);
      }
    },
  });

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function makeFoodProduct(partial: unknown): FoodProduct {
  const p =
    partial && typeof partial === "object"
      ? (partial as FoodProductInput)
      : ({} as FoodProductInput);
  const name = String(p.name || "").trim();
  const brand = p.brand != null ? String(p.brand).trim() : "";
  const id =
    p.id && String(p.id).trim()
      ? String(p.id).trim()
      : `food_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const norm = normText([name, brand].filter(Boolean).join(" "));
  const defaultGrams = p.defaultGrams != null ? clamp0(p.defaultGrams) : 100;
  return {
    id,
    name,
    brand,
    norm,
    defaultGrams: defaultGrams > 0 ? defaultGrams : 100,
    per100: normalizeMacros(p.per100),
    updatedAt: Date.now(),
  };
}

export async function ensureSeedFoods(): Promise<boolean> {
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return false;
    const tx = db.transaction(STORE_PRODUCTS, "readonly");
    const store = tx.objectStore(STORE_PRODUCTS);
    const count = await new Promise<number>((resolve, reject) => {
      const r = store.count();
      r.onsuccess = () => resolve(r.result || 0);
      r.onerror = () => reject(r.error);
    });

    const seeds = await loadSeedFoods();

    if (count === 0) {
      return await replaceAllFoodsFromList(
        seeds.map((x) => makeFoodProduct({ name: x.name, per100: x.per100 })),
      );
    }

    // Merge: додати тільки ті seeds, яких ще немає в базі
    const existing = await listFoods(5000);
    const byNorm = new Map(
      existing.map((x) => [normText(x.norm || x.name), x]),
    );
    for (const seed of seeds) {
      if (byNorm.has(normText(seed.name))) continue;
      await upsertFood(
        makeFoodProduct({ name: seed.name, per100: seed.per100 }),
      );
    }
    return true;
  } catch {
    return false;
  }
}

export async function listFoods(limit = 500): Promise<FoodProduct[]> {
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return [];
    const tx = db.transaction(STORE_PRODUCTS, "readonly");
    const store = tx.objectStore(STORE_PRODUCTS);
    const items = await new Promise<FoodProduct[]>((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () =>
        resolve(Array.isArray(r.result) ? (r.result as FoodProduct[]) : []);
      r.onerror = () => reject(r.error);
    });
    await txDone(tx);
    return items
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, Math.max(1, Number(limit) || 500));
  } catch {
    return [];
  }
}

export async function searchFoods(
  query: string,
  limit = 20,
): Promise<FoodProduct[]> {
  const q = normText(query);
  if (!q) return [];
  const all = await listFoods(2000);
  const tokens = q.split(" ").filter(Boolean).slice(0, 6);
  const scored: Array<{ score: number; p: FoodProduct }> = [];
  for (const p of all) {
    const hay = normText(p?.norm || p?.name || "");
    let ok = true;
    for (const t of tokens) {
      if (!hay.includes(t)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const score = hay.startsWith(q) ? 0 : hay.includes(q) ? 1 : 2;
    scored.push({ score, p });
  }
  scored.sort(
    (a, b) => a.score - b.score || (b.p.updatedAt || 0) - (a.p.updatedAt || 0),
  );
  return scored.slice(0, Math.max(1, Number(limit) || 20)).map((x) => x.p);
}

export async function upsertFood(product: unknown): Promise<UpsertFoodResult> {
  const p = makeFoodProduct(product);
  if (!p.name) return { ok: false, error: "Назва продукту порожня" };
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return { ok: false, error: "Не вдалося зберегти продукт" };
    const tx = db.transaction(STORE_PRODUCTS, "readwrite");
    tx.objectStore(STORE_PRODUCTS).put(p);
    await txDone(tx);
    return { ok: true, product: p };
  } catch {
    return { ok: false, error: "Не вдалося зберегти продукт" };
  }
}

export function macrosForGrams(per100: unknown, grams: unknown): Macros {
  const g = clamp0(grams);
  const k = g / 100;
  const m = normalizeMacros(per100);
  return {
    kcal: Math.round(m.kcal * k * 10) / 10,
    protein_g: Math.round(m.protein_g * k * 10) / 10,
    fat_g: Math.round(m.fat_g * k * 10) / 10,
    carbs_g: Math.round(m.carbs_g * k * 10) / 10,
  };
}

export async function bindBarcodeToFood(
  barcode: string,
  foodId: string,
): Promise<boolean> {
  const bc = String(barcode || "").trim();
  const id = String(foodId || "").trim();
  if (!bc || !id) return false;
  if (!/^\d{8,14}$/.test(bc)) return false;
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return false;
    const tx = db.transaction(STORE_BARCODES, "readwrite");
    tx.objectStore(STORE_BARCODES).put(id, bc);
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}

export async function lookupFoodByBarcode(
  barcode: string,
): Promise<FoodProduct | null> {
  const bc = String(barcode || "").trim();
  if (!/^\d{8,14}$/.test(bc)) return null;
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return null;
    const tx = db.transaction([STORE_BARCODES, STORE_PRODUCTS], "readonly");
    const id = await new Promise<string>((resolve, reject) => {
      const r = tx.objectStore(STORE_BARCODES).get(bc);
      r.onsuccess = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error);
    });
    if (!id) {
      return null;
    }
    const product = await new Promise<FoodProduct | null>((resolve, reject) => {
      const r = tx.objectStore(STORE_PRODUCTS).get(String(id));
      r.onsuccess = () => resolve((r.result as FoodProduct) || null);
      r.onerror = () => reject(r.error);
    });
    await txDone(tx);
    return product || null;
  } catch {
    return null;
  }
}

export async function replaceAllFoodsFromList(list: unknown): Promise<boolean> {
  try {
    const foods = Array.isArray(list)
      ? (list as unknown[]).map((x) => makeFoodProduct(x)).filter((x) => x.name)
      : [];
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return false;
    const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES], "readwrite");
    const s = tx.objectStore(STORE_PRODUCTS);
    s.clear();
    for (const p of foods) s.put(p);
    tx.objectStore(STORE_BARCODES).clear();
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
}
