/**
 * Minimal localStorage quota guard.
 * Goal: avoid "silent" data loss on QuotaExceededError and prevent writing very large payloads.
 */

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
    localStorage.setItem(String(key), s);
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
