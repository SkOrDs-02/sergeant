/**
 * Structural equality via `JSON.stringify` — the no-op guard shared by the
 * Fizruk cache-projection hooks (`useWellbeing`, `usePlanTemplate`): if a
 * patch round-trips to the same JSON as the current value, the in-memory
 * state stays referentially identical and the dual-write trigger is skipped.
 * Cheap enough for the small rows these hooks compare; returns `false` on any
 * cyclic or non-serialisable input.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
