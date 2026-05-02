import type { Macros } from "../macros";
import type { SeedFood } from "./seedFoodsUk";

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

const DB_NAME = "hub_nutrition_food_db";
const DB_VERSION = 1;
const STORE_PRODUCTS = "products";
const STORE_BARCODES = "barcodes";

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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        const s = db.createObjectStore(STORE_PRODUCTS, { keyPath: "id" });
        s.createIndex("by_norm", "norm", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_BARCODES)) {
        db.createObjectStore(STORE_BARCODES);
      }
    };
  });
}

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
    const db = await openDb();
    const tx = db.transaction([STORE_PRODUCTS], "readonly");
    const store = tx.objectStore(STORE_PRODUCTS);
    const count = await new Promise<number>((resolve, reject) => {
      const r = store.count();
      r.onsuccess = () => resolve(r.result || 0);
      r.onerror = () => reject(r.error);
    });
    db.close();

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
    const db = await openDb();
    const tx = db.transaction([STORE_PRODUCTS], "readonly");
    const store = tx.objectStore(STORE_PRODUCTS);
    const items = await new Promise<FoodProduct[]>((resolve, reject) => {
      const r = store.getAll();
      r.onsuccess = () =>
        resolve(Array.isArray(r.result) ? (r.result as FoodProduct[]) : []);
      r.onerror = () => reject(r.error);
    });
    await txDone(tx);
    db.close();
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
    const db = await openDb();
    const tx = db.transaction([STORE_PRODUCTS], "readwrite");
    tx.objectStore(STORE_PRODUCTS).put(p);
    await txDone(tx);
    db.close();
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
    const db = await openDb();
    const tx = db.transaction([STORE_BARCODES], "readwrite");
    tx.objectStore(STORE_BARCODES).put(id, bc);
    await txDone(tx);
    db.close();
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
    const db = await openDb();
    const tx = db.transaction([STORE_BARCODES, STORE_PRODUCTS], "readonly");
    const id = await new Promise<string>((resolve, reject) => {
      const r = tx.objectStore(STORE_BARCODES).get(bc);
      r.onsuccess = () => resolve(String(r.result || ""));
      r.onerror = () => reject(r.error);
    });
    if (!id) {
      db.close();
      return null;
    }
    const product = await new Promise<FoodProduct | null>((resolve, reject) => {
      const r = tx.objectStore(STORE_PRODUCTS).get(String(id));
      r.onsuccess = () => resolve((r.result as FoodProduct) || null);
      r.onerror = () => reject(r.error);
    });
    await txDone(tx);
    db.close();
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
    const db = await openDb();
    const tx = db.transaction([STORE_PRODUCTS, STORE_BARCODES], "readwrite");
    const s = tx.objectStore(STORE_PRODUCTS);
    s.clear();
    for (const p of foods) s.put(p);
    tx.objectStore(STORE_BARCODES).clear();
    await txDone(tx);
    db.close();
    return true;
  } catch {
    return false;
  }
}
