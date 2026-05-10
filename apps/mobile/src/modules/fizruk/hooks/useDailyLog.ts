/**
 * `useDailyLog` — mobile hook for Fizruk daily log entries
 * (weight, sleep, energy, mood).
 *
 * Stage 12 / PR #057f-tombstone-mobile-stage12 of
 * `docs/planning/storage-roadmap.md` (mobile parity for Stage 8
 * `#057f-tombstone` extended to the new Stage 12 daily-log slot).
 * Reads from the SQLite warm cache (`getCachedFizrukSqliteState`)
 * and persists exclusively through the dual-write pipeline
 * (`triggerFizrukDualWrite`). The legacy MMKV slot
 * `STORAGE_KEYS.FIZRUK_DAILY_LOG` is drained on first boot via
 * `importFizrukResidualFromMmkv` and removed.
 *
 * Pre-boot / pre-auth (cache cold, `refreshedAt === null`) the hook
 * starts empty and overlays once `useFizrukSqliteReadTick` fires.
 * No-op guards: `deleteEntry` on an unknown id keeps state
 * referentially identical and skips the dual-write trigger entirely.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DailyLogEntry } from "@sergeant/fizruk-domain";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractDailyLogSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import {
  getCachedFizrukSqliteState,
  type CachedDailyLogEntry,
} from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

function uid(): string {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Project a cache row onto the loose `DailyLogEntry` hook shape. */
function projectFromCache(row: CachedDailyLogEntry): DailyLogEntry {
  return {
    id: row.id,
    at: row.at,
    weightKg: row.weightKg,
    sleepHours: row.sleepHours,
    energyLevel: row.energyLevel,
    mood: row.mood,
    note: row.note,
  };
}

function readInitialFromCache(): DailyLogEntry[] {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return [];
  return cache.dailyLog.map(projectFromCache);
}

export interface UseDailyLogResult {
  entries: readonly DailyLogEntry[];
  latest: DailyLogEntry | null;
  addEntry: (data?: Partial<DailyLogEntry>) => DailyLogEntry;
  deleteEntry: (id: string) => void;
  recentWith: (field: keyof DailyLogEntry, limit?: number) => DailyLogEntry[];
}

export function useDailyLog(): UseDailyLogResult {
  const [entries, setEntries] = useState<DailyLogEntry[]>(readInitialFromCache);
  const stateRef = useRef<DailyLogEntry[]>(entries);

  // Stage 12 / PR #057f-tombstone-mobile-stage12: overlay daily-log
  // entries from the SQLite warm cache once it's available.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = cache.dailyLog.map(projectFromCache);
    stateRef.current = overlay;
    setEntries(overlay);
  }, [sqliteCacheTick]);

  const persist = useCallback(
    (updater: (prev: DailyLogEntry[]) => DailyLogEntry[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;

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

      setEntries(next);
    },
    [],
  );

  const addEntry = useCallback(
    (data?: Partial<DailyLogEntry>): DailyLogEntry => {
      const e: DailyLogEntry = {
        id: uid(),
        at: new Date().toISOString(),
        weightKg: null,
        sleepHours: null,
        energyLevel: null,
        mood: null,
        note: "",
        ...data,
      };
      persist((prev) => [e, ...prev]);
      return e;
    },
    [persist],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      persist((prev) => {
        const next = prev.filter((e) => e.id !== id);
        return next.length === prev.length ? prev : next;
      });
    },
    [persist],
  );

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (b.at || "").localeCompare(a.at || "")),
    [entries],
  );

  const recentWith = useCallback(
    (field: keyof DailyLogEntry, limit = 30): DailyLogEntry[] => {
      return sorted
        .filter((e) => e[field] != null && e[field] !== "")
        .slice(0, limit);
    },
    [sorted],
  );

  const latest = sorted[0] || null;

  return { entries: sorted, latest, addEntry, deleteEntry, recentWith };
}
