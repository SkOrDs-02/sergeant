/**
 * Safe localStorage helpers.
 *
 * These helpers swallow storage errors (quota, private mode, disabled storage)
 * so callers do not need to wrap every access in try/catch. Previously eight
 * files in this repo each defined their own `safeParseLS`/`safeParse` helper;
 * this module is the single source of truth.
 */

import { createMemoryKVStore, createWebKVStore } from "@sergeant/shared";
import type { KVStore } from "@sergeant/shared";
import type { z } from "zod";

/**
 * Read a JSON value from localStorage.
 * Returns `fallback` on missing/invalid/unavailable storage.
 */
export function safeReadLS<T = unknown>(
  key: string,
  fallback: T | null = null,
): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw) as T;
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
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
  try {
    const raw = localStorage.getItem(key);
    return raw === null || raw === undefined ? fallback : raw;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON-serialized value to localStorage. Returns true on success.
 */
export function safeWriteLS(key: string, value: unknown): boolean {
  try {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    localStorage.setItem(key, serialized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a key from localStorage. Returns true on success.
 */
export function safeRemoveLS(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
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
  try {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * KVStore adapter for `@sergeant/shared` functions. Wraps
 * `window.localStorage` via {@link createWebKVStore} so cross-tab
 * `onChange` propagation comes for free via the DOM `storage` event.
 *
 * Falls back to an in-memory store in non-browser environments
 * (server-side render, headless test bootstrap before jsdom is
 * installed). The flat `safe*LS` helpers above keep their existing
 * direct-`localStorage` semantics — call them when you only need
 * scalar reads/writes without the `KVStore` contract.
 */
function resolveWebKVStore(): KVStore {
  if (typeof window === "undefined") return createMemoryKVStore();
  try {
    return createWebKVStore(window.localStorage, window);
  } catch {
    return createMemoryKVStore();
  }
}

export const webKVStore: KVStore = resolveWebKVStore();
