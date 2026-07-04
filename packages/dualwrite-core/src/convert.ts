/**
 * Nullable numeric converters for SQLite bind parameters.
 *
 * Extracted verbatim from `apps/web/src/shared/lib/dualWrite/core.ts`
 * (Stage 10 PR #070-dualwrite-refactor). Behaviour is unchanged.
 */

// Helper for nullable int conversion
export function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Helper for nullable real conversion
export function toRealOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
