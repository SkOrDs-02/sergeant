/**
 * `useWellbeing` — mobile hook for Fizruk daily wellbeing entries
 * (mood, energy, sleep, recovery notes).
 *
 * Persists under `STORAGE_KEYS.FIZRUK_WELLBEING`
 * (`fizruk_wellbeing_v1`) — one entry per `YYYY-MM-DD` day. The
 * `WellbeingChart` component on web reads the same shape, so the
 * mobile port can later mount it directly.
 *
 * `upsertForDate` is no-op-guarded by deep equality: when the patch
 * leaves every persisted field unchanged (e.g. the form was reopened
 * and resaved without edits), the in-memory list stays referentially
 * identical and the MMKV write is skipped. `removeForDate` is silent
 * when no entry exists for the given date.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_WELLBEING;

export interface WellbeingEntry {
  /** `YYYY-MM-DD` — primary key; one entry per calendar day. */
  date: string;
  /** 1–5, optional. */
  mood?: number | null;
  /** 1–5, optional. */
  energy?: number | null;
  /** 1–5, optional. */
  sleepQuality?: number | null;
  /** Hours of sleep, optional. */
  sleepHours?: number | null;
  /** Free-form notes. */
  notes?: string;
  updatedAt?: string;
  [extra: string]: unknown;
}

function readList(): WellbeingEntry[] {
  const raw = safeReadLS<unknown>(STORAGE_KEY, []);
  return Array.isArray(raw) ? (raw as WellbeingEntry[]) : [];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export interface UseWellbeingResult {
  /** Entries sorted by date descending (newest first). */
  entries: readonly WellbeingEntry[];
  /**
   * Insert or merge an entry for the given date. Returns the persisted
   * entry, or `null` when the patch produced no real change.
   */
  upsertForDate(
    date: string,
    patch: Omit<Partial<WellbeingEntry>, "date">,
  ): WellbeingEntry | null;
  /** Remove the entry for the given date. Silent no-op when missing. */
  removeForDate(date: string): void;
  /** Clear every entry. */
  clear(): void;
}

export function useWellbeing(): UseWellbeingResult {
  const [entries, setEntries] = useState<WellbeingEntry[]>(readList);
  // See `useFizrukWorkouts` for why we mirror state in a ref.
  const stateRef = useRef<WellbeingEntry[]>(entries);

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== STORAGE_KEY) return;
      const fresh = readList();
      stateRef.current = fresh;
      setEntries(fresh);
    });
    return () => sub.remove();
  }, []);

  const persist = useCallback(
    (updater: (prev: WellbeingEntry[]) => WellbeingEntry[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;
      safeWriteLS(STORAGE_KEY, next);
      setEntries(next);
    },
    [],
  );

  const upsertForDate = useCallback<UseWellbeingResult["upsertForDate"]>(
    (date, patch) => {
      const prev = stateRef.current;
      const idx = prev.findIndex((e) => e.date === date);
      const stamped = new Date().toISOString();
      if (idx < 0) {
        const created: WellbeingEntry = { date, ...patch, updatedAt: stamped };
        persist(() => [created, ...prev]);
        return created;
      }
      const merged: WellbeingEntry = { ...prev[idx]!, ...patch, date };
      // Skip the timestamp bump and the write entirely when nothing
      // user-visible changed — keeps the MMKV slot stable on idempotent
      // re-saves of the daily sheet.
      const { updatedAt: _prevTs, ...prevSansTs } = prev[idx]!;
      const { updatedAt: _mergedTs, ...mergedSansTs } = merged;
      if (deepEqual(prevSansTs, mergedSansTs)) {
        return prev[idx]!;
      }
      const stampedEntry: WellbeingEntry = { ...merged, updatedAt: stamped };
      persist(() => {
        const list = stateRef.current.slice();
        const i = list.findIndex((e) => e.date === date);
        if (i < 0) list.unshift(stampedEntry);
        else list[i] = stampedEntry;
        return list;
      });
      return stampedEntry;
    },
    [persist],
  );

  const removeForDate = useCallback<UseWellbeingResult["removeForDate"]>(
    (date) => {
      persist((prev) => {
        const next = prev.filter((e) => e.date !== date);
        return next.length === prev.length ? prev : next;
      });
    },
    [persist],
  );

  const clear = useCallback<UseWellbeingResult["clear"]>(() => {
    persist((prev) => (prev.length === 0 ? prev : []));
  }, [persist]);

  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [entries],
  );

  return { entries: sorted, upsertForDate, removeForDate, clear };
}
