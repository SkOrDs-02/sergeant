// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveUserKeyForTests,
  getActiveUserKey,
  resetActiveUserKeyInMemory,
  setActiveUserKey,
} from "./activeUserKey";
import { SW_META_CACHE_NAME } from "./cachePolicy";

/**
 * priv-08: ключ партиції мусить переживати idle-kill SW. «Перезапуск
 * воркера» тут — `__resetActiveUserKeyForTests()` (скидає змінні модуля), а
 * CacheStorage-мок лишається, як у браузері.
 */
function installFakeCacheStorage() {
  const store = new Map<string, Map<string, string>>();
  const fake = {
    keys: async () => [...store.keys()],
    has: async (n: string) => store.has(n),
    delete: async (n: string) => store.delete(n),
    open: async (n: string) => {
      if (!store.has(n)) store.set(n, new Map());
      const entries = store.get(n)!;
      return {
        put: async (url: string, res: Response) => {
          entries.set(url, await res.text());
        },
        match: async (url: string) =>
          entries.has(url) ? new Response(entries.get(url)!) : undefined,
      };
    },
  };
  vi.stubGlobal("caches", fake);
  return store;
}

describe("sw/activeUserKey (priv-08)", () => {
  let store: ReturnType<typeof installFakeCacheStorage>;

  beforeEach(() => {
    store = installFakeCacheStorage();
    __resetActiveUserKeyForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("на холодному старті без збереженого ключа партиція anon", async () => {
    await expect(getActiveUserKey()).resolves.toBe("anon");
  });

  it("ключ переживає перезапуск SW (idle-kill) і НЕ відкочується в anon", async () => {
    await setActiveUserKey("user-a");
    const before = await getActiveUserKey();
    expect(before).toMatch(/^[0-9a-f]{32}$/);
    // Сирий id не потрапляє в кеш-сховище метаданих.
    expect([...store.get(SW_META_CACHE_NAME)!.values()]).toEqual([before]);

    __resetActiveUserKeyForTests(); // воркер убито, памʼять порожня

    await expect(getActiveUserKey()).resolves.toBe(before);
  });

  it("різні користувачі мають різні партиції", async () => {
    await setActiveUserKey("user-a");
    const a = await getActiveUserKey();
    await setActiveUserKey("user-b");
    const b = await getActiveUserKey();
    expect(a).not.toBe(b);
  });

  it("null (вихід) прибирає meta-запис: після перезапуску знову anon", async () => {
    await setActiveUserKey("user-a");
    await setActiveUserKey(null);
    expect(store.has(SW_META_CACHE_NAME)).toBe(false);

    __resetActiveUserKeyForTests();

    await expect(getActiveUserKey()).resolves.toBe("anon");
  });

  it("SW_SET_USER, що прийшов під час відновлення, перемагає збережений ключ", async () => {
    await setActiveUserKey("user-a");
    const a = await getActiveUserKey();
    __resetActiveUserKeyForTests();

    // Відновлення ще не завершене (чекає I/O), а вже приходить новий користувач.
    const restoring = getActiveUserKey();
    await setActiveUserKey("user-b");
    await restoring;

    const now = await getActiveUserKey();
    expect(now).not.toBe(a);
    expect(now).toMatch(/^[0-9a-f]{32}$/);
  });

  it("повільний хеш старого SW_SET_USER не перебиває новіший вихід (null)", async () => {
    const first = setActiveUserKey("user-a"); // чекає хеш
    const second = setActiveUserKey(null); // синхронний шлях
    await Promise.all([first, second]);

    await expect(getActiveUserKey()).resolves.toBe("anon");
    expect(store.has(SW_META_CACHE_NAME)).toBe(false);
  });

  it("resetActiveUserKeyInMemory скидає в anon і не дає відновленню воскресити ключ", async () => {
    await setActiveUserKey("user-a");
    resetActiveUserKeyInMemory();
    await expect(getActiveUserKey()).resolves.toBe("anon");
  });

  it("зіпсований запис у meta-кеші ігнорується (anon)", async () => {
    const cache = await caches.open(SW_META_CACHE_NAME);
    await cache.put("/__sw/active-user", new Response("<script>"));
    await expect(getActiveUserKey()).resolves.toBe("anon");
  });
});
