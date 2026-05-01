import { useCallback, useEffect, useMemo, useState } from "react";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage";
import { STORAGE_KEYS } from "@sergeant/shared";

const KEY = STORAGE_KEYS.FIZRUK_DAILY_LOG;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DailyLogEntry = any;

function uid() {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Daily log entry schema:
 * {
 *   id: string,
 *   at: ISO string (date of the entry),
 *   weightKg: number | null,
 *   sleepHours: number | null,
 *   energyLevel: 1-5 | null,
 *   moodScore: 1-5 | null,
 *   note: string,
 * }
 */
export function useDailyLog() {
  const [entries, setEntries] = useState<DailyLogEntry[]>([]);

  useEffect(() => {
    const loaded = safeReadLS(KEY, []);
    if (Array.isArray(loaded)) setEntries(loaded);
  }, []);

  const persist = useCallback((next) => {
    setEntries(next);
    safeWriteLS(KEY, next);
  }, []);

  const addEntry = useCallback(
    (data) => {
      const e = {
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
    (id) => {
      persist(entries.filter((e) => e.id !== id));
    },
    [entries, persist],
  );

  /**
   * Re-insert a previously deleted entry, preserving the original `id`,
   * `at` timestamp and field values. Used by undo flows after `deleteEntry`.
   */
  const restoreEntry = useCallback(
    (entry) => {
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
    (field, limit = 30) => {
      return sorted
        .filter((e) => e[field] != null && e[field] !== "")
        .slice(0, limit);
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
