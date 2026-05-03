/**
 * Parse fizruk workouts from a raw localStorage string.
 *
 * Handles both the flat array format (`[{...}, ...]`) and the wrapped
 * format (`{ workouts: [...] }`). Returns an empty array on any failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFizrukWorkouts(raw: string | null): Record<string, any>[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
    if (p && Array.isArray(p.workouts)) return p.workouts;
  } catch {
    /* malformed — return empty */
  }
  return [];
}
