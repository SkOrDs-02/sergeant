import { safeReadStringLS } from "@shared/lib/storage/storage";

// Module-level cache for parsed localStorage payloads. HubSearch runs
// `performSearch` on every debounced keystroke (2+ chars), which means
// without caching we would call `JSON.parse` on the entire Finyk tx
// cache (potentially several MB) every 120 ms while the user types.
// We cache the parsed value keyed by both the localStorage key AND the
// raw string; if either is stale we reparse. Different parsers on the
// same key (e.g. Fizruk workouts with their two variants) are tracked
// independently via a `parserId` slot.
const parseCache = new Map<
  string,
  { raw: string | null; parserId: string; value: unknown }
>();

export function cachedParse<T>(
  cacheKey: string,
  parserId: string,
  raw: string | null,
  parse: (raw: string) => T,
  fallback: T,
): T {
  const hit = parseCache.get(cacheKey);
  if (hit && hit.parserId === parserId && hit.raw === raw) {
    return hit.value as T;
  }
  let value: T = fallback;
  if (raw) {
    try {
      value = parse(raw);
    } catch {
      value = fallback;
    }
  }
  parseCache.set(cacheKey, { raw, parserId, value });
  return value;
}

export function safeParseLS<T>(key: string, fallback: T): T {
  const raw = safeReadStringLS(key, null);
  return cachedParse<T>(
    key,
    "json",
    raw,
    (r) => (JSON.parse(r) as T) ?? fallback,
    fallback,
  );
}

// Fizruk payloads are read as loose records (parent loops access
// `w.items`, `w.startedAt`, `e.muscles`, ...) so return them as
// `Record<string, any>[]` to match the existing call-sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseRecord = Record<string, any>;

export function parseFizrukWorkouts(raw: string | null): LooseRecord[] {
  return cachedParse<LooseRecord[]>(
    "fizruk_workouts_v1",
    "fizrukWorkouts",
    raw,
    (r) => {
      const p = JSON.parse(r);
      if (Array.isArray(p)) return p as LooseRecord[];
      if (p && Array.isArray(p.workouts)) return p.workouts as LooseRecord[];
      return [];
    },
    [],
  );
}

export function parseFizrukCustomExercises(raw: string | null): LooseRecord[] {
  return cachedParse<LooseRecord[]>(
    "fizruk_custom_exercises_v1",
    "fizrukExercises",
    raw,
    (r) => {
      const p = JSON.parse(r);
      if (Array.isArray(p)) return p as LooseRecord[];
      if (p && Array.isArray(p.exercises)) return p.exercises as LooseRecord[];
      return [];
    },
    [],
  );
}
