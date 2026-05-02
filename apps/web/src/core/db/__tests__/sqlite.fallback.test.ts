import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetSqliteDbForTests, getSqliteDb } from "../sqlite";

/**
 * Fallback path: when the host browser does not expose OPFS at all
 * (Safari < 17 / iOS < 16.4 / jsdom default) we expect `getSqliteDb()` to
 *
 * 1. Skip the OPFS-SAH Pool VFS branch entirely.
 * 2. Pick the kvvfs (`localStorage`) backend if `localStorage` is
 *    writable.
 * 3. Fall through to the in-memory `:memory:` DB only when even
 *    `localStorage` is unavailable.
 *
 * The Vitest config for `apps/web` runs in the `node` environment so
 * neither `navigator.storage` nor `localStorage` is provided
 * out-of-the-box — each test installs whichever shim it needs.
 */

vi.mock("@sqlite.org/sqlite-wasm", () => import("./sqlite-wasm-fake"));
vi.mock("../../observability/sentry.js", () => ({
  addSentryBreadcrumb: vi.fn(),
}));

function makeWorkingLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

describe("getSqliteDb — fallback when OPFS is unavailable", () => {
  beforeEach(() => {
    __resetSqliteDbForTests();
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      value: true,
      configurable: true,
    });
    // Ensure no OPFS markers are present.
    Object.defineProperty(globalThis.navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "FileSystemFileHandle", {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    __resetSqliteDbForTests();
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("falls back to kvvfs when localStorage is available", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: makeWorkingLocalStorage(),
      configurable: true,
    });

    const handle = await getSqliteDb();
    expect(handle.vfs).toBe("kvvfs");
  });

  it("falls back to in-memory when localStorage is unavailable too", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    });

    const handle = await getSqliteDb();
    expect(handle.vfs).toBe("memory");
  });

  it("falls back to in-memory when localStorage throws (private mode)", async () => {
    const throwing: Storage = {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: throwing,
      configurable: true,
    });

    const handle = await getSqliteDb();
    expect(handle.vfs).toBe("memory");
  });
});
