/**
 * Safe localStorage helpers.
 *
 * These helpers swallow storage errors (quota, private mode, disabled storage)
 * so callers do not need to wrap every access in try/catch. Previously eight
 * files in this repo each defined their own `safeParseLS`/`safeParse` helper;
 * this module is the single source of truth.
 *
 * Implementation: every read/write is routed through {@link webKVStore} (a
 * `KVStore` adapter from `@sergeant/shared` that wraps `window.localStorage`).
 * No direct `localStorage.*` access remains in this file — `eslint.config.js`
 * enforces that with `sergeant-design/no-raw-local-storage` (PR #054 final,
 * `localstorage-allowlist-budget.json` production: 0).
 */

import { createMemoryKVStore, createWebKVStore } from "@sergeant/shared";
import type {
  KVStore,
  StorageEventTargetLike,
  StorageLike,
  Unsubscribe,
} from "@sergeant/shared";
import type { z } from "zod";

/**
 * KVStore adapter for `@sergeant/shared` functions. Wraps
 * `window.localStorage` via {@link createWebKVStore} so cross-tab
 * `onChange` propagation comes for free via the DOM `storage` event.
 *
 * Resolution is lazy on every method call so tests that polyfill
 * `globalThis.localStorage` inside `beforeAll`/`beforeEach` (after
 * this module has already been imported) still hit the polyfill, and
 * the same applies to apps/web's vitest suite which runs under
 * `environment: "node"` and only attaches `localStorage` once a
 * specific suite needs it. Falls back to a single shared in-memory
 * store when no `globalThis.localStorage` is available so writes
 * survive across calls within the same process.
 */
const memoryFallback = createMemoryKVStore();

function resolveStore(): KVStore {
  let storage: StorageLike | undefined;
  try {
    const candidate = (globalThis as { localStorage?: unknown }).localStorage;
    storage = (candidate as StorageLike | undefined) ?? undefined;
  } catch {
    storage = undefined;
  }
  if (!storage) return memoryFallback;

  let eventTarget: StorageEventTargetLike | undefined;
  try {
    const candidate = (globalThis as { window?: unknown }).window;
    eventTarget =
      (candidate as StorageEventTargetLike | undefined) ?? undefined;
  } catch {
    eventTarget = undefined;
  }

  try {
    return createWebKVStore(storage, eventTarget);
  } catch {
    return memoryFallback;
  }
}

export const webKVStore: KVStore = {
  getString(key: string): string | null {
    return resolveStore().getString(key);
  },
  setString(key: string, value: string): void {
    resolveStore().setString(key, value);
  },
  remove(key: string): void {
    resolveStore().remove(key);
  },
  listKeys(): string[] {
    return resolveStore().listKeys();
  },
  onChange(key: string, listener: (next: string | null) => void): Unsubscribe {
    return resolveStore().onChange(key, listener);
  },
};

/**
 * Read a JSON value from localStorage.
 * Returns `fallback` on missing/invalid/unavailable storage.
 */
export function safeReadLS<T = unknown>(
  key: string,
  fallback: T | null = null,
): T | null {
  const raw = webKVStore.getString(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Read + validate a JSON value from localStorage against a Zod schema.
 *
 * Use this for any structured payload that crosses the persistence boundary:
 * `safeReadLS` returns `T | null` based on a static cast, so corrupted blobs
 * (older app versions, manual edits, partially migrated rows) become silent
 * type lies that surface deep in render trees — usually as
 * `Cannot read properties of undefined` inside a memoised selector. Validating
 * up front lets us fall back to a known-good default at the read site, where
 * the caller already has the typed shape it needs.
 *
 * Failure cases (missing key, malformed JSON, schema mismatch, storage thrown)
 * all collapse to `fallback`; the helper never throws.
 *
 * @example
 *   const settings = safeReadLSValidated(
 *     STORAGE_KEYS.FIZRUK_REST_SETTINGS,
 *     RestSettingsSchema,
 *     REST_DEFAULTS,
 *   );
 */
export function safeReadLSValidated<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  const raw = safeReadLS<unknown>(key);
  if (raw === null) return fallback;
  const result = schema.safeParse(raw);
  return result.success ? result.data : fallback;
}

/**
 * Read the raw string value from localStorage without JSON parsing.
 */
export function safeReadStringLS(
  key: string,
  fallback: string | null = null,
): string | null {
  const raw = webKVStore.getString(key);
  return raw === null ? fallback : raw;
}

/**
 * Write a JSON-serialized value to localStorage. Returns `true` once the
 * value serialized; the underlying write is best-effort and silently
 * swallows quota / private-mode errors via `webKVStore`. Returns `false`
 * only when the value cannot be serialized (e.g. cyclic reference).
 */
export function safeWriteLS(key: string, value: unknown): boolean {
  let serialized: string;
  try {
    serialized = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return false;
  }
  webKVStore.setString(key, serialized);
  return true;
}

/**
 * Remove a key from localStorage. Always returns `true` — the underlying
 * remove is best-effort and silently swallows errors via `webKVStore`.
 */
export function safeRemoveLS(key: string): boolean {
  webKVStore.remove(key);
  return true;
}

/**
 * Enumerate every key currently in localStorage.
 *
 * Returns an empty array on missing/unavailable storage (private-mode
 * Safari, disabled storage, throwing access). Callers that need to walk
 * keys to expire stale entries (e.g. day-bucketed notification flags)
 * should use this instead of touching `localStorage.length` /
 * `localStorage.key(i)` directly — both throw the same way `getItem`
 * does, and both trip `sergeant-design/no-raw-local-storage`.
 */
export function safeListLSKeys(): string[] {
  return webKVStore.listKeys();
}
