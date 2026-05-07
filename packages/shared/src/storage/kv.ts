/**
 * Unified KVStore — DOM-free key/value store contract used across web,
 * mobile, server, and shared packages.
 *
 * Pure helpers in `@sergeant/shared/lib/*` that need to read or write
 * persisted flags take an instance of this interface instead of
 * reaching into `localStorage` / `MMKV` directly. Platform adapters
 * provide the concrete implementation:
 *
 *  - **Web:** `createWebKVStore(localStorage, window)` — wraps the DOM
 *    `Storage` API; cross-tab `onChange` is wired via the `storage`
 *    event. Same-tab writes do not fire `onChange` (matches the DOM
 *    contract); explicit notification is handled by the cloud-sync
 *    layer (see PR #008).
 *  - **Mobile:** `createMmkvKVStore(() => activeMmkv)` — wraps a
 *    `react-native-mmkv` instance via a thunk so the encrypted
 *    instance swap on bootstrap (`bootstrapEncryptedStorage`) is
 *    transparent to callers.
 *  - **Memory:** `createMemoryKVStore()` lives in
 *    `@sergeant/shared/test-utils` for vitest/jest suites.
 *
 * All methods must be safe — implementations are expected to swallow
 * errors (quota exceeded, storage disabled, JSON parse) and return
 * `null` / no-op rather than throwing. Helpers assume they can call
 * these methods freely without try/catch.
 */

/** Disposes a subscription registered via {@link KVStore.onChange}. */
export type Unsubscribe = () => void;

export interface KVStore {
  /** Read the raw string stored under `key`. Returns `null` if missing. */
  getString(key: string): string | null;
  /** Overwrite the string value under `key`. */
  setString(key: string, value: string): void;
  /** Delete the value under `key`. No-op if missing. */
  remove(key: string): void;
  /**
   * Enumerate every key currently stored. Returns `[]` when the
   * underlying implementation cannot enumerate (e.g. a partial
   * `StorageLike` mock without `length`/`key`, or a MMKV instance
   * without `getAllKeys`) or when access throws.
   */
  listKeys(): string[];
  /**
   * Subscribe to changes at `key`. Listener receives the new value as a
   * string, or `null` if the slot was deleted. Returns a disposer.
   *
   * Adapter notes:
   *  - Memory test store fires synchronously on `setString` / `remove`.
   *  - Web adapter fires on cross-tab writes via the DOM `storage`
   *    event. Same-tab writes do **not** fire (DOM contract); pair
   *    with explicit notification if you need intra-tab updates.
   *  - MMKV adapter fires on every write (single-process), via
   *    `addOnValueChangedListener`.
   */
  onChange(key: string, listener: (next: string | null) => void): Unsubscribe;
}

/**
 * Subset of the DOM `Storage` API consumed by {@link createWebKVStore}.
 * Defined structurally so the factory does not pull DOM lib types into
 * `@sergeant/shared` (which is also consumed by mobile and server).
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Optional — enables {@link KVStore.listKeys} when present. The DOM
   * `Storage` interface always exposes both, but mocks used in unit
   * tests may omit them; the adapter falls back to `[]` in that case.
   */
  readonly length?: number;
  key?(index: number): string | null;
}

/**
 * Subset of the DOM `EventTarget`/`Window` API consumed by
 * {@link createWebKVStore} for cross-tab `onChange` propagation.
 *
 * The DOM `storage` event delivers `{ key, newValue }` (and `key=null`
 * when `clear()` was invoked).
 */
export interface StorageEventLike {
  key: string | null;
  newValue: string | null;
}
export interface StorageEventTargetLike {
  addEventListener(
    type: "storage",
    listener: (event: StorageEventLike) => void,
  ): void;
  removeEventListener(
    type: "storage",
    listener: (event: StorageEventLike) => void,
  ): void;
}

/**
 * Web KV adapter. Wraps a `Storage`-compatible object (typically
 * `window.localStorage`) and, optionally, an `EventTarget` for
 * cross-tab `onChange` propagation (typically `window`).
 *
 * All read/write methods swallow errors (quota exceeded, private mode,
 * disabled storage) and return `null` / no-op.
 */
export function createWebKVStore(
  storage: StorageLike,
  eventTarget?: StorageEventTargetLike,
): KVStore {
  return {
    getString(key) {
      try {
        const value = storage.getItem(key);
        return value === null || value === undefined ? null : value;
      } catch {
        return null;
      }
    },
    setString(key, value) {
      try {
        storage.setItem(key, value);
      } catch {
        /* quota exceeded, private mode, etc. */
      }
    },
    remove(key) {
      try {
        storage.removeItem(key);
      } catch {
        /* */
      }
    },
    listKeys() {
      try {
        if (
          typeof storage.length !== "number" ||
          typeof storage.key !== "function"
        ) {
          return [];
        }
        const out: string[] = [];
        for (let i = 0; i < storage.length; i += 1) {
          const k = storage.key(i);
          if (k !== null && k !== undefined) out.push(k);
        }
        return out;
      } catch {
        return [];
      }
    },
    onChange(key, listener) {
      if (!eventTarget) return () => {};
      const handler = (event: StorageEventLike): void => {
        if (event.key === key) {
          listener(event.newValue);
        } else if (event.key === null) {
          // `localStorage.clear()` from another tab fires with key=null.
          listener(null);
        }
      };
      try {
        eventTarget.addEventListener("storage", handler);
      } catch {
        return () => {};
      }
      return () => {
        try {
          eventTarget.removeEventListener("storage", handler);
        } catch {
          /* */
        }
      };
    },
  };
}

/**
 * Subset of the `react-native-mmkv` API consumed by
 * {@link createMmkvKVStore}. Defined structurally so the factory does
 * not pull `react-native-mmkv` into `@sergeant/shared` as a dependency.
 */
export interface MmkvLike {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  addOnValueChangedListener(listener: (changedKey: string) => void): {
    remove: () => void;
  };
  /**
   * Optional — enables {@link KVStore.listKeys}. The real
   * `react-native-mmkv` instance always exposes it, but unit-test
   * mocks may omit it; the adapter falls back to `[]` in that case.
   */
  getAllKeys?(): string[];
}

/**
 * Mobile KV adapter. Wraps an MMKV instance, or a thunk that returns
 * the currently active instance (used by `apps/mobile/src/lib/storage`
 * to keep working through the encrypted-bootstrap swap).
 *
 * The MMKV change listener is global to the instance; this adapter
 * filters down to the requested key and re-reads the latest value
 * (MMKV's listener payload only carries the key, not the new value).
 */
export function createMmkvKVStore(
  mmkvOrProvider: MmkvLike | (() => MmkvLike),
): KVStore {
  const get: () => MmkvLike =
    typeof mmkvOrProvider === "function"
      ? (mmkvOrProvider as () => MmkvLike)
      : () => mmkvOrProvider;
  return {
    getString(key) {
      try {
        const value = get().getString(key);
        return value === undefined ? null : value;
      } catch {
        return null;
      }
    },
    setString(key, value) {
      try {
        get().set(key, value);
      } catch {
        /* */
      }
    },
    remove(key) {
      try {
        get().delete(key);
      } catch {
        /* */
      }
    },
    listKeys() {
      try {
        const m = get();
        if (typeof m.getAllKeys !== "function") return [];
        const keys = m.getAllKeys();
        return Array.isArray(keys) ? keys : [];
      } catch {
        return [];
      }
    },
    onChange(key, listener) {
      let sub: { remove: () => void } | null = null;
      try {
        sub = get().addOnValueChangedListener((changedKey) => {
          if (changedKey !== key) return;
          let next: string | null;
          try {
            const value = get().getString(key);
            next = value === undefined ? null : value;
          } catch {
            next = null;
          }
          try {
            listener(next);
          } catch {
            /* */
          }
        });
      } catch {
        return () => {};
      }
      return () => {
        try {
          sub?.remove();
        } catch {
          /* */
        }
      };
    },
  };
}

// ─── createSqliteKVStore ─────────────────────────────────────────────
//
// Stage 9 / PR #061 of `docs/planning/storage-roadmap.md`. Backs the
// SQLite swap of the `webKVStore` primitive (and its MMKV mobile
// counterpart) onto the per-device `kv_store` table introduced in
// PR #060. Sync read/write contract preserved by holding a warm
// `Map<string, string>` populated at boot, with fire-and-forget
// async write-back to SQLite for durability and a `BroadcastChannel`
// hop for cross-tab parity.
//
// The factory is platform-agnostic — apps/web wires it up against the
// `oo1.DB`-backed `SqliteKVStoreClient` from `apps/web/src/core/db`,
// and apps/mobile against the `expo-sqlite`-backed counterpart. The
// `KVStore` contract itself is unchanged so consumers do not need to
// know which backend they hold.
//
// Why a separate Boot object instead of an internal `loaded` flag:
// PR #062 owns the boot wiring (`apps/web/src/core/db/kvStoreBoot.ts`)
// and must be able to flip `loaded = true` after the warm-cache is
// populated, without re-creating the adapter. Sharing a mutable boot
// reference keeps the wiring explicit and testable.

/**
 * Snapshot of the in-memory boot state that {@link createSqliteKVStore}
 * reads from. Mutated by the bootstrap module (PR #062) — `loaded`
 * flips to `true` once SQLite init has populated `warmCache` from
 * the `kv_store` table.
 */
export interface SqliteKVStoreBoot {
  /**
   * Hot key/value snapshot of the `kv_store` table, populated at boot
   * from a single `SELECT key, value FROM kv_store` scan. Mutated
   * in-place by the adapter on every write so reads stay sync. The
   * map is shared with the bootstrap module by reference so cross-tab
   * BroadcastChannel writes land in the same instance.
   */
  readonly warmCache: Map<string, string>;
  /**
   * Set to `true` once the bootstrap module has populated `warmCache`
   * and any one-time LS→`kv_store` migration has completed (see
   * PR #062). Pre-load reads/writes throw {@link KVStoreNotReadyError}
   * — callers must `await` the bootstrap promise before mounting any
   * UI that reads from the store.
   */
  loaded: boolean;
}

/**
 * Sub-set of a `kv_store`-bound SQLite client used by
 * {@link createSqliteKVStore} for fire-and-forget write-back. Defined
 * structurally so `@sergeant/shared` does not pull `drizzle-orm` or
 * `better-sqlite3` into its dep graph.
 *
 * Each method may return `void` (sync wasm-driver) or a `Promise<void>`
 * (async expo-sqlite driver). The adapter swallows rejections via
 * {@link SqliteKVStoreOptions.onWriteError}.
 */
export interface SqliteKVStoreClient {
  /**
   * Upsert a single row keyed by `key`. Implementations must use
   * `INSERT … ON CONFLICT(key) DO UPDATE SET value=…, updated_at=…`
   * (or the Drizzle equivalent) so concurrent writes from other tabs
   * don't trip a unique-constraint violation.
   */
  upsert(row: {
    readonly key: string;
    readonly value: string;
    readonly updatedAt: number;
  }): void | Promise<void>;
  /**
   * Delete the row keyed by `key`. No-op if missing.
   */
  remove(key: string): void | Promise<void>;
}

/**
 * Sub-set of the DOM `BroadcastChannel` API consumed by
 * {@link createSqliteKVStore} for cross-tab `onChange` propagation.
 * Defined structurally so the factory does not pull DOM lib types into
 * `@sergeant/shared`.
 */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  /** Optional — best-effort cleanup. Not invoked by the adapter. */
  close?(): void;
}

/**
 * Thrown by {@link createSqliteKVStore} when a caller invokes
 * `getString` / `setString` / `remove` before the bootstrap module
 * has populated the warm-cache. App entry points must `await` the
 * bootstrap promise before mounting UI that reads from the store.
 *
 * `listKeys` and `onChange` do NOT throw — `listKeys` returns `[]`
 * pre-load (so e.g. lint rules that enumerate keys still work in SSR
 * and tests) and `onChange` registers the listener so it fires once
 * the warm-cache loads and a write lands.
 */
export class KVStoreNotReadyError extends Error {
  constructor(public readonly attemptedKey: string) {
    super(
      `KVStore not ready: cannot access key "${attemptedKey}" before warm-cache load. ` +
        "Await the bootstrapKvStore() promise before mounting UI that reads from the store.",
    );
    this.name = "KVStoreNotReadyError";
  }
}

/**
 * Options for {@link createSqliteKVStore}. The `boot` reference is
 * shared with the bootstrap module by-reference so its `loaded` flag
 * flips atomically once the warm-cache scan completes.
 */
export interface SqliteKVStoreOptions {
  readonly sqlite: SqliteKVStoreClient;
  readonly boot: SqliteKVStoreBoot;
  /**
   * Optional cross-tab signal channel. Web typically supplies
   * `new BroadcastChannel("kv-store")`; mobile leaves it undefined
   * (single-process — no other tabs).
   */
  readonly crossTab?: BroadcastChannelLike;
  /**
   * Optional hook for the fire-and-forget async write-back. Invoked
   * with the failing op + key + error when the SQLite write throws
   * (sync) or returns a rejected promise. Default behaviour: swallow.
   * Sentry / op-log retry-queue wiring lives at the call site.
   */
  readonly onWriteError?: (
    op: "upsert" | "remove",
    key: string,
    error: unknown,
  ) => void;
  /**
   * Wall-clock source for `updated_at`. Defaulted to `Date.now()`;
   * tests inject a fake clock so the BroadcastChannel echo + LWW
   * comparisons stay deterministic.
   */
  readonly now?: () => number;
}

/**
 * BroadcastChannel payload shape. Versioned at `v: 1` so a future
 * payload upgrade (e.g. batched writes) can be rolled out without
 * confusing tabs that are still on the old protocol.
 */
interface SqliteKvBcMessage {
  readonly v: 1;
  readonly t: "set" | "del";
  readonly k: string;
  readonly val?: string;
}

function isBcMessage(payload: unknown): payload is SqliteKvBcMessage {
  if (typeof payload !== "object" || payload === null) return false;
  const m = payload as {
    v?: unknown;
    t?: unknown;
    k?: unknown;
    val?: unknown;
  };
  if (m.v !== 1) return false;
  if (m.t !== "set" && m.t !== "del") return false;
  if (typeof m.k !== "string") return false;
  if (m.t === "set" && typeof m.val !== "string") return false;
  return true;
}

/**
 * Build a {@link KVStore} backed by the SQLite `kv_store` table with
 * a warm in-memory cache for sync reads. See module-level comment for
 * design rationale.
 *
 * Lifecycle:
 *  1. App start → call {@link createSqliteKVStore} with
 *     `boot.loaded = false`. The factory subscribes to BroadcastChannel
 *     and is wired into `resolveStore()`, but every read/write throws
 *     {@link KVStoreNotReadyError} until step 3.
 *  2. Bootstrap (`bootstrapKvStore()` from PR #062) populates
 *     `boot.warmCache` from a `SELECT key, value FROM kv_store` scan
 *     and runs the one-time LS→`kv_store` migration if needed.
 *  3. Bootstrap flips `boot.loaded = true`. From this point reads are
 *     sync (warm-cache hits) and writes update the cache + post a
 *     fire-and-forget upsert to SQLite + broadcast a `kv-store` BC
 *     message.
 */
export function createSqliteKVStore(opts: SqliteKVStoreOptions): KVStore {
  const {
    sqlite,
    boot,
    crossTab,
    onWriteError,
    now = (): number => Date.now(),
  } = opts;
  const subs = new Map<string, Set<(next: string | null) => void>>();

  function notify(key: string, next: string | null): void {
    const listeners = subs.get(key);
    if (!listeners) return;
    for (const listener of Array.from(listeners)) {
      try {
        listener(next);
      } catch {
        /* swallow — listener errors must not break writers */
      }
    }
  }

  function reportWriteError(
    op: "upsert" | "remove",
    key: string,
    err: unknown,
  ): void {
    if (!onWriteError) return;
    try {
      onWriteError(op, key, err);
    } catch {
      /* even the error reporter must not blow up the caller */
    }
  }

  function fireWrite(
    result: void | Promise<void>,
    op: "upsert" | "remove",
    key: string,
  ): void {
    if (!result || typeof (result as { then?: unknown }).then !== "function") {
      return;
    }
    (result as Promise<void>).then(
      () => {},
      (err) => {
        reportWriteError(op, key, err);
      },
    );
  }

  if (crossTab) {
    const bcHandler = (event: { data: unknown }): void => {
      if (!isBcMessage(event.data)) return;
      const msg = event.data;
      if (msg.t === "set") {
        boot.warmCache.set(msg.k, msg.val as string);
        notify(msg.k, msg.val as string);
      } else {
        const had = boot.warmCache.delete(msg.k);
        if (had) notify(msg.k, null);
      }
    };
    try {
      crossTab.addEventListener("message", bcHandler);
    } catch {
      /* Safari Private mode may throw — degrade to single-tab. */
    }
  }

  return {
    getString(key) {
      if (!boot.loaded) {
        throw new KVStoreNotReadyError(key);
      }
      const value = boot.warmCache.get(key);
      return value === undefined ? null : value;
    },
    setString(key, value) {
      if (!boot.loaded) {
        throw new KVStoreNotReadyError(key);
      }
      boot.warmCache.set(key, value);
      let result: void | Promise<void>;
      try {
        result = sqlite.upsert({ key, value, updatedAt: now() });
      } catch (err) {
        reportWriteError("upsert", key, err);
        result = undefined;
      }
      fireWrite(result, "upsert", key);
      try {
        crossTab?.postMessage({
          v: 1,
          t: "set",
          k: key,
          val: value,
        } satisfies SqliteKvBcMessage);
      } catch {
        /* */
      }
      notify(key, value);
    },
    remove(key) {
      if (!boot.loaded) {
        throw new KVStoreNotReadyError(key);
      }
      const had = boot.warmCache.delete(key);
      let result: void | Promise<void>;
      try {
        result = sqlite.remove(key);
      } catch (err) {
        reportWriteError("remove", key, err);
        result = undefined;
      }
      fireWrite(result, "remove", key);
      if (had) {
        try {
          crossTab?.postMessage({
            v: 1,
            t: "del",
            k: key,
          } satisfies SqliteKvBcMessage);
        } catch {
          /* */
        }
        notify(key, null);
      }
    },
    listKeys() {
      if (!boot.loaded) return [];
      return Array.from(boot.warmCache.keys());
    },
    onChange(key, listener) {
      let set = subs.get(key);
      if (!set) {
        set = new Set();
        subs.set(key, set);
      }
      set.add(listener);
      return () => {
        const current = subs.get(key);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) subs.delete(key);
      };
    },
  };
}

/**
 * Convenience: parse a JSON string from `store` under `key`. Returns
 * `null` when the slot is missing or the payload cannot be parsed.
 */
export function readJSON<T = unknown>(store: KVStore, key: string): T | null {
  const raw = store.getString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Convenience: serialize `value` to JSON and write it under `key`.
 * Silently no-ops when serialization fails (e.g. cyclic references).
 */
export function writeJSON(store: KVStore, key: string, value: unknown): void {
  try {
    store.setString(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}
