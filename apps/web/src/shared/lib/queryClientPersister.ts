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
 * `buster` дорівнює `__APP_BUILD_ID__` — той самий build identifier,
 * що йде у service-worker. На кожному новому деплої buster змінюється,
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
 *     відповідь, не має сенсу зберігати.
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
import {
  createStore,
  get as idbGet,
  set as idbSet,
  del as idbDel,
} from "idb-keyval";
import type { Query } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@sergeant/shared";

declare const __APP_BUILD_ID__: string;

/**
 * 7 днів — горизонт warm-start.
 * Збігається з мобільним `PERSIST_MAX_AGE_MS`.
 */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Build-id, доступний у бандлі через `define` у vite.config.js.
 * Фолбек `"dev"` потрібен для unit-тестів (vitest), де define-літерал
 * не підставляється — тести підкидають persister без проходу через
 * Vite-pipeline.
 */
function getBuildBuster(): string {
  if (typeof __APP_BUILD_ID__ !== "undefined" && __APP_BUILD_ID__) {
    return __APP_BUILD_ID__;
  }
  return "dev";
}

/**
 * idb-keyval `Store` обмежений на одну DB/store пару. Ім'я DB
 * ("sergeant-rq-cache") і store ("v1") навмисно стабільні: якщо ми
 * колись захочемо змінити схему IDB, краще буде створити нову DB
 * (`sergeant-rq-cache-v2`) і дропнути стару, ніж ламати
 * `idb-keyval`-сесії в льоту.
 */
const RQ_DB_NAME = "sergeant-rq-cache";
const RQ_STORE_NAME = "v1";

/**
 * Окремий `Store` робить `get`/`set` 100% незалежними від глобальної
 * default-store, яку могли б створити інші бібліотеки на тій же
 * сторінці. Це pure: створення store не відкриває IDB — IDB
 * відкривається лише при першому доступі.
 */
const idbStore = createStore(RQ_DB_NAME, RQ_STORE_NAME);

/**
 * Тонкий адаптер `idb-keyval` → `AsyncStorage`-контракт TanStack.
 * `getItem`/`setItem`/`removeItem` приймають один ключ — той, що ми
 * передамо у `createAsyncStoragePersister`. Решта ключів у store
 * можуть жити паралельно (на майбутнє: feature flags / локальні
 * snapshot-и інших систем).
 */
export const idbKeyvalStorage: AsyncStorage<string> = {
  getItem: async (key) => {
    const value = await idbGet<string>(key, idbStore);
    return value ?? null;
  },
  setItem: async (key, value) => {
    await idbSet(key, value, idbStore);
  },
  removeItem: async (key) => {
    await idbDel(key, idbStore);
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
