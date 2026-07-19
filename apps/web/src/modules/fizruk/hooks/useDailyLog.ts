import { useCallback, useMemo } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import type { DailyLogEntry as DomainDailyLogEntry } from "@sergeant/fizruk-domain";
import { mirrorWeightToBiometrics } from "../../../core/profile/biometrics";
import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractDailyLogSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

/**
 * Daily log entry schema. Extends the domain `DailyLogEntry` (used by
 * `computeWellbeingMultiplier` / `computeRecoveryBy`) with the local
 * `moodScore` field that historically lived only on the web side. The
 * domain's `[key: string]: unknown` index signature lets the extra field
 * pass through `Partial<DomainDailyLogEntry>` parameters cleanly.
 */
export interface DailyLogEntry extends DomainDailyLogEntry {
  weightKg: number | null;
  sleepHours: number | null;
  energyLevel: number | null;
  moodScore: number | null;
  note: string;
}

export type DailyLogNumericField =
  "weightKg" | "sleepHours" | "energyLevel" | "moodScore";

// AI-DANGER: local id generation for daily-log entries. The `dl_` prefix
// and time+random shape are relied on by the dual-write/cloud-sync pipeline
// to dedupe LWW merges across devices. Do NOT swap to a bare `Date.now()`
// (collision-prone under rapid entry) or change the prefix without auditing
// the sync de-dupe path. (The same shape is duplicated in
// WorkoutTemplatesSection.tsx, useWorkoutTemplates.ts and activeWorkoutLib.ts —
// keep them in lockstep if this changes.)
function uid() {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * DCRUD-007 cutover: the journal is sourced from the SQLite cache
 * (`fizruk_daily_log` table) and persisted exclusively through the
 * dual-write pipeline — mirroring `useMeasurements`. The legacy
 * `fizruk_daily_log_v1` LS key was a divergent read source (writes
 * landed in the structured table, reads came from LS/kv_store, so a
 * reload "lost" the entry); it is drained on boot via
 * `importFizrukResidualFromLs` and removed.
 */
export function useDailyLog() {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [entries, setEntries] = useSqliteTickOverlay<DailyLogEntry[]>(
    sqliteCacheTick,
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null
        ? undefined
        : (cache.dailyLog as DailyLogEntry[]);
    },
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null
        ? []
        : (cache.dailyLog as DailyLogEntry[]);
    },
  );

  const persist = useCallback(
    (next: DailyLogEntry[]) => {
      setEntries(next);
      // Stage 12 / PR #070f-dualwrite — persist through the dual-write
      // pipeline (SQLite is the source of truth for the journal).
      // Fire-and-forget; trigger is a no-op when the context is not
      // registered (pre-auth).
      const prevDualWrite =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      const nextDualWrite = {
        ...prevDualWrite,
        dailyLog: extractDailyLogSnapshots(next),
      };
      try {
        triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
      } catch {
        /* trigger is fire-and-forget — never propagate */
      }
    },
    [setEntries],
  );

  const addEntry = useCallback(
    (data: Partial<DailyLogEntry>) => {
      const e: DailyLogEntry = {
        id: uid(),
        // eslint-disable-next-line no-restricted-syntax -- UTC-anchored wall-clock instant для timestamp запису (не Kyiv-межа доби)
        at: new Date().toISOString(),
        weightKg: null,
        sleepHours: null,
        energyLevel: null,
        moodScore: null,
        note: "",
        ...data,
      };
      persist([e, ...entries]);
      // Bidirectional weight sync — a Fizruk-side weigh-in is also the
      // canonical "current weight" for Nutrition (and the "Поточна
      // вага" field on Profile). LWW: every weigh-in beats the last
      // value regardless of which surface initiated it; CloudSync
      // resolves cross-device conflicts on the merged Profile blob via
      // the same module-level LWW.
      if (e.weightKg != null) {
        mirrorWeightToBiometrics(e.weightKg, e.at);
      }
      return e;
    },
    [entries, persist],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      persist(entries.filter((e) => e.id !== id));
    },
    [entries, persist],
  );

  /**
   * Re-insert a previously deleted entry, preserving the original `id`,
   * `at` timestamp and field values. Used by undo flows after `deleteEntry`.
   */
  const restoreEntry = useCallback(
    (entry: DailyLogEntry | null | undefined) => {
      if (!entry || !entry.id) return;
      persist(
        entries.some((e) => e.id === entry.id) ? entries : [entry, ...entries],
      );
    },
    [entries, persist],
  );

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (b.at || "").localeCompare(a.at || "")),
    [entries],
  );

  /** Last N entries with a given field filled. */
  const recentWith = useCallback(
    (field: DailyLogNumericField, limit = 30): DailyLogEntry[] => {
      return sorted.filter((e) => e[field] != null).slice(0, limit);
    },
    [sorted],
  );

  /** Latest single entry. */
  const latest = sorted[0] || null;

  return {
    entries: sorted,
    latest,
    addEntry,
    deleteEntry,
    restoreEntry,
    recentWith,
  };
}
