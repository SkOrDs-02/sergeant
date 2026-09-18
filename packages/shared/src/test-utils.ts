import type { KVStore } from "./storage/kv";

/**
 * In-memory KV store suitable for vitest/jest suites. Not thread-safe;
 * callers are expected to scope a fresh instance per test. `onChange`
 * notifications fire synchronously after `setString` / `remove`.
 *
 * This is intentionally exported from `@sergeant/shared/test-utils`
 * instead of the production runtime barrel.
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
        /* swallow - listener errors must not break writers */
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
