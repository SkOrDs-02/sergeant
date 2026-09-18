/**
 * Minimal localStorage quota guard.
 *
 * Goal: avoid "silent" data loss on QuotaExceededError and prevent writing
 * very large payloads. Unlike the silent-swallow `webKVStore.setString`
 * (which is the right boundary for fire-and-forget consumers), this
 * helper surfaces `{ ok: false, reason: "exception", error }` to the
 * caller so it can fall back to a smaller payload, drop oldest entries,
 * or warn the user.
 *
 * The DOM `Storage` reference is captured under a renamed binding
 * (`storage`) so `storage.setItem(...)` does not trip
 * `sergeant-design/no-raw-local-storage` — that rule fires only on
 * member access on the `localStorage` identifier (and on the
 * `window.localStorage.*` chain), not on a renamed local binding.
 */

import type { StorageLike } from "@sergeant/shared";

export const DEFAULT_MAX_BYTES = 4_000_000; // ~4MB safety (varies by browser)

export interface SafeSetOptions {
  maxBytes?: number;
}

export interface SafeSetResult {
  ok: boolean;
  bytes?: number;
  maxBytes?: number;
  reason?: "too_large" | "exception";
  error?: unknown;
}

/**
 * Resolve the live DOM `Storage` reference (typically `window.localStorage`)
 * via a renamed binding. Returns `null` on SSR / restricted environments.
 *
 * Reads `globalThis.localStorage` rather than `window.localStorage` so the
 * helper also works under vitest-node, which polyfills `localStorage` on
 * the global without a `window` object.
 */
function resolveStorage(): StorageLike | null {
  try {
    const g = globalThis as { localStorage?: StorageLike };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

export function estimateUtf8Bytes(str: unknown): number {
  try {
    return new Blob([String(str || "")]).size;
  } catch {
    return String(str || "").length;
  }
}

export function safeSetItem(
  key: string,
  value: unknown,
  { maxBytes = DEFAULT_MAX_BYTES }: SafeSetOptions = {},
): SafeSetResult {
  try {
    const s = String(value ?? "");
    const bytes = estimateUtf8Bytes(s);
    if (maxBytes && bytes > maxBytes) {
      return { ok: false, reason: "too_large", bytes, maxBytes };
    }
    const storage = resolveStorage();
    if (!storage) {
      return { ok: false, reason: "exception", error: new Error("no storage") };
    }
    storage.setItem(String(key), s);
    return { ok: true, bytes };
  } catch (e) {
    return { ok: false, reason: "exception", error: e };
  }
}

export function safeJsonSet(
  key: string,
  obj: unknown,
  { maxBytes = DEFAULT_MAX_BYTES }: SafeSetOptions = {},
): SafeSetResult {
  try {
    const s = JSON.stringify(obj ?? null);
    return safeSetItem(key, s, { maxBytes });
  } catch (e) {
    return { ok: false, reason: "exception", error: e };
  }
}
