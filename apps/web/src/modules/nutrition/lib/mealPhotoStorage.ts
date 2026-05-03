/**
 * Мініатюри страв у IndexedDB (окремо від localStorage).
 * Ключ — id запису їжі.
 *
 * Pre-PR-#010 lived in a dedicated `hub_nutrition_meal_photos` IndexedDB.
 * PR #010 folds the thumbnails into the shared `sergeant-db` under the
 * `nutrition_meal_thumbs` object store — the legacy DB is migrated
 * lazily on the first read/write of this app session and then dropped.
 */
import {
  SERGEANT_STORE,
  migrateLegacyDbOnce,
  openSergeantDb,
} from "../../../shared/lib/idb/sergeantDb";

const LEGACY_DB_NAME = "hub_nutrition_meal_photos";
const LEGACY_STORE_NAME = "thumbs";
const STORE = SERGEANT_STORE.NUTRITION_MEAL_THUMBS;

const ensureMigrated = (): Promise<void> =>
  migrateLegacyDbOnce({
    legacyDbName: LEGACY_DB_NAME,
    copy: async (legacyDb, sergeantDb) => {
      if (!legacyDb.objectStoreNames.contains(LEGACY_STORE_NAME)) return;
      const tx = legacyDb.transaction(LEGACY_STORE_NAME, "readonly");
      const store = tx.objectStore(LEGACY_STORE_NAME);
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
      const writeTx = sergeantDb.transaction(STORE, "readwrite");
      const writeStore = writeTx.objectStore(STORE);
      for (let i = 0; i < keys.length; i++) {
        // Preserve thumbnail Blob payloads as-is — IDB stores blobs
        // by structured clone, so a put() with the original value
        // round-trips losslessly across DBs.
        writeStore.put(values[i], keys[i]);
      }
      await new Promise<void>((resolve, reject) => {
        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () => reject(writeTx.error);
        writeTx.onabort = () => reject(writeTx.error);
      });
    },
  });

export async function saveMealThumbnail(
  mealId: string | null | undefined,
  blob: Blob | null | undefined,
): Promise<boolean> {
  if (!mealId || !blob) return false;
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return false;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, mealId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

export async function getMealThumbnailBlob(
  mealId: string | null | undefined,
): Promise<Blob | null> {
  if (!mealId) return null;
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return null;
    const blob = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(mealId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}

export async function deleteMealThumbnail(
  mealId: string | null | undefined,
): Promise<void> {
  if (!mealId) return;
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(mealId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export interface GcMealThumbnailsOptions {
  maxDeletes?: number;
}

export async function gcMealThumbnails(
  validMealIds: Iterable<string> | Set<string> | null | undefined,
  { maxDeletes = 500 }: GcMealThumbnailsOptions = {},
): Promise<{ ok: boolean; deleted: number }> {
  const keep =
    validMealIds instanceof Set
      ? (validMealIds as Set<string>)
      : new Set<string>(
          Array.isArray(validMealIds) ? (validMealIds as string[]) : [],
        );
  try {
    await ensureMigrated();
    const db = await openSergeantDb();
    if (!db) return { ok: false, deleted: 0 };
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keys = await new Promise<string[]>((resolve, reject) => {
      const r = store.getAllKeys();
      r.onsuccess = () =>
        resolve(Array.isArray(r.result) ? r.result.map(String) : []);
      r.onerror = () => reject(r.error);
    });
    let deleted = 0;
    for (const k of keys) {
      if (deleted >= maxDeletes) break;
      if (!keep.has(String(k))) {
        store.delete(k);
        deleted += 1;
      }
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return { ok: true, deleted };
  } catch {
    return { ok: false, deleted: 0 };
  }
}

export function fileToThumbnailBlob(
  file: Blob,
  maxSize = 128,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = maxSize / Math.max(w, h, 1);
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.72);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
      resolve(null);
    };
    img.src = url;
  });
}
