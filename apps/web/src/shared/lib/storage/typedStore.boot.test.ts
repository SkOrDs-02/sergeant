/**
 * priv-03: typedStore, створений і прочитаний ДО буту SQLite kv-стора, не
 * мусить назавжди кешувати порожній localStorage і мусить підхопити значення
 * з SQLite після буту (`reloadAllTypedStores`) разом з `onChange`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { KVStore } from "@sergeant/shared";

const { sqliteRef } = vi.hoisted(() => ({
  sqliteRef: { current: null as KVStore | null },
}));

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => sqliteRef.current,
}));

import {
  __resetStorageReadyForTests,
  markStorageBooting,
  markStorageReady,
} from "../../../core/db/storageReady";
import { createTypedStore, reloadAllTypedStores } from "./typedStore";

function makeLS() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => map.set(k, String(v)),
    removeItem: (k: string) => map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** Мінімальний in-memory KVStore з `onChange`, як у SQLite warm-cache. */
function makeMemKv(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const subs = new Map<string, Set<(next: string | null) => void>>();
  const store: KVStore = {
    getString: (k) => map.get(k) ?? null,
    setString(k, v) {
      map.set(k, v);
      subs.get(k)?.forEach((l) => l(v));
    },
    remove(k) {
      map.delete(k);
      subs.get(k)?.forEach((l) => l(null));
    },
    listKeys: () => Array.from(map.keys()),
    onChange(k, listener) {
      let set = subs.get(k);
      if (!set) subs.set(k, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
  };
  return { store, subscriberCount: (k: string) => subs.get(k)?.size ?? 0 };
}

const envelope = (data: unknown) => JSON.stringify({ __v: 1, data });
const schema = z.record(z.string(), z.boolean());
let keyCounter = 0;
const freshKey = () => `boot_test_${(keyCounter += 1)}`;

describe("typedStore: бут SQLite kv-стора (priv-03)", () => {
  beforeEach(() => {
    globalThis.localStorage = makeLS();
    sqliteRef.current = null;
    markStorageBooting();
  });

  afterEach(() => {
    sqliteRef.current = null;
    __resetStorageReadyForTests();
  });

  it("не фіксує читання до буту: значення з SQLite підхоплюється після reloadAllTypedStores", () => {
    const key = freshKey();
    const store = createTypedStore<Record<string, boolean>>({
      key,
      version: 1,
      schema,
      defaultValue: {},
    });
    // Перший рендер, бут ще не завершився: LS порожній.
    expect(store.get()).toEqual({});

    // Бут: значення лежить лише в SQLite kv, у LS його немає.
    const sqlite = makeMemKv({ [key]: envelope({ "app-lock-enabled": true }) });
    sqliteRef.current = sqlite.store;
    reloadAllTypedStores();
    markStorageReady();

    expect(store.get()).toEqual({ "app-lock-enabled": true });
  });

  it("reloadAllTypedStores сповіщає підписників новим значенням", () => {
    const key = freshKey();
    const store = createTypedStore<Record<string, boolean>>({
      key,
      version: 1,
      schema,
      defaultValue: {},
    });
    store.get();
    const listener = vi.fn();
    store.subscribe(listener);

    sqliteRef.current = makeMemKv({ [key]: envelope({ flag: true }) }).store;
    reloadAllTypedStores();

    expect(listener).toHaveBeenCalledWith({ flag: true });
  });

  it("onChange переприв'язується до SQLite-стора і спрацьовує після буту", () => {
    const key = freshKey();
    const store = createTypedStore<Record<string, boolean>>({
      key,
      version: 1,
      schema,
      defaultValue: {},
    });
    const sqlite = makeMemKv();
    sqliteRef.current = sqlite.store;
    // До переприв'язки підписки на SQLite-стор немає — саме це й була діра.
    expect(sqlite.subscriberCount(key)).toBe(0);

    reloadAllTypedStores();
    markStorageReady();
    expect(sqlite.subscriberCount(key)).toBe(1);

    const listener = vi.fn();
    store.subscribe(listener);
    // Інша вкладка (BroadcastChannel) / replaceCache змінює ключ у SQLite.
    sqlite.store.setString(key, envelope({ flag: true }));
    expect(listener).toHaveBeenCalledWith({ flag: true });
    expect(store.get()).toEqual({ flag: true });

    // Повторний reloadAll не множить підписки.
    reloadAllTypedStores();
    expect(sqlite.subscriberCount(key)).toBe(1);
  });

  it("до буту віддає ref-стабільний результат (useSyncExternalStore) і бачить свіжий LS", () => {
    const key = freshKey();
    const store = createTypedStore<Record<string, boolean>>({
      key,
      version: 1,
      schema,
      defaultValue: {},
    });
    globalThis.localStorage.setItem(key, envelope({ a: true }));
    const first = store.get();
    expect(store.get()).toBe(first);

    // Кеш не зафіксований: зміна в LS до буту видна.
    globalThis.localStorage.setItem(key, envelope({ a: false }));
    expect(store.get()).toEqual({ a: false });
  });

  it("LS-фолбек (бут не підняв SQLite): після markStorageReady перше читання кешується", () => {
    const key = freshKey();
    const store = createTypedStore<Record<string, boolean>>({
      key,
      version: 1,
      schema,
      defaultValue: {},
    });
    globalThis.localStorage.setItem(key, envelope({ a: true }));
    markStorageReady();
    expect(store.get()).toEqual({ a: true });

    // Тепер кеш зафіксований (як і раніше поза вікном буту).
    globalThis.localStorage.setItem(key, envelope({ a: false }));
    expect(store.get()).toEqual({ a: true });
  });
});
