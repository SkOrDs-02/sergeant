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
 *  - **Memory:** `createMemoryKVStore()` — for vitest/jest suites.
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
   *  - Memory store fires synchronously on `setString` / `remove`.
   *  - Web adapter fires on cross-tab writes via the DOM `storage`
   *    event. Same-tab writes do **not** fire (DOM contract); pair
   *    with explicit notification if you need intra-tab updates.
   *  - MMKV adapter fires on every write (single-process), via
   *    `addOnValueChangedListener`.
   */
  onChange(key: string, listener: (next: string | null) => void): Unsubscribe;
}

/**
 * In-memory KV store suitable for vitest/jest suites. Not thread-safe;
 * callers are expected to scope a fresh instance per test. `onChange`
 * notifications fire synchronously after `setString` / `remove`.
 */
export function createMemoryKVStore(
  initial: Record<string, string> = {},
): KVStore {
  const map = new Map<string, string>(Object.entries(initial));
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

  return {
    getString(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    setString(key, value) {
      map.set(key, value);
      notify(key, value);
    },
    remove(key) {
      if (map.delete(key)) notify(key, null);
    },
    listKeys() {
      return Array.from(map.keys());
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
