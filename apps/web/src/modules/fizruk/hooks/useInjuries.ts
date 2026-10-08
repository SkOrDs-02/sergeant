import { useCallback, useMemo } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import { activeInjurySites, type InjuryMark } from "@sergeant/fizruk-domain";
import {
  isInjurySiteId,
  type InjurySiteId,
} from "@sergeant/fizruk-domain/data";

import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { extractInjurySnapshots } from "../lib/fizrukDualWriteState";
import {
  fizrukDualWriteTransition,
  useFizrukIntendedSlice,
} from "../lib/fizrukDualWriteIntent";
import {
  getCachedFizrukSqliteState,
  type CachedInjury,
} from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";

/**
 * Injury marks — the "не можна" model (ADR-0083, канон fizruk §5).
 *
 * AI-CONTEXT: Marking is deliberately NOT deletion. `clear()` sets
 * `clearedAt` and keeps the row, because the history of what hurt and when is
 * the user's data. `remove()` exists only for "I marked the wrong zone".
 *
 * AI-DANGER: `activeSites` is what actually blocks exercises. Anything that
 * widens it (e.g. treating cleared marks as active) silently removes
 * exercises from advice; anything that narrows it silently recommends a
 * movement onto an injury. Change it only alongside `injuryBlock.test.ts`.
 */

function injuryUid(): string {
  return `inj_${crypto.randomUUID()}`;
}

export interface UseInjuriesResult {
  /** All marks, newest first — including cleared ones (history). */
  all: InjuryMark[];
  /** Marks with no `clearedAt` — the ones that block. */
  active: InjuryMark[];
  /** Site ids that block, ready for `injuryBlockForExercise`. */
  activeSites: ReadonlySet<InjurySiteId>;
  /** Mark a zone as injured. No-op when the zone is already marked. */
  mark: (site: InjurySiteId, note?: string) => void;
  /**
   * Mark several zones in ONE write. Use this instead of looping `mark`:
   * every `mark` call closes over the same `rows`, so a loop in one tick
   * writes N overlapping states and sync keeps only the last zone.
   */
  markMany: (sites: readonly InjurySiteId[], note?: string) => void;
  /** Lift a mark, keeping it in history. */
  clear: (id: string) => void;
  /** Delete a mark outright — for "wrong zone", not for recovery. */
  remove: (id: string) => void;
}

function toMark(row: CachedInjury): InjuryMark {
  return {
    id: row.id,
    site: row.site,
    startedAt: row.startedAt,
    clearedAt: row.clearedAt,
    note: row.note,
  };
}

export function useInjuries(): UseInjuriesResult {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [rows, setRows] = useSqliteTickOverlay<CachedInjury[]>(
    sqliteCacheTick,
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null ? undefined : cache.injuries;
    },
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null ? [] : cache.injuries;
    },
  );

  const intended = useFizrukIntendedSlice<"injuries">(sqliteCacheTick);

  const persist = useCallback(
    (next: CachedInjury[]) => {
      setRows(next);
      const transition = fizrukDualWriteTransition(
        "injuries",
        intended,
        extractInjurySnapshots(next),
      );
      try {
        triggerFizrukDualWrite(transition.prev, transition.next);
      } catch {
        /* trigger is fire-and-forget — never propagate */
      }
    },
    [intended, setRows],
  );

  const all = useMemo(() => rows.map(toMark), [rows]);
  const active = useMemo(() => all.filter((m) => !m.clearedAt), [all]);
  const activeSites = useMemo(() => activeInjurySites(all), [all]);

  const markMany = useCallback(
    (sites: readonly InjurySiteId[], note = "") => {
      // Один виклик — один `next` і один `persist`. Цикл `mark()` у тому ж
      // тіку брав би той самий застарілий `rows` N разів, а
      // `fizrukDualWriteTransition` диффив би кожен виклик проти попереднього
      // наміру: insert зони N + delete зони N-1, тобто лишалась лише остання
      // зона (аудит 2026-10-01, data-36).
      const taken = new Set<string>(
        rows.filter((r) => r.clearedAt === null).map((r) => r.site),
      );
      // eslint-disable-next-line no-restricted-syntax -- instant, not a day key: «коли почалось» is a point in time the LWW sync compares directly; a Kyiv day boundary would lose the ordering between two marks made the same day
      const startedAt = new Date().toISOString();
      const added: CachedInjury[] = [];
      for (const site of sites) {
        if (!isInjurySiteId(site)) continue;
        // Re-marking an already-active zone would create a second row that
        // blocks the same thing — clearing one would then look like a no-op.
        // `taken` also dedups repeats inside the same call.
        if (taken.has(site)) continue;
        taken.add(site);
        added.push({
          id: injuryUid(),
          site,
          startedAt,
          clearedAt: null,
          note,
        });
      }
      if (added.length === 0) return;
      // Newest first: later sites in the call sit closer to the head.
      persist([...added.reverse(), ...rows]);
      trackEvent(ANALYTICS_EVENTS.FIZRUK_INJURY_MARKED, {
        count: added.length,
      });
    },
    [rows, persist],
  );

  const mark = useCallback(
    (site: InjurySiteId, note = "") => markMany([site], note),
    [markMany],
  );

  const clear = useCallback(
    (id: string) => {
      // eslint-disable-next-line no-restricted-syntax -- instant, not a day key: `clearedAt` only ever gets compared to `startedAt` and to sync timestamps
      const at = new Date().toISOString();
      persist(rows.map((r) => (r.id === id ? { ...r, clearedAt: at } : r)));
      trackEvent(ANALYTICS_EVENTS.FIZRUK_INJURY_CLEARED);
    },
    [rows, persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist(rows.filter((r) => r.id !== id));
    },
    [rows, persist],
  );

  return { all, active, activeSites, mark, markMany, clear, remove };
}
