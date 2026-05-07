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

/**
 * Tests for {@link bootstrapKvStore} (Stage 9 / PR #062–#064 of
 * `docs/planning/storage-roadmap.md`). Coverage matches the boot-stage
 * invariants:
 *
 *  1. Cold boot against an empty `kv_store` populates the warm cache
 *     from a fresh scan and flips `loaded = true`.
 *  2. Re-boot is idempotent — second invocation is a no-op so HMR
 *     `main.tsx` reloads do not re-scan.
 *  3. Failure-mode: SQLite init throw → `loaded` stays `false`,
 *     `onError` fires, and the warm cache is unchanged so the LS
 *     fallback gate in `resolveStore()` returns the LS-backed adapter.
 *
 * PR #064 removed the one-time LS→`kv_store` migration (4-week canary
 * passed) and the dual-write mirror. Tests for those are dropped.
 */

vi.stubGlobal("crossOriginIsolated", true);

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
});

afterEach(() => {
  __resetSqliteDbForTests();
  __resetKvStoreBootForTests();
  vi.restoreAllMocks();
});

describe("bootstrapKvStore — cold boot against empty kv_store", () => {
  it("flips loaded = true and leaves the warm cache empty on a fresh db", async () => {
    const result = await bootstrapKvStore({
      broadcastChannel: null,
    });
    expect(result.loaded).toBe(true);
    expect(kvStoreBoot.loaded).toBe(true);
    expect(kvStoreBoot.warmCache.size).toBe(0);
  });

  it("returns a working SqliteKVStoreClient bound to the live SQLite handle", async () => {
    const result = await bootstrapKvStore({
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
      broadcastChannel: null,
    });
    expect(kvStoreBoot.loaded).toBe(true);

    // Spy on getDb — second call must NOT touch SQLite.
    const getDb = vi.fn();
    const result = await bootstrapKvStore({
      getDb,
      broadcastChannel: null,
    });
    expect(getDb).not.toHaveBeenCalled();
    expect(result.loaded).toBe(true);
  });
});

describe("bootstrapKvStore — failure modes", () => {
  it("leaves loaded = false when SQLite init throws", async () => {
    const onError = vi.fn();
    const getDb = vi.fn(() => Promise.reject(new Error("opfs failure")));
    const result = await bootstrapKvStore({
      getDb,
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
      broadcastChannel: null,
      onError,
    });
    expect(result.loaded).toBe(false);
    expect(onError).toHaveBeenCalledWith("kv-store-scan", expect.any(Error));
  });
});

describe("bootstrapKvStore — BroadcastChannel wiring", () => {
  it("uses an injected BroadcastChannel as-is", async () => {
    const bc = fakeBroadcastChannel();
    await bootstrapKvStore({ broadcastChannel: bc });
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
      await bootstrapKvStore({});
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
      await bootstrapKvStore({});
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
      const result = await bootstrapKvStore({});
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
