import { describe, expect, it } from "vitest";
import { Query, QueryCache, QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@sergeant/shared";

import {
  PERSIST_MAX_AGE_MS,
  createWebPersistOptions,
  shouldDehydrateQueryForPersist,
} from "./queryClientPersister";

/**
 * Створюємо `Query` через `QueryCache.build`, бо це єдиний шлях
 * отримати екземпляр з усіма приватними полями (state, dataUpdateCount,
 * fetchStatus), які реально перевіряє `shouldDehydrateQueryForPersist`.
 * Просто закастити літерал на `Query` — крихко: TanStack рефакторить
 * `QueryState` між мінорами.
 */
function makeQuery(client: QueryClient, key: readonly unknown[]): Query {
  const cache = client.getQueryCache();
  // `queryFn` typed as returning `unknown` so that `cache.build` resolves to
  // `Query<unknown, …>`, which is what `shouldDehydrateQueryForPersist`
  // (and TanStack's own `dehydrateOptions.shouldDehydrateQuery`) expect.
  // Returning `null` directly would narrow the generic to `Query<null, …>`
  // and produce a TS2322 mismatch under `strict` mode.
  const queryFn = async (): Promise<unknown> => null;
  return cache.build(client, {
    queryKey: key,
    queryFn,
  });
}

describe("shouldDehydrateQueryForPersist", () => {
  it("персистить query з успішними даними", () => {
    const client = new QueryClient();
    // Деталі finyk-транзакцій не sensitive: PAT живе тільки на сервері
    // (PR #002), а самі транзакції — це звичайні budgets/categories.
    // Раніше тут стояло ["finyk", "balance"], але після PR #004
    // (`docs/planning/storage-roadmap.md`) `balance` як сегмент query-key
    // потрапляє у `SENSITIVE_QUERY_KEY_FRAGMENTS` і свідомо
    // виключається з персиста — тому для тесту "вдалі дані
    // персистяться" треба key, що не натикається на той блок-list.
    const query = makeQuery(client, ["finyk", "transactions"]);
    query.setData({ ids: [1, 2, 3] });

    expect(shouldDehydrateQueryForPersist(query)).toBe(true);
  });

  it("НЕ персистить query у статусі error (401/500 не повинні переживати cold-start)", () => {
    const cache = new QueryCache();
    const client = new QueryClient({ queryCache: cache });
    // Будь-який не-sensitive key годиться — тут перевіряємо саме
    // фільтр статусу `error`, а не sensitive-list. До PR #004 тут
    // стояв ["coach", "advice"], але `coach` тепер у
    // `SENSITIVE_QUERY_KEY_NAMESPACES` і його exclusion завжди
    // повертає false ще до перевірки error-статусу — тест втрачав
    // сенс.
    const query = makeQuery(client, ["digest", "weekly"]);
    // Симуляція HTTP-помилки: setState переводить query у error-status,
    // не зачіпаючи мережу.
    query.setState({
      ...query.state,
      status: "error",
      error: new Error("HTTP 500"),
      fetchStatus: "idle",
    });

    expect(shouldDehydrateQueryForPersist(query)).toBe(false);
  });

  it("НЕ персистить query, у якого ще не було жодного успішного оновлення (dataUpdateCount === 0)", () => {
    const client = new QueryClient();
    const query = makeQuery(client, ["digest", "weekly"]);
    // Свіжо побудована query без даних: `dataUpdateCount === 0`.
    expect(query.state.dataUpdateCount).toBe(0);
    expect(shouldDehydrateQueryForPersist(query)).toBe(false);
  });

  it("персистить query після setData (dataUpdateCount > 0) навіть зі stale-даними", () => {
    const client = new QueryClient();
    const query = makeQuery(client, ["finyk", "txCats"]);
    query.setData({ ids: [1, 2, 3] });
    // Імітація stale: data є, але dataUpdatedAt старий.
    query.setState({
      ...query.state,
      dataUpdatedAt: Date.now() - 60 * 60 * 1_000,
    });

    expect(shouldDehydrateQueryForPersist(query)).toBe(true);
  });
});

describe("createWebPersistOptions", () => {
  it("повертає persist-options з 7-денним TTL і фіксованим storage-ключем", () => {
    const options = createWebPersistOptions();

    expect(options.maxAge).toBe(PERSIST_MAX_AGE_MS);
    expect(options.maxAge).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(options.persister).toBeDefined();
    expect(typeof options.persister.persistClient).toBe("function");
    expect(typeof options.persister.restoreClient).toBe("function");
    expect(typeof options.persister.removeClient).toBe("function");
  });

  it("buster — стабільний string (для `import.meta.env.VITE_BUILD_ID` у unit-тестах буде 'dev')", () => {
    const options = createWebPersistOptions();
    expect(typeof options.buster).toBe("string");
    expect(options.buster.length).toBeGreaterThan(0);
  });

  it("dehydrateOptions.shouldDehydrateQuery виставлений на наш селектор", () => {
    const options = createWebPersistOptions();
    expect(options.dehydrateOptions?.shouldDehydrateQuery).toBe(
      shouldDehydrateQueryForPersist,
    );
  });

  it("сторадж-ключ — STORAGE_KEYS.WEB_QUERY_CACHE (контракт із mobile counterpart)", () => {
    expect(STORAGE_KEYS.WEB_QUERY_CACHE).toBe("web:query_cache_v1");
  });
});
