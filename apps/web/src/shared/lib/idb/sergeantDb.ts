/**
 * Single point of entry for every web-side IndexedDB store.
 *
 * Stage 1 PR #010 in `docs/planning/storage-roadmap.md` — folds the
 * historical fleet of per-feature IDB databases into one shared
 * `sergeant-db` so the browser only has to open and warm up a single
 * connection, the storage estimate quota is pooled, and DevTools
 * shows one row instead of five.
 *
 * Pre-PR-#010 layout (each line = one IndexedDB database):
 *   - `sergeant-rq-cache`         — TanStack Query persister
 *   - `sergeant-sync-meta`        — cloud-sync offline queue + meta (PR #009)
 *   - `hub_nutrition_recipe_book` — Nutrition saved recipes
 *   - `hub_nutrition_food_db`     — Nutrition food catalogue + barcodes
 *   - `hub_nutrition_meal_photos` — Nutrition meal thumbnail blobs
 *
 * Post-PR-#010 layout (one IndexedDB database, six object stores):
 *   sergeant-db
 *     ├── rq_cache               (out-of-line keys; serialised RQ payload)
 *     ├── sync_meta              (out-of-line keys; offline queue + meta)
 *     ├── nutrition_recipes      (keyPath="id", idx="by_updatedAt")
 *     ├── nutrition_foods        (keyPath="id", idx="by_norm")
 *     ├── nutrition_barcodes     (out-of-line keys; barcode → food id)
 *     ├── nutrition_meal_thumbs  (out-of-line keys; Blob)
 *     └── migration_meta         (one row per legacy DB migrated)
 *
 * Each legacy database is migrated lazily on the first call from its
 * dedicated module via `migrateLegacyDbOnce()` — we never block app
 * boot on migration, and a failure in one module's migration cannot
 * affect the others.  Old DBs are deleted only AFTER their migration
 * row is written, so an interrupted migration can be retried without
 * data loss.
 *
 * The implementation deliberately uses raw IndexedDB (no `idb` /
 * `idb-keyval` wrappers) because the food-DB store needs an index
 * with `keyPath` semantics that idb-keyval's flat KV API can't
 * express, and we want a single connection used uniformly by every
 * consumer in the codebase.
 */

const DB_NAME = "sergeant-db";
const DB_VERSION = 1;

export const SERGEANT_STORE = {
  RQ_CACHE: "rq_cache",
  SYNC_META: "sync_meta",
  NUTRITION_RECIPES: "nutrition_recipes",
  NUTRITION_FOODS: "nutrition_foods",
  NUTRITION_BARCODES: "nutrition_barcodes",
  NUTRITION_MEAL_THUMBS: "nutrition_meal_thumbs",
  MIGRATION_META: "migration_meta",
} as const;

export type SergeantStoreName =
  (typeof SERGEANT_STORE)[keyof typeof SERGEANT_STORE];

let openPromise: Promise<IDBDatabase> | null = null;

/**
 * Returns the (lazily) opened sergeant-db instance.  All consumers
 * share a single connection — IndexedDB serialises transactions per
 * store, so cross-store traffic stays parallel.
 *
 * Resolves to `null` when IndexedDB is unavailable (server-side
 * render, hardened iframe, Safari Private Browsing on older iOS).
 * Callers MUST handle that case — the four nutrition modules do so
 * with `catch { return … fallback … }` blocks.
 */
export function openSergeantDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!openPromise) openPromise = doOpen();
  return openPromise.catch(() => null);
}

function doOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 — initial schema, all stores created upfront. Future
      // versions should add new stores in additional `if` blocks
      // and bump DB_VERSION; existing stores are touched only via
      // additive migrations (e.g. `createIndex`).
      if (!db.objectStoreNames.contains(SERGEANT_STORE.RQ_CACHE)) {
        db.createObjectStore(SERGEANT_STORE.RQ_CACHE);
      }
      if (!db.objectStoreNames.contains(SERGEANT_STORE.SYNC_META)) {
        db.createObjectStore(SERGEANT_STORE.SYNC_META);
      }
      if (!db.objectStoreNames.contains(SERGEANT_STORE.NUTRITION_RECIPES)) {
        const s = db.createObjectStore(SERGEANT_STORE.NUTRITION_RECIPES, {
          keyPath: "id",
        });
        s.createIndex("by_updatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(SERGEANT_STORE.NUTRITION_FOODS)) {
        const s = db.createObjectStore(SERGEANT_STORE.NUTRITION_FOODS, {
          keyPath: "id",
        });
        s.createIndex("by_norm", "norm", { unique: false });
      }
      if (!db.objectStoreNames.contains(SERGEANT_STORE.NUTRITION_BARCODES)) {
        db.createObjectStore(SERGEANT_STORE.NUTRITION_BARCODES);
      }
      if (!db.objectStoreNames.contains(SERGEANT_STORE.NUTRITION_MEAL_THUMBS)) {
        db.createObjectStore(SERGEANT_STORE.NUTRITION_MEAL_THUMBS);
      }
      if (!db.objectStoreNames.contains(SERGEANT_STORE.MIGRATION_META)) {
        db.createObjectStore(SERGEANT_STORE.MIGRATION_META);
      }
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Thin idb-keyval-shaped helpers around the shared connection.               */
/* -------------------------------------------------------------------------- */

export async function dbGet<T>(
  storeName: SergeantStoreName,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openSergeantDb();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function dbSet(
  storeName: SergeantStoreName,
  key: IDBValidKey,
  value: unknown,
): Promise<void> {
  const db = await openSergeantDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function dbDel(
  storeName: SergeantStoreName,
  key: IDBValidKey,
): Promise<void> {
  const db = await openSergeantDb();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* -------------------------------------------------------------------------- */
/* Legacy database migration                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Idempotent guard: read-modify-write the migration_meta row.
 *
 * Each migration writes `{<legacyDbName>: true}` so subsequent boots
 * can skip the work. Stored under a single bucket key so we don't
 * pollute the store namespace.
 */
const MIGRATION_FLAGS_KEY = "legacy_db_flags";

type MigrationFlags = Record<string, true>;

async function isLegacyMigrated(legacyDbName: string): Promise<boolean> {
  const flags =
    (await dbGet<MigrationFlags>(
      SERGEANT_STORE.MIGRATION_META,
      MIGRATION_FLAGS_KEY,
    )) ?? {};
  return !!flags[legacyDbName];
}

async function markLegacyMigrated(legacyDbName: string): Promise<void> {
  const flags =
    (await dbGet<MigrationFlags>(
      SERGEANT_STORE.MIGRATION_META,
      MIGRATION_FLAGS_KEY,
    )) ?? {};
  flags[legacyDbName] = true;
  await dbSet(SERGEANT_STORE.MIGRATION_META, MIGRATION_FLAGS_KEY, flags);
}

/**
 * Open a *legacy* database without running upgrades. Returns `null`
 * when the DB does not exist (no rows to migrate). We use
 * `databases()` first when available because attempting to
 * `indexedDB.open()` a non-existent DB silently creates it, which
 * would defeat the cleanup logic afterwards.
 */
async function openLegacyDbReadOnly(
  legacyDbName: string,
): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  // Probe for existence when the runtime supports the API. Older
  // browsers (Safari < 18) don't ship `databases()` — there we just
  // attempt the open and accept the no-op create as a small
  // imperfection.
  if (typeof indexedDB.databases === "function") {
    try {
      const list = await indexedDB.databases();
      const present = list.some((d) => d?.name === legacyDbName);
      if (!present) return null;
    } catch {
      /* fall through to optimistic open */
    }
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(legacyDbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function deleteIdbDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(name);
    // Ignore errors — at worst the legacy DB sticks around taking
    // up quota; we still wrote its data into the new DB so user
    // experience is unaffected.
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export interface MigrateLegacyDbOptions {
  /** Name of the legacy IDB database to migrate from. */
  legacyDbName: string;
  /**
   * Async function that copies rows from `legacyDb` into the shared
   * sergeant-db. Receives the legacy connection and the shared
   * connection. Throw on irrecoverable errors — caller swallows.
   */
  copy: (legacyDb: IDBDatabase, sergeantDb: IDBDatabase) => Promise<void>;
}

/**
 * Run a one-shot per-module migration the first time the module is
 * exercised. Subsequent calls return immediately after consulting
 * the `migration_meta` flag, so this can sit on every consumer's
 * hot path.
 */
export async function migrateLegacyDbOnce({
  legacyDbName,
  copy,
}: MigrateLegacyDbOptions): Promise<void> {
  const db = await openSergeantDb();
  if (!db) return;
  if (await isLegacyMigrated(legacyDbName)) return;

  const legacyDb = await openLegacyDbReadOnly(legacyDbName).catch(() => null);
  if (!legacyDb) {
    // Fresh install — nothing to migrate. Still mark done so we
    // don't attempt the open every load.
    await markLegacyMigrated(legacyDbName);
    return;
  }
  try {
    await copy(legacyDb, db);
  } catch {
    // Migration failure: leave the flag unset so the next boot
    // retries. Old DB stays in place (data is not lost).
    legacyDb.close();
    return;
  }
  legacyDb.close();
  await markLegacyMigrated(legacyDbName);
  // Best-effort cleanup. If `deleteDatabase` is blocked by another
  // tab, the user will end up with one extra empty DB — harmless.
  await deleteIdbDatabase(legacyDbName);
}

/* -------------------------------------------------------------------------- */
/* Test-only escape hatches                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reset the cached open promise so a test that swaps `indexedDB` /
 * mocks `idb` mid-suite gets a fresh connection on the next call.
 */
export function __resetSergeantDbForTests(): void {
  openPromise = null;
}
