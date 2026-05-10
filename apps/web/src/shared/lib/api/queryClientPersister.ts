/**
 * React Query persister for `apps/web`, backed by IndexedDB.
 *
 * Замінює in-memory-only кеш на warm-start модель: при холодному
 * старті PWA / Capacitor-shell ми відразу гідрируємо `useQuery`-кеш
 * з диску, не чекаючи на мережу. Особливо критично для:
 *   - користувачів на повільних мобільних мережах (Capacitor-shell у
 *     метро, без Wi-Fi);
 *   - частих відкриттів додатку (швидкий перехід Hub → модуль → Hub
 *     уже й так працює завдяки in-memory кешу, але **холодний** старт
 *     після закриття вкладки раніше йшов "з нуля" — тепер ми бачимо
 *     останні networth-картки / digest / ostatnie транзакції, доки
 *     background revalidate тягне свіжі дані).
 *
 * Дзеркало мобільного `apps/mobile/src/sync/persister/mmkvPersister.ts` —
 * та сама ідея warm-start, лише сторадж відрізняється:
 *   - mobile використовує MMKV (sync API, in-process, без serialization
 *     overhead);
 *   - web — IndexedDB через `idb-keyval` (async, але >5 MB ліміт
 *     localStorage, доступний з Service Worker / WebView Capacitor).
 *
 * IndexedDB обрано над localStorage саме через ліміт: персистований
 * кеш з 4-х модулів (Finyk + Fizruk + Routine + Nutrition) при
 * активному використанні легко перевалює за 5 MB, і JSON.stringify
 * у localStorage блокував би основний потік. Async-persister пише в
 * IDB поза main thread і на 1s throttle (відповідає дефолту
 * TanStack), тому навіть burst оновлень кешу не б'є по UI.
 *
 * ## Cache busting
 *
 * `buster` дорівнює `import.meta.env.VITE_BUILD_ID` — той самий build
 * identifier, що йде у service-worker. На кожному новому деплої buster змінюється,
 * `PersistQueryClientProvider` бачить mismatch і викидає старий
 * snapshot. Це захищає від ситуації, коли формат відповіді API
 * змінився між релізами, а застарілий кеш на диску досі думає, що
 * `MonoTransaction` не має `merchantCategory` (Hard Rule #3 у AGENTS.md).
 *
 * ## TTL
 *
 * `maxAge: 7 * 24 * 60 * 60 * 1000` (7 днів) — той самий горизонт, що
 * використовує мобільний persister. Достатньо, щоб юзер, який
 * повертається через тиждень, побачив останні дані до фонового
 * revalidate, але не настільки довго, щоб тримати тижнями
 * протуплений кеш на диску.
 *
 * ## Selective dehydrate
 *
 * `shouldDehydrateQuery` фільтрує:
 *   - помилкові queries (`status === "error"`) — нема сенсу
 *     персистити 401/500: при наступному cold-start зразу ж покажемо
 *     stale-помилку до того, як сервер зможе підказати, що сесія
 *     знов валідна;
 *   - non-`success` queries (`fetchStatus === "fetching"` без
 *     `dataUpdateCount > 0`) — query, що ще не отримав успішну
 *     відповідь, не має сенсу зберігати;
 *   - sensitive queries (auth / me / coach / sync / *balance*) —
 *     персонально-чутливі дані не повинні лежати на диску після
 *     logout (persister keyed by build-id, not by user-id) і
 *     не мають витікати у IDB-снепшот, що читається з devtools
 *     будь-яким XSS. Список наций — у `@sergeant/shared`
 *     `isSensitiveQueryKey` (PR #004 у `docs/planning/storage-roadmap.md`).
 *     Дзеркалиться у мобільному `mmkvPersister.ts`.
 *
 * ## Capacitor
 *
 * IndexedDB доступний у Capacitor WebView (Android `WebView` + iOS
 * `WKWebView` обоє підтримують IDB як standard API), тому persister
 * працює однаково що в Vercel-PWA, що в нативному shell-і. Окремий
 * shim/детект для Capacitor не потрібен.
 */
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { AsyncStorage } from "@tanstack/query-persist-client-core";
import type { Query } from "@tanstack/react-query";
import { STORAGE_KEYS, isSensitiveQueryKey } from "@sergeant/shared";
import {
  SERGEANT_STORE,
  dbDel,
  dbGet,
  dbSet,
  migrateLegacyDbOnce,
} from "../idb/sergeantDb";

/**
 * 7 днів — горизонт warm-start.
 * Збігається з мобільним `PERSIST_MAX_AGE_MS`.
 */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Build-id, доступний у бандлі через `define` у vite.config.js
 * (`import.meta.env.VITE_BUILD_ID`). Фолбек `"dev"` потрібен для
 * unit-тестів (vitest), де `define`-літерал не підставляється —
 * тести підкидають persister без проходу через Vite-pipeline.
 *
 * Раніше тут був ambient global `__APP_BUILD_ID__`, мігровано на
 * стандартний Vite `import.meta.env.VITE_*` pattern у PR-28
 * (stack-pulse 2026-05 / L1) — типи живуть у
 * `apps/web/src/vite-env.d.ts`.
 */
function getBuildBuster(): string {
  return import.meta.env.VITE_BUILD_ID || "dev";
}

/**
 * Pre-PR-#010 the persister lived in its own DB ("sergeant-rq-cache",
 * store "v1"). PR #010 folds it into the shared `sergeant-db` so the
 * browser only has to keep one connection warm and DevTools shows
 * one row instead of five — see `apps/web/src/shared/lib/idb/sergeantDb.ts`.
 *
 * The `sergeant-rq-cache` legacy DB is migrated lazily on the first
 * `getItem`/`setItem` of this app session and then dropped. If
 * migration is interrupted, the next session retries.
 */
const LEGACY_RQ_DB_NAME = "sergeant-rq-cache";
const LEGACY_RQ_STORE_NAME = "v1";

const ensureMigrated = (): Promise<void> =>
  migrateLegacyDbOnce({
    legacyDbName: LEGACY_RQ_DB_NAME,
    copy: async (legacyDb, sergeantDb) => {
      // Legacy DB has a single store keyed by the persister's key;
      // copy every key as-is into the shared `rq_cache` store.
      if (!legacyDb.objectStoreNames.contains(LEGACY_RQ_STORE_NAME)) return;
      const tx = legacyDb.transaction(LEGACY_RQ_STORE_NAME, "readonly");
      const store = tx.objectStore(LEGACY_RQ_STORE_NAME);
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
      const writeTx = sergeantDb.transaction(
        SERGEANT_STORE.RQ_CACHE,
        "readwrite",
      );
      const writeStore = writeTx.objectStore(SERGEANT_STORE.RQ_CACHE);
      for (let i = 0; i < keys.length; i++) {
        writeStore.put(values[i], keys[i]);
      }
      await new Promise<void>((resolve, reject) => {
        writeTx.oncomplete = () => resolve();
        writeTx.onerror = () => reject(writeTx.error);
        writeTx.onabort = () => reject(writeTx.error);
      });
    },
  });

/**
 * AsyncStorage adapter over the shared sergeant-db `rq_cache` store.
 * `getItem`/`setItem`/`removeItem` each await the lazy LS→IDB
 * migration so the very first cold-boot read still sees data
 * persisted by the previous (pre-PR-#010) version of the app.
 */
export const idbKeyvalStorage: AsyncStorage<string> = {
  getItem: async (key) => {
    await ensureMigrated();
    const value = await dbGet<string>(SERGEANT_STORE.RQ_CACHE, key);
    return value ?? null;
  },
  setItem: async (key, value) => {
    await ensureMigrated();
    await dbSet(SERGEANT_STORE.RQ_CACHE, key, value);
  },
  removeItem: async (key) => {
    await ensureMigrated();
    await dbDel(SERGEANT_STORE.RQ_CACHE, key);
  },
};

/**
 * Фабрика persister-а. Повертає об'єкт, який можна напряму передати
 * у `<PersistQueryClientProvider persistOptions={{ persister, ... }} />`.
 *
 * Throttle 1000 мс відповідає дефолту TanStack і збігається з
 * мобільним persister-ом — ми не хочемо писати на диск частіше
 * раз на секунду, навіть якщо invalidate сипнув десятком оновлень.
 */
export function createWebPersister() {
  return createAsyncStoragePersister({
    storage: idbKeyvalStorage,
    key: STORAGE_KEYS.WEB_QUERY_CACHE,
    throttleTime: 1_000,
  });
}

/**
 * Селектор для `dehydrateOptions.shouldDehydrateQuery`.
 *
 * Експонується окремо, щоб тести могли його перевірити без підняття
 * усього `PersistQueryClientProvider`-стека.
 */
export function shouldDehydrateQueryForPersist(query: Query): boolean {
  // Не зберігаємо помилкові queries — на cold-start вони показали б
  // stale-помилку (401/500) до того, як ми б устигли revalidate-нути,
  // і користувач побачив би "червоне" замість skeleton/empty-стану.
  if (query.state.status === "error") return false;

  // Не зберігаємо queries, у яких ще не було успішної відповіді
  // (`dataUpdateCount === 0` означає, що data ніколи не потрапляв у
  // observer'и — query був тільки fetching/pending/error). Інакше у
  // snapshot потрапляють query-плейсхолдери без даних, які лише
  // марнують місце.
  if (query.state.dataUpdateCount === 0) return false;

  // Не зберігаємо чутливі query-keys — auth / me / coach / sync /
  // *balance*. Ці фіди мають персональні дані (email, balance,
  // personalised advice strings, module_data JSONB), які не повинні
  // лежати на диску після logout (persister keyed by build-id, не
  // user-id) і не мають витікати у IDB-снепшот, що читається з
  // devtools будь-яким XSS. Список ведеться у `@sergeant/shared`
  // `isSensitiveQueryKey` і дзеркалиться мобільним
  // `mmkvPersister.ts`.
  if (isSensitiveQueryKey(query.queryKey)) return false;

  return true;
}

/**
 * Зібраний `persistOptions` для `<PersistQueryClientProvider />`.
 * Об'єднує persister, TTL, buster і `dehydrateOptions` в одне місце,
 * щоб `main.tsx` не тримав цю верстку у себе.
 */
export function createWebPersistOptions() {
  return {
    persister: createWebPersister(),
    maxAge: PERSIST_MAX_AGE_MS,
    buster: getBuildBuster(),
    dehydrateOptions: {
      shouldDehydrateQuery: shouldDehydrateQueryForPersist,
    },
  };
}
