/**
 * `useWellbeing` — mobile hook for Fizruk daily wellbeing entries
 * (mood, energy, sleep, recovery notes).
 *
 * Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 of
 * `docs/planning/storage-roadmap.md`. Reads from the SQLite warm cache
 * (`getCachedFizrukSqliteState`) and persists exclusively through the
 * dual-write pipeline (`triggerFizrukDualWrite`). The legacy MMKV slot
 * `STORAGE_KEYS.FIZRUK_WELLBEING` is drained on first boot via
 * `importFizrukResidualFromMmkv` and removed.
 *
 * One entry per `YYYY-MM-DD` day (composite PK `(user_id, date_key)`
 * in SQLite). The `WellbeingChart` component on web reads the same
 * shape, so the mobile port can later mount it directly.
 *
 * `upsertForDate` is no-op-guarded by deep equality: when the patch
 * leaves every persisted field unchanged (e.g. the form was reopened
 * and resaved without edits), the in-memory list stays referentially
 * identical and the dual-write trigger is skipped. `removeForDate`
 * is silent when no entry exists for the given date.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractWellbeingSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import {
  getCachedFizrukSqliteState,
  type CachedWellbeingEntry,
} from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

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

/** Project a cache row onto the loose `WellbeingEntry` hook shape. */
function projectFromCache(row: CachedWellbeingEntry): WellbeingEntry {
  return {
    date: row.date,
    mood: row.mood,
    energy: row.energy,
    sleepQuality: row.sleepQuality,
    sleepHours: row.sleepHours,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

/** Read the initial entries from the warm cache, or [] if cold. */
function loadInitialFromCache(): WellbeingEntry[] {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return [];
  return cache.wellbeing.map(projectFromCache);
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
  const [entries, setEntries] =
    useState<WellbeingEntry[]>(loadInitialFromCache);
  const stateRef = useRef<WellbeingEntry[]>(entries);

  // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5: overlay
  // wellbeing entries from the SQLite warm cache once it's available.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = cache.wellbeing.map(projectFromCache);
    stateRef.current = overlay;
    setEntries(overlay);
  }, [sqliteCacheTick]);

  const persist = useCallback(
    (updater: (prev: WellbeingEntry[]) => WellbeingEntry[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;
      setEntries(next);
      // Stage 12.5 / PR #057f2-tombstone-mobile-stage12-5 — mirror to
      // SQLite via the dual-write pipeline only (no MMKV write).
      const baseState =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      try {
        triggerFizrukDualWrite(
          { ...baseState, wellbeing: extractWellbeingSnapshots(prev) },
          { ...baseState, wellbeing: extractWellbeingSnapshots(next) },
        );
      } catch {
        /* trigger is fire-and-forget — never propagate */
      }
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
      // user-visible changed — keeps the slot stable on idempotent
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
