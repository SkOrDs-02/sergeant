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

// ─── Scoring LRU cache ────────────────────────────────────────────────────────
// `performSearch` runs on every debounced keystroke. Even with the parse cache
// above, `scoreMatch` + array allocation still fires for every candidate on
// every call. An LRU keyed by `query+snapshot` (where snapshot is a cheap
// comma-joined string of the raw storage values for all scored sources) lets
// us return the full result set instantly when the user tabs back to the same
// query or hits the same prefix again within the same session.
// Capacity is 16 — enough to cover the ~5 distinct query prefixes a user
// tries before settling on a result, with room for a couple of re-visits.

const SCORE_LRU_MAX = 16;

class ScoreLru {
  private readonly map = new Map<string, { hits: unknown; inserted: number }>();
  private counter = 0;

  get(key: string): unknown | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Bump recency so eviction is truly least-recently-USED, not FIFO.
    entry.inserted = ++this.counter;
    this.map.set(key, entry);
    return entry.hits;
  }

  set(key: string, hits: unknown): void {
    if (this.map.size >= SCORE_LRU_MAX && !this.map.has(key)) {
      // Evict the oldest entry (smallest `inserted` counter).
      let oldestKey: string | undefined;
      let oldestInserted = Infinity;
      for (const [k, v] of this.map) {
        if (v.inserted < oldestInserted) {
          oldestInserted = v.inserted;
          oldestKey = k;
        }
      }
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
    this.map.set(key, { hits, inserted: ++this.counter });
  }
}

export const scoreLru = new ScoreLru();

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
