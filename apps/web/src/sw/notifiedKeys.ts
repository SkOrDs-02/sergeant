/**
 * Persistent dedup-set для in-app reminder-notifications.
 *
 * Виокремлено з sw.ts (initiative 0001 Phase 2 — module decomposition).
 *
 * Персистимо `notifiedKeys` у IndexedDB, бо браузери зазвичай терплять
 * лише ~30 c idle-SW. Наступний reminder tick стартує свіжого worker-а
 * і без персистентності ми б повторно вистрелили one-and-the-same-minute
 * сповіщення (in-memory Set порожній знову). Усі IDB-операції
 * best-effort — якщо IDB недоступний, мовчки fallback-имось до
 * in-memory dedup тільки на час життя цього SW.
 */

const IDB_NAME = "sergeant-sw";
const IDB_STORE = "notified-keys";

export const notifiedKeys = new Set<string>();
let lastPrunedDk: string | null = null;

function openNotifiedDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(IDB_NAME, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("idb blocked"));
  });
}

async function idbLoadAllKeys(): Promise<IDBValidKey[]> {
  const db = await openNotifiedDb();
  try {
    return await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPutKey(key: string): Promise<void> {
  const db = await openNotifiedDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(1, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDeleteKeys(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const db = await openNotifiedDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      for (const k of keys) store.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

let notifiedKeysLoadPromise: Promise<void> | null = null;

/**
 * Hydrate-ить in-memory `notifiedKeys` з IDB. Ідемпотентний: повторні
 * виклики повертають той самий Promise. Потрібно викликати перед
 * першим `checkReminders()` після cold-start, щоб не повторити вже
 * відіслане сповіщення поточної хвилини.
 */
export function loadNotifiedKeys(): Promise<void> {
  if (notifiedKeysLoadPromise) return notifiedKeysLoadPromise;
  notifiedKeysLoadPromise = (async () => {
    try {
      const keys = await idbLoadAllKeys();
      for (const k of keys) {
        if (typeof k === "string") notifiedKeys.add(k);
      }
    } catch {
      /* IDB unavailable — in-memory dedup still works for the
         current SW lifetime. */
    }
  })();
  return notifiedKeysLoadPromise;
}

export function recordNotified(key: string): void {
  if (!key) return;
  notifiedKeys.add(key);
  idbPutKey(key).catch(() => {
    /* best-effort persistence */
  });
}

/**
 * Drop dedup keys tied to past days so the Set does not grow without
 * bound across the SW lifetime. All keys end with a `YYYY-MM-DD` suffix
 * (see the three `*_notify_*_<dk>` emit sites in `reminders.ts`), so we
 * keep only entries ending in the current `dk`.
 */
export function pruneOldNotifiedKeys(currentDk: string): void {
  if (lastPrunedDk === currentDk) return;
  lastPrunedDk = currentDk;
  const suffix = `_${currentDk}`;
  const toDelete: string[] = [];
  for (const k of notifiedKeys) {
    if (!k.endsWith(suffix)) {
      notifiedKeys.delete(k);
      toDelete.push(k);
    }
  }
  if (toDelete.length) {
    idbDeleteKeys(toDelete).catch(() => {
      /* best-effort */
    });
  }
}
