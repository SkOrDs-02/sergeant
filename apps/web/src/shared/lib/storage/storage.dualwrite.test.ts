/**
 * Stage 9 / PR #064 — `webKVStore` resolve ladder (post-dual-write).
 *
 * PR #063 introduced a dual-write mirror so `localStorage` stayed
 * populated during a 4-week canary. PR #064 dropped the mirror —
 * `resolveStore()` now returns the SQLite adapter directly when
 * available, with no LS fan-out.
 *
 * Covers the two-rung + memory-fallback ladder in `resolveStore()`:
 *
 *   1. SQLite-backed adapter wins when `getActiveSqliteKvStore()`
 *      returns non-null — reads and writes go to SQLite only, no
 *      LS mirror.
 *   2. LS-backed adapter wins when `getActiveSqliteKvStore()` returns
 *      `null` (pre-bootstrap, on bootstrap failure, or in
 *      environments without SQLite-WASM).
 *   3. In-memory fallback wins when both rungs above are unavailable.
 *
 * Resolution is lazy on every method call. A test that sets a
 * SQLite-backed return value via `__setActiveSqliteKvStore` AFTER
 * the module is imported still gets the SQLite adapter on the next
 * `webKVStore.getString` / `setString` call.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import type { KVStore, Unsubscribe } from "@sergeant/shared";

const getActiveSqliteKvStoreMock = vi.fn<() => KVStore | null>(() => null);

vi.mock("../../../core/db/kvStoreBoot", () => ({
  getActiveSqliteKvStore: () => getActiveSqliteKvStoreMock(),
}));

// Importing *after* `vi.mock` so the mock factory is registered.
import { webKVStore } from "./storage";

interface FakeKvStore extends KVStore {
  readonly getString: Mock<(key: string) => string | null>;
  readonly setString: Mock<(key: string, value: string) => void>;
  readonly remove: Mock<(key: string) => void>;
  readonly listKeys: Mock<() => string[]>;
  readonly onChange: Mock<
    (key: string, listener: (next: string | null) => void) => Unsubscribe
  >;
}

function makeFakeKvStore(): FakeKvStore {
  const getString = vi.fn<(key: string) => string | null>(() => null);
  const setString = vi.fn<(key: string, value: string) => void>(() => {});
  const remove = vi.fn<(key: string) => void>(() => {});
  const listKeys = vi.fn<() => string[]>(() => []);
  const onChange = vi.fn<
    (key: string, listener: (next: string | null) => void) => Unsubscribe
  >(() => () => {});
  return { getString, setString, remove, listKeys, onChange };
}

interface FakeLocalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
}

function installFakeLocalStorage(): {
  storage: FakeLocalStorage;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const storage: FakeLocalStorage = {
    getItem: (k) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length(): number {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  return { storage, store };
}

function uninstallFakeLocalStorage(): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: undefined,
  });
}

describe("webKVStore resolve ladder (post-dual-write)", () => {
  beforeEach(() => {
    getActiveSqliteKvStoreMock.mockReset();
    getActiveSqliteKvStoreMock.mockReturnValue(null);
  });

  afterEach(() => {
    uninstallFakeLocalStorage();
  });

  describe("rung 2 — LS-only (pre-bootstrap)", () => {
    it("reads / writes via localStorage when SQLite adapter is null", () => {
      installFakeLocalStorage();

      webKVStore.setString("alpha", "1");
      expect(webKVStore.getString("alpha")).toBe("1");
      expect(localStorage.getItem("alpha")).toBe("1");

      webKVStore.remove("alpha");
      expect(webKVStore.getString("alpha")).toBeNull();
      expect(localStorage.getItem("alpha")).toBeNull();
    });

    it("listKeys reflects localStorage", () => {
      installFakeLocalStorage();
      localStorage.setItem("a", "1");
      localStorage.setItem("b", "2");
      expect(new Set(webKVStore.listKeys())).toEqual(new Set(["a", "b"]));
    });
  });

  describe("rung 3 — memory fallback (no SQLite, no LS)", () => {
    it("survives across calls within the same process", () => {
      uninstallFakeLocalStorage();
      getActiveSqliteKvStoreMock.mockReturnValue(null);

      webKVStore.setString("ephemeral", "kept");
      expect(webKVStore.getString("ephemeral")).toBe("kept");

      webKVStore.remove("ephemeral");
      expect(webKVStore.getString("ephemeral")).toBeNull();
    });
  });

  describe("rung 1 — SQLite (no LS mirror)", () => {
    it("reads from SQLite primary only", () => {
      installFakeLocalStorage();
      const sqlite = makeFakeKvStore();
      sqlite.getString.mockImplementation((k) =>
        k === "from-sqlite" ? "sqlite-value" : null,
      );
      localStorage.setItem("from-sqlite", "ls-value");
      getActiveSqliteKvStoreMock.mockReturnValue(sqlite);

      expect(webKVStore.getString("from-sqlite")).toBe("sqlite-value");
      expect(sqlite.getString).toHaveBeenCalledWith("from-sqlite");
    });

    it("writes go to SQLite only — LS is NOT mirrored", () => {
      installFakeLocalStorage();
      const sqlite = makeFakeKvStore();
      getActiveSqliteKvStoreMock.mockReturnValue(sqlite);

      webKVStore.setString("k", "v");

      expect(sqlite.setString).toHaveBeenCalledWith("k", "v");
      // No mirror write — LS must NOT receive the value.
      expect(localStorage.getItem("k")).toBeNull();
    });

    it("removes go to SQLite only — LS is NOT mirrored", () => {
      installFakeLocalStorage();
      localStorage.setItem("doomed", "stale");
      const sqlite = makeFakeKvStore();
      getActiveSqliteKvStoreMock.mockReturnValue(sqlite);

      webKVStore.remove("doomed");

      expect(sqlite.remove).toHaveBeenCalledWith("doomed");
      // LS key untouched — no mirror remove.
      expect(localStorage.getItem("doomed")).toBe("stale");
    });

    it("listKeys is sourced from SQLite primary, not LS", () => {
      installFakeLocalStorage();
      localStorage.setItem("orphan", "stale");
      const sqlite = makeFakeKvStore();
      sqlite.listKeys.mockReturnValue(["sqlite-key"]);
      getActiveSqliteKvStoreMock.mockReturnValue(sqlite);

      expect(webKVStore.listKeys()).toEqual(["sqlite-key"]);
      expect(sqlite.listKeys).toHaveBeenCalled();
    });

    it("onChange subscribes via SQLite primary only", () => {
      installFakeLocalStorage();
      const sqlite = makeFakeKvStore();
      const unsubscribeFn = vi.fn();
      sqlite.onChange.mockReturnValue(unsubscribeFn);
      getActiveSqliteKvStoreMock.mockReturnValue(sqlite);

      const listener = vi.fn();
      const unsubscribe = webKVStore.onChange("watched", listener);

      expect(sqlite.onChange).toHaveBeenCalledWith("watched", listener);
      expect(unsubscribe).toBe(unsubscribeFn);
    });
  });

  describe("SQLite without LS available", () => {
    it("returns SQLite primary as-is when localStorage is unavailable", () => {
      uninstallFakeLocalStorage();
      const sqlite = makeFakeKvStore();
      sqlite.getString.mockReturnValue("from-cache");
      getActiveSqliteKvStoreMock.mockReturnValue(sqlite);

      expect(webKVStore.getString("k")).toBe("from-cache");

      webKVStore.setString("k", "v");
      expect(sqlite.setString).toHaveBeenCalledWith("k", "v");
    });
  });

  describe("lazy resolution semantics", () => {
    it("picks up the SQLite adapter on the call AFTER bootstrap completes", () => {
      installFakeLocalStorage();

      // Rung 2: LS-backed write while bootstrap is still running.
      webKVStore.setString("k", "ls-value");
      expect(localStorage.getItem("k")).toBe("ls-value");

      // Bootstrap completes — SQLite adapter takes over.
      const sqlite = makeFakeKvStore();
      sqlite.getString.mockImplementation((key) =>
        key === "k" ? "sqlite-value" : null,
      );
      getActiveSqliteKvStoreMock.mockReturnValue(sqlite);

      // Subsequent reads route through SQLite.
      expect(webKVStore.getString("k")).toBe("sqlite-value");
    });
  });
});
