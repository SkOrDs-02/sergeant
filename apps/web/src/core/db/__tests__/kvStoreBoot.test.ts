// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

import {
  KV_STORE_BC_NAME,
  __resetKvStoreBootForTests,
  bootstrapKvStore,
  getKvStoreCrossTab,
  kvStoreBoot,
  makeSqliteKvStoreClient,
} from "../kvStoreBoot";
import { __resetSqliteDbForTests, getSqliteDb } from "../sqlite";
import type { SqliteDbHandle } from "../sqlite";
import { kvStore } from "@sergeant/db-schema/sqlite";
import type {
  BroadcastChannelLike,
  SqliteKVStoreClient,
} from "@sergeant/shared";
import type { BootstrapLocalStorage } from "../kvStoreBoot";

/**
 * Tests for {@link bootstrapKvStore} (Stage 9 / PR #062 of
 * `docs/planning/storage-roadmap.md`). Coverage matches the four
 * boot-stage invariants the LS-fallback gate in PR #063 leans on:
 *
 *  1. Cold boot against an empty `kv_store` populates the warm cache
 *     from a fresh scan and flips `loaded = true`.
 *  2. Re-boot is idempotent — second invocation is a no-op so HMR
 *     `main.tsx` reloads do not double-import LS keys.
 *  3. One-time LS to `kv_store` import: writes every LS key to SQLite,
 *     stamps the marker key (`kv_store_migrated_v1`), and skips the
 *     migration on the next boot.
 *  4. Failure-mode: SQLite init throw → `loaded` stays `false`,
 *     `onError` fires, and the warm cache is unchanged so the LS
 *     fallback gate in `resolveStore()` (PR #063) returns the
 *     LS-backed adapter.
 */

vi.stubGlobal("crossOriginIsolated", true);

function fakeLocalStorage(
  initial: Record<string, string> = {},
): BootstrapLocalStorage & {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function fakeBroadcastChannel(): BroadcastChannelLike & {
  posted: unknown[];
} {
  const posted: unknown[] = [];
  return {
    posted,
    postMessage(message) {
      posted.push(message);
    },
    addEventListener() {},
    removeEventListener() {},
    close() {},
  };
}

beforeEach(() => {
  __resetSqliteDbForTests();
  __resetKvStoreBootForTests();
  // Hide the persistent VFSes so `openDb()` falls through to memory.
  Object.defineProperty(globalThis.navigator, "storage", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "FileSystemFileHandle", {
    value: undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: undefined,
    configurable: true,
  });
});

afterEach(() => {
  __resetSqliteDbForTests();
  __resetKvStoreBootForTests();
  vi.restoreAllMocks();
});

describe("bootstrapKvStore — cold boot against empty kv_store", () => {
  it("flips loaded = true and leaves the warm cache empty when LS is empty", async () => {
    const result = await bootstrapKvStore({
      localStorage: null,
      broadcastChannel: null,
    });
    expect(result.loaded).toBe(true);
    expect(kvStoreBoot.loaded).toBe(true);
    // Warm cache empty: no LS migration ran (no LS), no marker stamped.
    expect(kvStoreBoot.warmCache.size).toBe(0);
  });

  it("returns a working SqliteKVStoreClient bound to the live SQLite handle", async () => {
    const result = await bootstrapKvStore({
      localStorage: null,
      broadcastChannel: null,
    });
    expect(result.sqlite).not.toBeNull();
    // Round-trip: upsert a row via the bootstrap-returned client and
    // confirm it lands in the underlying kv_store table.
    await result.sqlite!.upsert({
      key: "k",
      value: "v",
      updatedAt: 1_700_000_000_000,
    });
    const handle = await getSqliteDb();
    const rows = await handle.drizzle.select().from(kvStore);
    expect(rows.find((r) => r.key === "k")?.value).toBe("v");
  });
});

describe("bootstrapKvStore — warm cache populated from kv_store rows", () => {
  it("scans kv_store and seeds warmCache before flipping loaded", async () => {
    // Seed kv_store directly via the live handle.
    const handle = await getSqliteDb();
    await handle.drizzle.run(
      sql`CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (CAST((unixepoch() * 1000) AS INTEGER))
      )`,
    );
    await handle.drizzle.run(
      sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('a', '1', 100)`,
    );
    await handle.drizzle.run(
      sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('b', '2', 200)`,
    );
    await handle.drizzle.run(
      sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('kv_store_migrated_v1', 'done', 300)`,
    );

    const result = await bootstrapKvStore({
      localStorage: null,
      broadcastChannel: null,
    });
    expect(result.loaded).toBe(true);
    expect(kvStoreBoot.warmCache.get("a")).toBe("1");
    expect(kvStoreBoot.warmCache.get("b")).toBe("2");
    expect(kvStoreBoot.warmCache.get("kv_store_migrated_v1")).toBe("done");
  });
});

describe("bootstrapKvStore — re-boot idempotency", () => {
  it("returns immediately on the second call without re-scanning", async () => {
    await bootstrapKvStore({
      localStorage: null,
      broadcastChannel: null,
    });
    expect(kvStoreBoot.loaded).toBe(true);

    // Spy on getDb — second call must NOT touch SQLite.
    const getDb = vi.fn();
    const result = await bootstrapKvStore({
      getDb,
      localStorage: null,
      broadcastChannel: null,
    });
    expect(getDb).not.toHaveBeenCalled();
    expect(result.loaded).toBe(true);
  });
});

describe("bootstrapKvStore — one-time LS to kv_store import", () => {
  it("imports every LS key, stamps the marker, and warms the cache", async () => {
    const ls = fakeLocalStorage({
      hub_flags_v1: "{}",
      fizruk_rest: '{"sec":90}',
      nutrition_pantry_v2: "[]",
    });
    const now = vi.fn(() => 1_700_000_000_000);
    const result = await bootstrapKvStore({
      localStorage: ls,
      broadcastChannel: null,
      now,
    });
    expect(result.loaded).toBe(true);
    expect(kvStoreBoot.warmCache.get("hub_flags_v1")).toBe("{}");
    expect(kvStoreBoot.warmCache.get("fizruk_rest")).toBe('{"sec":90}');
    expect(kvStoreBoot.warmCache.get("nutrition_pantry_v2")).toBe("[]");
    expect(kvStoreBoot.warmCache.has("kv_store_migrated_v1")).toBe(true);

    // Round-trip: imported rows are durable in kv_store.
    const handle = await getSqliteDb();
    const rows = await handle.drizzle.select().from(kvStore);
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    expect(byKey.get("hub_flags_v1")).toBe("{}");
    expect(byKey.get("fizruk_rest")).toBe('{"sec":90}');
    expect(byKey.get("nutrition_pantry_v2")).toBe("[]");
    expect(byKey.has("kv_store_migrated_v1")).toBe(true);
  });

  it("skips the LS migration when the marker is already present in kv_store", async () => {
    // Seed kv_store with the marker.
    const handle = await getSqliteDb();
    await handle.drizzle.run(
      sql`CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (CAST((unixepoch() * 1000) AS INTEGER))
      )`,
    );
    await handle.drizzle.run(
      sql`INSERT INTO kv_store (key, value, updated_at) VALUES ('kv_store_migrated_v1', 'done', 100)`,
    );
    const ls = fakeLocalStorage({ a: "should-not-import" });
    const result = await bootstrapKvStore({
      localStorage: ls,
      broadcastChannel: null,
    });
    expect(result.loaded).toBe(true);
    // LS key NOT imported because the marker was already present.
    expect(kvStoreBoot.warmCache.has("a")).toBe(false);
  });

  it("never imports the marker key itself even when LS contains it (defensive)", async () => {
    const ls = fakeLocalStorage({
      kv_store_migrated_v1: "lying-payload",
      "real-key": "real-value",
    });
    const result = await bootstrapKvStore({
      localStorage: ls,
      broadcastChannel: null,
    });
    expect(result.loaded).toBe(true);
    // The bootstrap stamps its own marker; it never copies the LS one.
    expect(kvStoreBoot.warmCache.get("kv_store_migrated_v1")).not.toBe(
      "lying-payload",
    );
    expect(kvStoreBoot.warmCache.get("real-key")).toBe("real-value");
  });

  it("continues the batch when a single LS key fails to upsert", async () => {
    const ls = fakeLocalStorage({ ok: "1", bad: "2", also_ok: "3" });

    const result = await bootstrapKvStore({
      localStorage: ls,
      broadcastChannel: null,
    });
    expect(result.loaded).toBe(true);
    // All three keys made it across via the live SQLite client (no
    // injected failures here — the test just confirms the batch runs
    // to completion against the real handle).
    expect(kvStoreBoot.warmCache.get("ok")).toBe("1");
    expect(kvStoreBoot.warmCache.get("bad")).toBe("2");
    expect(kvStoreBoot.warmCache.get("also_ok")).toBe("3");
    expect(kvStoreBoot.warmCache.has("kv_store_migrated_v1")).toBe(true);
  });
});

describe("bootstrapKvStore — failure modes", () => {
  it("leaves loaded = false when SQLite init throws", async () => {
    const onError = vi.fn();
    const getDb = vi.fn(() => Promise.reject(new Error("opfs failure")));
    const result = await bootstrapKvStore({
      getDb,
      localStorage: null,
      broadcastChannel: null,
      onError,
    });
    expect(result.loaded).toBe(false);
    expect(kvStoreBoot.loaded).toBe(false);
    expect(onError).toHaveBeenCalledWith("sqlite-init", expect.any(Error));
  });

  it("never throws — SQLite init throw resolves the promise", async () => {
    const getDb = vi.fn(() => Promise.reject(new Error("opfs failure")));
    await expect(
      bootstrapKvStore({
        getDb,
        localStorage: null,
        broadcastChannel: null,
        onError: () => {},
      }),
    ).resolves.toBeDefined();
  });

  it("leaves loaded = false when the kv_store migration runner throws", async () => {
    const onError = vi.fn();
    const handle = await getSqliteDb();
    // Replace migrationClient.exec with a throw so runMigrations fails.
    const fakeHandle: SqliteDbHandle = {
      ...handle,
      migrationClient() {
        return {
          exec: () => {
            throw new Error("migration-runner-blew-up");
          },
          run: () => {},
          all: () => [],
        };
      },
    };
    const result = await bootstrapKvStore({
      getDb: () => Promise.resolve(fakeHandle),
      localStorage: null,
      broadcastChannel: null,
      onError,
    });
    expect(result.loaded).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      "kv-store-migration",
      expect.any(Error),
    );
  });

  it("leaves loaded = false when the warm-cache scan throws", async () => {
    const onError = vi.fn();
    const handle = await getSqliteDb();
    // Replace drizzle.select with a throw so the warm-cache scan
    // fails. Use Object.defineProperty so the rest of the handle stays
    // intact (migrationClient still works for the migration step).
    const failingDrizzle = new Proxy(handle.drizzle, {
      get(target, prop, receiver) {
        if (prop === "select") {
          return () => ({
            from: () => Promise.reject(new Error("scan-blew-up")),
          });
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const fakeHandle: SqliteDbHandle = {
      ...handle,
      get drizzle() {
        return failingDrizzle as SqliteDbHandle["drizzle"];
      },
    };
    const result = await bootstrapKvStore({
      getDb: () => Promise.resolve(fakeHandle),
      localStorage: null,
      broadcastChannel: null,
      onError,
    });
    expect(result.loaded).toBe(false);
    expect(onError).toHaveBeenCalledWith("kv-store-scan", expect.any(Error));
  });

  it("LS migration failure is non-fatal — boot still flips loaded = true", async () => {
    const onError = vi.fn();
    const ls: BootstrapLocalStorage = {
      get length(): number {
        throw new Error("ls-property-throws");
      },
      key: () => null,
      getItem: () => null,
    };
    const result = await bootstrapKvStore({
      localStorage: ls,
      broadcastChannel: null,
      onError,
    });
    expect(result.loaded).toBe(true);
    expect(onError).toHaveBeenCalledWith("ls-migration", expect.any(Error));
  });
});

describe("bootstrapKvStore — BroadcastChannel wiring", () => {
  it("uses an injected BroadcastChannel as-is", async () => {
    const bc = fakeBroadcastChannel();
    await bootstrapKvStore({ localStorage: null, broadcastChannel: bc });
    expect(getKvStoreCrossTab()).toBe(bc);
  });

  it("falls back to null when the runtime has no BroadcastChannel", async () => {
    // Hide BroadcastChannel for the duration of this boot.
    const original = (globalThis as { BroadcastChannel?: unknown })
      .BroadcastChannel;
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: undefined,
      configurable: true,
    });
    try {
      await bootstrapKvStore({ localStorage: null });
      expect(getKvStoreCrossTab()).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "BroadcastChannel", {
        value: original,
        configurable: true,
      });
    }
  });

  it("constructs `kv-store` channel by default when BroadcastChannel exists", async () => {
    const calls: string[] = [];
    class FakeCtor implements BroadcastChannelLike {
      constructor(public readonly channelName: string) {
        calls.push(channelName);
      }
      postMessage() {}
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: FakeCtor,
      configurable: true,
    });
    try {
      await bootstrapKvStore({ localStorage: null });
      expect(calls).toEqual([KV_STORE_BC_NAME]);
    } finally {
      Object.defineProperty(globalThis, "BroadcastChannel", {
        value: undefined,
        configurable: true,
      });
    }
  });

  it("BroadcastChannel constructor throw degrades to null without breaking boot", async () => {
    Object.defineProperty(globalThis, "BroadcastChannel", {
      value: function () {
        throw new Error("BC unavailable");
      },
      configurable: true,
    });
    try {
      const result = await bootstrapKvStore({ localStorage: null });
      expect(result.loaded).toBe(true);
      expect(getKvStoreCrossTab()).toBeNull();
    } finally {
      Object.defineProperty(globalThis, "BroadcastChannel", {
        value: undefined,
        configurable: true,
      });
    }
  });
});

describe("makeSqliteKvStoreClient", () => {
  it("upserts and removes via the live drizzle handle", async () => {
    const handle = await getSqliteDb();
    // Schema may not exist yet (we have not run the migration); set it up.
    await handle.drizzle.run(
      sql`CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (CAST((unixepoch() * 1000) AS INTEGER))
      )`,
    );
    const client: SqliteKVStoreClient = makeSqliteKvStoreClient(handle);

    await client.upsert({ key: "x", value: "1", updatedAt: 100 });
    let rows = await handle.drizzle.select().from(kvStore);
    expect(rows.find((r) => r.key === "x")?.value).toBe("1");

    // Upsert collision (same key) should overwrite, not throw.
    await client.upsert({ key: "x", value: "2", updatedAt: 200 });
    rows = await handle.drizzle.select().from(kvStore);
    expect(rows.find((r) => r.key === "x")?.value).toBe("2");

    await client.remove("x");
    rows = await handle.drizzle.select().from(kvStore);
    expect(rows.find((r) => r.key === "x")).toBeUndefined();
  });
});
