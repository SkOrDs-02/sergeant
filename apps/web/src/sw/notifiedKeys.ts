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

/** Matches the trailing `YYYY-MM-DD` day-key every notify-storageKey ends with. */
const DAY_KEY_SUFFIX_RE = /(\d{4}-\d{2}-\d{2})$/;

export function recordNotified(key: string): void {
  if (!key) return;
  notifiedKeys.add(key);
  idbPutKey(key).catch(() => {
    /* best-effort persistence */
  });
  // AI-CONTEXT: this is the only call site that ever adds to `notifiedKeys`
  // (from `sw/messages.ts`'s `ROUTINE_NOTIFICATION_SENT` handler), so it is
  // also the natural place to prune. Before this, `pruneOldNotifiedKeys` was
  // defined but never invoked anywhere in the repo — the dedup set grew
  // without bound for the entire SW lifetime, contradicting the doc-comment
  // above. The just-recorded `key` already carries today's day-key as its
  // trailing suffix, so no extra `Date`/Kyiv-time import is needed here.
  const dk = DAY_KEY_SUFFIX_RE.exec(key)?.[1];
  if (dk) pruneOldNotifiedKeys(dk);
}

/**
 * Drop dedup keys tied to past days so the Set does not grow without
 * bound across the SW lifetime. All keys end with a `YYYY-MM-DD` suffix
 * (see the three `*_notify_*_<dk>` emit sites in `reminders.ts`), so we
 * keep only entries ending in the current `dk`. Called from
 * {@link recordNotified} on every new key; exported for direct use by tests.
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

/** Test-only escape hatch — clears the in-memory set and the prune guard. */
export function __resetNotifiedKeysForTests(): void {
  notifiedKeys.clear();
  lastPrunedDk = null;
  notifiedKeysLoadPromise = null;
}
