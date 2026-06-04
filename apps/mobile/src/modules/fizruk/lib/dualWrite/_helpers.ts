/**
 * Shared numeric coercion helpers used by multiple operation-family
 * dispatch files in `lib/dualWrite/`. Not part of the public API —
 * prefixed with `_` to signal internal use.
 */

export function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function toRealOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
