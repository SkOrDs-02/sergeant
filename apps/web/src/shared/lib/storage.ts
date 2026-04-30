/**
 * Safe localStorage helpers.
 *
 * These helpers swallow storage errors (quota, private mode, disabled storage)
 * so callers do not need to wrap every access in try/catch. Previously eight
 * files in this repo each defined their own `safeParseLS`/`safeParse` helper;
 * this module is the single source of truth.
 */

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
 * KVStore adapter for @sergeant/shared functions.
 * Allows shared pure functions to work with web localStorage.
 */
import type { KVStore } from "@sergeant/shared";

export const webKVStore: KVStore = {
  getString: safeReadStringLS,
  setString: (k, v) => {
    safeWriteLS(k, v);
  },
  remove: (k) => {
    safeRemoveLS(k);
  },
};
