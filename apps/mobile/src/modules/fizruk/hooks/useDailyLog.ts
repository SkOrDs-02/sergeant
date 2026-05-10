/**
 * `useDailyLog` — mobile hook for Fizruk daily log entries
 * (weight, sleep, energy, mood).
 *
 * Port of `apps/web/src/modules/fizruk/hooks/useDailyLog.ts`.
 * Uses MMKV (via `@/lib/storage`) instead of localStorage.
 * Every mutator routes through `persist()` so writes share a single
 * code path.
 *
 * Stage 12 / PR #070f-mobile-dualwrite — wires the dual-write
 * trigger so each MMKV write is mirrored into local SQLite via
 * `triggerFizrukDualWrite`. Fire-and-forget; the trigger is a
 * no-op when the dual-write context is not registered (pre-auth).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";
import type { DailyLogEntry } from "@sergeant/fizruk-domain";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractDailyLogSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";

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
      // Stage 12 / PR #070f-mobile-dualwrite — mirror MMKV write into
      // SQLite. Fire-and-forget; never propagate trigger errors.
      const prevDualWrite =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      const nextDualWrite = {
        ...prevDualWrite,
        dailyLog: extractDailyLogSnapshots(next),
      };
      try {
        triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
      } catch {
        /* trigger is fire-and-forget */
      }
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
