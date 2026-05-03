import { useCallback, useEffect, useMemo, useState } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import type { DailyLogEntry as DomainDailyLogEntry } from "@sergeant/fizruk-domain";

const KEY = STORAGE_KEYS.FIZRUK_DAILY_LOG;

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
  | "weightKg"
  | "sleepHours"
  | "energyLevel"
  | "moodScore";

function uid() {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useDailyLog() {
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);

  useEffect(() => {
    const loaded = safeReadLS<DailyLogEntry[]>(KEY, []);
    if (Array.isArray(loaded)) setEntries(loaded);
  }, []);

  const persist = useCallback((next: DailyLogEntry[]) => {
    setEntries(next);
    safeWriteLS(KEY, next);
  }, []);

  const addEntry = useCallback(
    (data: Partial<DailyLogEntry>) => {
      const e: DailyLogEntry = {
        id: uid(),
        at: new Date().toISOString(),
        weightKg: null,
        sleepHours: null,
        energyLevel: null,
        moodScore: null,
        note: "",
        ...data,
      };
      persist([e, ...entries]);
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
