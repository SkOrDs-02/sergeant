/**
 * Tests for `createSqliteKVStore` — Stage 9 / PR #061 of
 * `docs/planning/storage-roadmap.md`.
 *
 * Coverage targets the four invariants the bootstrap module (PR #062)
 * and `webKVStore` impl swap (PR #063) lean on:
 *
 *  1. Pre-load reads/writes throw `KVStoreNotReadyError` so callers
 *     surface a deterministic error instead of silently observing
 *     `null`. Tests exercise the throw on `getString` / `setString` /
 *     `remove` and verify the soft fallbacks for `listKeys` and
 *     `onChange`.
 *  2. Sync reads come from the warm-cache; writes update the warm-
 *     cache before firing async write-back so a `setString` followed
 *     by `getString` in the same tick observes the new value.
 *  3. SQLite write-back is fire-and-forget — sync throws and rejected
 *     promises route through `onWriteError` without blocking the
 *     caller.
 *  4. Cross-tab `BroadcastChannel` echo is bidirectional: outbound
 *     writes broadcast a `{v:1, t:'set'|'del', k, val?}` message;
 *     inbound BC messages mutate the warm-cache + notify local
 *     listeners. Malformed messages are ignored.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createSqliteKVStore,
  KVStoreNotReadyError,
  type BroadcastChannelLike,
  type SqliteKVStoreBoot,
  type SqliteKVStoreClient,
} from "../kv";

interface FakeBroadcastChannel extends BroadcastChannelLike {
  readonly outbound: unknown[];
  receive(message: unknown): void;
}

function makeFakeBroadcastChannel(): FakeBroadcastChannel {
  const outbound: unknown[] = [];
  const listeners = new Set<(event: { data: unknown }) => void>();
  return {
    outbound,
    postMessage(message) {
      outbound.push(message);
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    receive(message) {
      for (const listener of Array.from(listeners)) {
        listener({ data: message });
      }
    },
  };
}

interface SqliteCalls {
  readonly upsert: {
    key: string;
    value: string;
    updatedAt: number;
  }[];
  readonly remove: string[];
}

function makeSyncSqliteSpy(): {
  client: SqliteKVStoreClient;
  calls: SqliteCalls;
} {
  const calls: SqliteCalls = { upsert: [], remove: [] };
  const client: SqliteKVStoreClient = {
    upsert(row) {
      calls.upsert.push({
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt,
      });
    },
    remove(key) {
      calls.remove.push(key);
    },
  };
  return { client, calls };
}

function makeBoot(
  initial: Record<string, string> = {},
  loaded = true,
): SqliteKVStoreBoot {
  return {
    warmCache: new Map(Object.entries(initial)),
    loaded,
  };
}

// ─── pre-load guards ─────────────────────────────────────────────────

describe("createSqliteKVStore — pre-load behaviour", () => {
  it("throws KVStoreNotReadyError on getString before warm-cache load", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({}, false),
    });
    expect(() => store.getString("hub_flags_v1")).toThrow(KVStoreNotReadyError);
    try {
      store.getString("k");
    } catch (err) {
      expect(err).toBeInstanceOf(KVStoreNotReadyError);
      expect((err as KVStoreNotReadyError).attemptedKey).toBe("k");
    }
  });

  it("throws on setString before warm-cache load", () => {
    const { client, calls } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({}, false),
    });
    expect(() => store.setString("k", "v")).toThrow(KVStoreNotReadyError);
    expect(calls.upsert).toHaveLength(0);
  });

  it("throws on remove before warm-cache load", () => {
    const { client, calls } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({}, false),
    });
    expect(() => store.remove("k")).toThrow(KVStoreNotReadyError);
    expect(calls.remove).toHaveLength(0);
  });

  it("listKeys returns [] pre-load (soft-fail; safe for SSR + lint enumeration)", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({ a: "1", b: "2" }, false),
    });
    expect(store.listKeys()).toEqual([]);
  });

  it("onChange registers pre-load and fires after the warm-cache loads", () => {
    const { client } = makeSyncSqliteSpy();
    const boot = makeBoot({}, false);
    const store = createSqliteKVStore({ sqlite: client, boot });
    const listener = vi.fn();
    store.onChange("k", listener);
    boot.loaded = true;
    store.setString("k", "v1");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("v1");
  });
});

// ─── warm-cache reads ────────────────────────────────────────────────

describe("createSqliteKVStore — read path", () => {
  it("returns null for a missing key (warm-cache miss)", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({ other: "value" }),
    });
    expect(store.getString("missing")).toBeNull();
  });

  it("returns the warm-cache value when present", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({ hub_flags_v1: "{}" }),
    });
    expect(store.getString("hub_flags_v1")).toBe("{}");
  });

  it("listKeys returns the warm-cache keys after load", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({ a: "1", b: "2", c: "3" }),
    });
    expect(store.listKeys().sort()).toEqual(["a", "b", "c"]);
  });
});

// ─── write path ──────────────────────────────────────────────────────

describe("createSqliteKVStore — write path", () => {
  it("setString updates warm-cache before firing the SQLite upsert", () => {
    const { client, calls } = makeSyncSqliteSpy();
    const boot = makeBoot();
    const store = createSqliteKVStore({
      sqlite: client,
      boot,
      now: () => 1_700_000_000_000,
    });
    store.setString("k", "v");
    expect(boot.warmCache.get("k")).toBe("v");
    expect(calls.upsert).toEqual([
      { key: "k", value: "v", updatedAt: 1_700_000_000_000 },
    ]);
    // read-after-write within the same tick must see the new value.
    expect(store.getString("k")).toBe("v");
  });

  it("setString fires onChange listeners synchronously", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    const listener = vi.fn();
    store.onChange("k", listener);
    store.setString("k", "v1");
    store.setString("k", "v2");
    expect(listener).toHaveBeenNthCalledWith(1, "v1");
    expect(listener).toHaveBeenNthCalledWith(2, "v2");
  });

  it("write-coalesce: rapid setString calls converge on the last value", () => {
    const { client, calls } = makeSyncSqliteSpy();
    const boot = makeBoot();
    let now = 0;
    const store = createSqliteKVStore({
      sqlite: client,
      boot,
      now: () => ++now,
    });
    for (let i = 0; i < 20; i += 1) {
      store.setString("hub_flags_v1", `payload-${i}`);
    }
    // Warm-cache + sqlite spy both reflect the final write — fire-and-
    // forget but no lost-write semantics.
    expect(boot.warmCache.get("hub_flags_v1")).toBe("payload-19");
    expect(calls.upsert).toHaveLength(20);
    expect(calls.upsert.at(-1)).toEqual({
      key: "hub_flags_v1",
      value: "payload-19",
      updatedAt: 20,
    });
  });

  it("remove deletes from warm-cache + calls sqlite.remove + notifies listeners", () => {
    const { client, calls } = makeSyncSqliteSpy();
    const boot = makeBoot({ k: "v" });
    const store = createSqliteKVStore({ sqlite: client, boot });
    const listener = vi.fn();
    store.onChange("k", listener);
    store.remove("k");
    expect(boot.warmCache.has("k")).toBe(false);
    expect(calls.remove).toEqual(["k"]);
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("remove on a missing key calls sqlite.remove but does NOT notify", () => {
    const { client, calls } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    const listener = vi.fn();
    store.onChange("missing", listener);
    store.remove("missing");
    // sqlite.remove is still invoked — durable cleanup on disk if a
    // crashed-write left a row but our warm-cache snapshot missed it.
    expect(calls.remove).toEqual(["missing"]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("now defaults to Date.now() when omitted", () => {
    const { client, calls } = makeSyncSqliteSpy();
    const before = Date.now();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    store.setString("k", "v");
    const after = Date.now();
    expect(calls.upsert[0]!.updatedAt).toBeGreaterThanOrEqual(before);
    expect(calls.upsert[0]!.updatedAt).toBeLessThanOrEqual(after);
  });
});

// ─── error handling ──────────────────────────────────────────────────

describe("createSqliteKVStore — error handling", () => {
  it("sync throw from sqlite.upsert routes through onWriteError without blowing up the caller", () => {
    const onWriteError = vi.fn();
    const failing: SqliteKVStoreClient = {
      upsert() {
        throw new Error("sqlite-busy");
      },
      remove() {},
    };
    const boot = makeBoot();
    const store = createSqliteKVStore({
      sqlite: failing,
      boot,
      onWriteError,
    });
    expect(() => store.setString("k", "v")).not.toThrow();
    expect(onWriteError).toHaveBeenCalledWith("upsert", "k", expect.any(Error));
    // warm-cache + listeners still updated — fire-and-forget durability
    // failure must not regress read-after-write consistency.
    expect(boot.warmCache.get("k")).toBe("v");
  });

  it("rejected promise from sqlite.upsert routes through onWriteError", async () => {
    const onWriteError = vi.fn();
    const failing: SqliteKVStoreClient = {
      upsert() {
        return Promise.reject(new Error("expo-sqlite locked"));
      },
      remove() {},
    };
    const store = createSqliteKVStore({
      sqlite: failing,
      boot: makeBoot(),
      onWriteError,
    });
    store.setString("k", "v");
    // microtask flush
    await Promise.resolve();
    await Promise.resolve();
    expect(onWriteError).toHaveBeenCalledWith("upsert", "k", expect.any(Error));
  });

  it("sync throw from sqlite.remove routes through onWriteError", () => {
    const onWriteError = vi.fn();
    const failing: SqliteKVStoreClient = {
      upsert() {},
      remove() {
        throw new Error("sqlite-busy");
      },
    };
    const store = createSqliteKVStore({
      sqlite: failing,
      boot: makeBoot({ k: "v" }),
      onWriteError,
    });
    expect(() => store.remove("k")).not.toThrow();
    expect(onWriteError).toHaveBeenCalledWith("remove", "k", expect.any(Error));
  });

  it("a throwing onWriteError does not propagate", () => {
    const failing: SqliteKVStoreClient = {
      upsert() {
        throw new Error("inner");
      },
      remove() {},
    };
    const store = createSqliteKVStore({
      sqlite: failing,
      boot: makeBoot(),
      onWriteError: () => {
        throw new Error("reporter exploded");
      },
    });
    expect(() => store.setString("k", "v")).not.toThrow();
  });

  it("absent onWriteError swallows write-back failures silently", async () => {
    const failing: SqliteKVStoreClient = {
      upsert() {
        return Promise.reject(new Error("expo-sqlite locked"));
      },
      remove() {},
    };
    const store = createSqliteKVStore({
      sqlite: failing,
      boot: makeBoot(),
    });
    expect(() => store.setString("k", "v")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("a throwing local listener does not propagate to other listeners or to setString", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    const listenerA = vi.fn(() => {
      throw new Error("listener A blew up");
    });
    const listenerB = vi.fn();
    store.onChange("k", listenerA);
    store.onChange("k", listenerB);
    expect(() => store.setString("k", "v")).not.toThrow();
    expect(listenerA).toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalledWith("v");
  });
});

// ─── BroadcastChannel cross-tab parity ───────────────────────────────

describe("createSqliteKVStore — BroadcastChannel cross-tab parity", () => {
  it("setString broadcasts a versioned set message", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab = makeFakeBroadcastChannel();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
      crossTab,
    });
    store.setString("k", "v");
    expect(crossTab.outbound).toEqual([{ v: 1, t: "set", k: "k", val: "v" }]);
  });

  it("remove broadcasts a versioned del message only when the key was present", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab = makeFakeBroadcastChannel();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot({ k: "v" }),
      crossTab,
    });
    store.remove("k");
    expect(crossTab.outbound).toEqual([{ v: 1, t: "del", k: "k" }]);
    // remove on a missing key — no broadcast (no listeners would care
    // since the key wasn't observable across tabs either).
    store.remove("missing");
    expect(crossTab.outbound).toHaveLength(1);
  });

  it("inbound BC set message mutates warm-cache + notifies local listeners", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab = makeFakeBroadcastChannel();
    const boot = makeBoot();
    const store = createSqliteKVStore({
      sqlite: client,
      boot,
      crossTab,
    });
    const listener = vi.fn();
    store.onChange("k", listener);
    crossTab.receive({ v: 1, t: "set", k: "k", val: "from-tab-2" });
    expect(boot.warmCache.get("k")).toBe("from-tab-2");
    expect(listener).toHaveBeenCalledWith("from-tab-2");
  });

  it("inbound BC del message clears warm-cache + notifies local listeners", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab = makeFakeBroadcastChannel();
    const boot = makeBoot({ k: "v" });
    const store = createSqliteKVStore({
      sqlite: client,
      boot,
      crossTab,
    });
    const listener = vi.fn();
    store.onChange("k", listener);
    crossTab.receive({ v: 1, t: "del", k: "k" });
    expect(boot.warmCache.has("k")).toBe(false);
    expect(listener).toHaveBeenCalledWith(null);
  });

  it("inbound BC del on a key the local cache never had is a no-op", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab = makeFakeBroadcastChannel();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
      crossTab,
    });
    const listener = vi.fn();
    store.onChange("missing", listener);
    crossTab.receive({ v: 1, t: "del", k: "missing" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores malformed BC messages (wrong version, missing fields, wrong types)", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab = makeFakeBroadcastChannel();
    const boot = makeBoot({ k: "v" });
    const store = createSqliteKVStore({
      sqlite: client,
      boot,
      crossTab,
    });
    const listener = vi.fn();
    store.onChange("k", listener);
    crossTab.receive(null);
    crossTab.receive("string-payload");
    crossTab.receive({});
    crossTab.receive({ v: 2, t: "set", k: "k", val: "v" });
    crossTab.receive({ v: 1, t: "noop", k: "k" });
    crossTab.receive({ v: 1, t: "set", k: 42 });
    crossTab.receive({ v: 1, t: "set", k: "k" /* missing val */ });
    expect(boot.warmCache.get("k")).toBe("v");
    expect(listener).not.toHaveBeenCalled();
  });

  it("stress: handles many BC messages without losing notifications", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab = makeFakeBroadcastChannel();
    const boot = makeBoot();
    const store = createSqliteKVStore({
      sqlite: client,
      boot,
      crossTab,
    });
    const listener = vi.fn();
    store.onChange("k", listener);
    for (let i = 0; i < 1000; i += 1) {
      crossTab.receive({ v: 1, t: "set", k: "k", val: `tick-${i}` });
    }
    expect(listener).toHaveBeenCalledTimes(1000);
    expect(boot.warmCache.get("k")).toBe("tick-999");
    expect(listener.mock.calls.at(-1)).toEqual(["tick-999"]);
  });

  it("does not broadcast when crossTab is omitted (single-tab embedded use)", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    expect(() => store.setString("k", "v")).not.toThrow();
    expect(() => store.remove("k")).not.toThrow();
  });

  it("postMessage failures (Safari Private mode) do not break setString", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab: BroadcastChannelLike = {
      postMessage() {
        throw new Error("BC unavailable");
      },
      addEventListener() {},
      removeEventListener() {},
    };
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
      crossTab,
    });
    expect(() => store.setString("k", "v")).not.toThrow();
  });

  it("addEventListener failures (Safari Private mode) degrade to single-tab silently", () => {
    const { client } = makeSyncSqliteSpy();
    const crossTab: BroadcastChannelLike = {
      postMessage() {},
      addEventListener() {
        throw new Error("BC unavailable");
      },
      removeEventListener() {},
    };
    expect(() =>
      createSqliteKVStore({
        sqlite: client,
        boot: makeBoot(),
        crossTab,
      }),
    ).not.toThrow();
  });
});

// ─── onChange subscription lifecycle ─────────────────────────────────

describe("createSqliteKVStore — onChange lifecycle", () => {
  it("returns a disposer that stops the listener from firing", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    const listener = vi.fn();
    const dispose = store.onChange("k", listener);
    store.setString("k", "v1");
    dispose();
    store.setString("k", "v2");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("v1");
  });

  it("fans out to multiple listeners on the same key", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    const a = vi.fn();
    const b = vi.fn();
    store.onChange("k", a);
    store.onChange("k", b);
    store.setString("k", "v");
    expect(a).toHaveBeenCalledWith("v");
    expect(b).toHaveBeenCalledWith("v");
  });

  it("disposing twice is safe (idempotent)", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    const dispose = store.onChange("k", vi.fn());
    expect(() => {
      dispose();
      dispose();
    }).not.toThrow();
  });

  it("listeners on key A do not fire on writes to key B", () => {
    const { client } = makeSyncSqliteSpy();
    const store = createSqliteKVStore({
      sqlite: client,
      boot: makeBoot(),
    });
    const listenerA = vi.fn();
    store.onChange("a", listenerA);
    store.setString("b", "v");
    expect(listenerA).not.toHaveBeenCalled();
  });
});
