/// <reference lib="WebWorker" />
/**
 * Активна партиція користувача для runtime-кешу SW (Audit 03 / Decision #2 (C),
 * priv-08). Без workbox-імпортів, щоб тестувалось під jsdom.
 *
 * Тримає **хеш** непрозорого id Better Auth, надісланого з main thread через
 * `SW_SET_USER`; `cacheKeyWillBeUsed` у `./cache` дописує його до URL ключа
 * (`__u=<hash>`), тож записи користувача A ніколи не резолвляться для B.
 *
 * Чому хеш, а не сирий id: значення потрапляє в URL ключів кешу і в будь-який
 * debug-знімок; SHA-256-префікс ізолює користувачів, не світячи id.
 *
 * Передісторія (priv-08, не змінюй не прочитавши): раніше ключ жив лише в памʼяті воркера. Браузер вбиває
 * простійний SW за ~30 с, і після перезапуску ключ ставав `anon` до наступного
 * `SW_SET_USER` (він шлеться лише на зміну `user.id` і на `controllerchange`).
 * Boot-запити всіх користувачів писались у спільну партицію, а `/me` B міг
 * лягти під ключ A. Тепер ключ дублюється в `sw-meta` (CacheStorage переживає
 * перезапуск воркера) і ліниво відновлюється: усе, що читає ключ, чекає на
 * `getActiveUserKey()`. Поки ключ `anon`, `/api/*` не читається і не пишеться
 * (див. `canUseCachePartition` у `./cachePolicy`).
 */

import { ANON_PARTITION, SW_META_CACHE_NAME } from "./cachePolicy";

/** Синтетичний URL запису в meta-кеші (не мережевий ресурс). */
const META_ENTRY_URL = "/__sw/active-user";
const PARTITION_HASH_LEN = 32; // 128 біт SHA-256 hex — для ізоляції достатньо
const STORED_KEY_RE = new RegExp(`^[0-9a-f]{${PARTITION_HASH_LEN}}$`);

let activeUserKey: string = ANON_PARTITION;
/** Зростає на кожну зміну ключа: відновлення з диска не перебиває свіжіше значення. */
let keyGeneration = 0;
let restorePromise: Promise<void> | null = null;

/**
 * SHA-256 → усічений lowercase hex (Web Crypto, є в SW-скоупі). Якщо хешування
 * кидає — `anon`, тобто деградація в «кеш /api вимкнено», а не витік сирого id.
 */
async function hashUserKey(raw: string): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, PARTITION_HASH_LEN);
  } catch {
    return ANON_PARTITION;
  }
}

async function persistKey(key: string, generation: number): Promise<void> {
  try {
    if (key === ANON_PARTITION) {
      await caches.delete(SW_META_CACHE_NAME);
      return;
    }
    const cache = await caches.open(SW_META_CACHE_NAME);
    // Між `open` і `put` міг прийти новіший SW_SET_USER / clearAppCaches:
    // не воскрешаємо застарілий ключ на диску.
    if (generation !== keyGeneration) return;
    await cache.put(META_ENTRY_URL, new Response(key));
  } catch {
    /* CacheStorage недоступний: лишаємось на ключі в памʼяті */
  }
}

function restoreOnce(): Promise<void> {
  restorePromise ??= (async () => {
    const generationAtStart = keyGeneration;
    try {
      if (!(await caches.has(SW_META_CACHE_NAME))) return;
      const cache = await caches.open(SW_META_CACHE_NAME);
      const hit = await cache.match(META_ENTRY_URL);
      const stored = hit ? (await hit.text()).trim() : "";
      if (generationAtStart === keyGeneration && STORED_KEY_RE.test(stored)) {
        activeUserKey = stored;
      }
    } catch {
      /* лишаємось на `anon`: кеш /api вимкнений, це безпечний бік */
    }
  })();
  return restorePromise;
}

/**
 * Ключ партиції, дочекавшись відновлення з meta-кешу. Викликай з кожного
 * плагіна, що залежить від ключа, а не читай змінну напряму.
 */
export async function getActiveUserKey(): Promise<string> {
  await restoreOnce();
  return activeUserKey;
}

/** Прогріває відновлення на старті SW (без очікування). */
export function primeActiveUserKey(): void {
  void restoreOnce();
}

/**
 * Зберігає хеш-партицію активного користувача (async: Web Crypto + запис у
 * CacheStorage; обробник повідомлення загортає проміс у `event.waitUntil`).
 * `null`/порожнє значення скидає в `anon` і прибирає meta-запис.
 */
export async function setActiveUserKey(key: string | null): Promise<void> {
  const generation = ++keyGeneration;
  // Явне значення з main thread свіжіше за збережене: якщо відновлення ще не
  // починалось, воно вже не потрібне (інакше стартувало б ПІСЛЯ цього виклику
  // і могло б перебити ключ старим записом, коли `persistKey` не вдався).
  restorePromise ??= Promise.resolve();
  const next = key ? await hashUserKey(key) : ANON_PARTITION;
  // Новіший SW_SET_USER обігнав нас, поки рахувався хеш.
  if (generation !== keyGeneration) return;
  activeUserKey = next;
  await persistKey(next, generation);
}

/**
 * Скидає ключ у `anon` одразу. Викликається з `clearAppCaches`, яка сама
 * видаляє meta-кеш: після очищення нічий кеш не активний, доки main thread
 * не надішле `SW_SET_USER` знову.
 */
export function resetActiveUserKeyInMemory(): void {
  keyGeneration++;
  activeUserKey = ANON_PARTITION;
  // Відновлення з диска вже не потрібне: meta-кеш зараз видаляється, і
  // пізній `restoreOnce` не повинен воскресити ключ зі старого запису.
  restorePromise = Promise.resolve();
}

/** Лише для тестів: повертає модуль у стан «свіжого запуску SW». */
export function __resetActiveUserKeyForTests(): void {
  keyGeneration = 0;
  activeUserKey = ANON_PARTITION;
  restorePromise = null;
}
