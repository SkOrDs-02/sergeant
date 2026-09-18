/**
 * Recently-opened modules tracker.
 *
 * `prefetchCriticalModules` previously fired on idle in a hard-coded
 * priority order (`finyk → routine → fizruk → nutrition`). For users
 * who never touch a given module, that paid the bandwidth/parse cost
 * of three modules they will never reach — particularly painful on
 * 3G or save-data sessions (see `connectionGate.ts`).
 *
 * This module records the timestamp of each module open in
 * localStorage and exposes a priority-ordered list of modules opened
 * within the last `MAX_AGE_MS` window. `useRoutePrefetch` reads from
 * here to decide what to prefetch on idle.
 *
 * Failure modes (private mode, quota, no `localStorage`) collapse
 * to an empty list — `prefetchCriticalModules` will then fall back
 * to its hard-coded priority. Recent-modules tracking is best-effort
 * acceleration, not a correctness contract.
 *
 * Storage shape (`localStorage["sergeant.recentModules.v1"]`):
 *
 *   [
 *     { "id": "finyk", "ts": 1746302400000 },
 *     { "id": "routine", "ts": 1746128400000 }
 *   ]
 *
 * — JSON-serialised, sorted DESC by `ts`, deduplicated by `id`,
 * pruned of entries older than 7 days, capped at 4 entries
 * (one per known module).
 */

import { safeReadLS, safeWriteLS } from "../../shared/lib/storage/storage";

export const RECENT_MODULES_KEY = "sergeant.recentModules.v1";
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 4;

export type RecentModuleId = "finyk" | "fizruk" | "routine" | "nutrition";

const VALID_IDS: ReadonlySet<RecentModuleId> = new Set([
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
]);

interface Entry {
  id: RecentModuleId;
  ts: number;
}

function isEntry(value: unknown): value is Entry {
  if (value == null || typeof value !== "object") return false;
  const v = value as { id?: unknown; ts?: unknown };
  if (typeof v.ts !== "number" || !Number.isFinite(v.ts)) return false;
  if (typeof v.id !== "string") return false;
  return VALID_IDS.has(v.id as RecentModuleId);
}

function readEntries(now: number): Entry[] {
  const raw = safeReadLS<unknown[]>(RECENT_MODULES_KEY, []);
  if (!Array.isArray(raw)) return [];
  const cutoff = now - MAX_AGE_MS;
  const out: Entry[] = [];
  const seen = new Set<RecentModuleId>();
  for (const item of raw) {
    if (!isEntry(item)) continue;
    if (item.ts < cutoff) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, MAX_ENTRIES);
}

/**
 * Record a module open. Called from {@link useHubNavigation}'s
 * `openModule`. Writes the latest timestamp for `id`, drops
 * entries older than 7 days, dedup-es by id, caps at 4 entries.
 *
 * No-op if `id` is not a known module (`finyk`/`fizruk`/`routine`/`nutrition`).
 */
export function recordModuleOpen(
  id: string | null | undefined,
  now: number = Date.now(),
): void {
  if (id == null) return;
  if (!VALID_IDS.has(id as RecentModuleId)) return;
  const entries = readEntries(now);
  const filtered = entries.filter((e) => e.id !== id);
  filtered.unshift({ id: id as RecentModuleId, ts: now });
  safeWriteLS(RECENT_MODULES_KEY, filtered.slice(0, MAX_ENTRIES));
}

/**
 * Get module ids opened within the last 7 days, sorted by recency
 * (most recent first). Returns `[]` when nothing recorded yet,
 * storage unavailable, or all entries are stale.
 */
export function getRecentModules(now: number = Date.now()): RecentModuleId[] {
  return readEntries(now).map((e) => e.id);
}
