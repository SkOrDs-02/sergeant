/**
 * `useDailyLog` — mobile hook for Fizruk daily log entries
 * (weight, sleep, energy, mood).
 *
 * Port of `apps/web/src/modules/fizruk/hooks/useDailyLog.ts`.
 * Uses MMKV (via `@/lib/storage`) instead of localStorage.
 * Every mutator routes through `persist()` so writes share a single
 * code path.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";
import type { DailyLogEntry } from "@sergeant/fizruk-domain";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_DAILY_LOG;

function uid(): string {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readEntries(): DailyLogEntry[] {
  const raw = safeReadLS<unknown>(STORAGE_KEY, []);
  return Array.isArray(raw) ? (raw as DailyLogEntry[]) : [];
}

export interface UseDailyLogResult {
  entries: readonly DailyLogEntry[];
  latest: DailyLogEntry | null;
  addEntry: (data?: Partial<DailyLogEntry>) => DailyLogEntry;
  deleteEntry: (id: string) => void;
  recentWith: (field: keyof DailyLogEntry, limit?: number) => DailyLogEntry[];
}

export function useDailyLog(): UseDailyLogResult {
  const [entries, setEntries] = useState<DailyLogEntry[]>(readEntries);
  const stateRef = useRef<DailyLogEntry[]>(entries);

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== STORAGE_KEY) return;
      const fresh = readEntries();
      stateRef.current = fresh;
      setEntries(fresh);
    });
    return () => sub.remove();
  }, []);

  const persist = useCallback(
    (updater: (prev: DailyLogEntry[]) => DailyLogEntry[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;
      safeWriteLS(STORAGE_KEY, next);
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
