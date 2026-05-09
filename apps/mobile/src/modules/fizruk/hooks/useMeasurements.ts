/**
 * `useMeasurements` — mobile hook for the Fizruk Measurements screen.
 *
 * Stage 8 PR #057f-tombstone of `docs/planning/storage-roadmap.md`.
 * Reads from the SQLite warm cache and persists exclusively through
 * the dual-write pipeline (`triggerFizrukDualWrite`). The legacy MMKV
 * slot `STORAGE_KEYS.FIZRUK_MEASUREMENTS` is drained on first boot
 * via `importFizrukResidualFromMmkv` and removed.
 *
 * All ordering / upserting / removal logic lives in
 * `@sergeant/fizruk-domain/domain/measurements`; this file is a thin
 * wrapper so the selectors stay unit-testable in isolation and we can
 * share them with the web port later.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  normaliseMeasurementDraft,
  removeMeasurement as removeInList,
  sortMeasurementsDesc,
  upsertMeasurement,
  type MeasurementDraft,
  type MobileMeasurementEntry,
} from "@sergeant/fizruk-domain/domain";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractMeasurementSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import {
  getCachedFizrukSqliteState,
  type FizrukMeasurementEntry,
} from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

function makeId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function numericOrUndef(
  value: number | string | undefined,
): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/**
 * Project a `FizrukMeasurementEntry` (the loose shape held by the
 * SQLite cache, mirrored 1:1 from web) onto the strict mobile
 * `MobileMeasurementEntry` shape used by the screen + selectors.
 *
 * The cache reader fans `bicep_cm` out into both `bicepLCm` and
 * `bicepRCm` for web parity; mobile collapses them back into a single
 * `bicepCm` here so the form / list / selectors keep working unchanged.
 */
function projectMeasurementForMobile(
  entry: FizrukMeasurementEntry,
): MobileMeasurementEntry {
  const bicepCm =
    numericOrUndef(entry.bicepCm) ??
    numericOrUndef(entry.bicepLCm) ??
    numericOrUndef(entry.bicepRCm);

  const result: {
    -readonly [K in keyof MobileMeasurementEntry]: MobileMeasurementEntry[K];
  } = {
    id: entry.id,
    at: entry.at,
  };
  const weightKg = numericOrUndef(entry.weightKg);
  if (weightKg !== undefined) result.weightKg = weightKg;
  const waistCm = numericOrUndef(entry.waistCm);
  if (waistCm !== undefined) result.waistCm = waistCm;
  const chestCm = numericOrUndef(entry.chestCm);
  if (chestCm !== undefined) result.chestCm = chestCm;
  const hipsCm = numericOrUndef(entry.hipsCm);
  if (hipsCm !== undefined) result.hipsCm = hipsCm;
  if (bicepCm !== undefined) result.bicepCm = bicepCm;
  const sleepHours = numericOrUndef(entry.sleepHours);
  if (sleepHours !== undefined) result.sleepHours = sleepHours;
  const energyLevel = numericOrUndef(entry.energyLevel);
  if (energyLevel !== undefined) result.energyLevel = energyLevel;
  const mood = numericOrUndef(entry.mood);
  if (mood !== undefined) result.mood = mood;
  return result;
}

export interface UseMeasurementsResult {
  /** Newest-first entries. Never mutated in place. */
  entries: readonly MobileMeasurementEntry[];
  /**
   * Create a new entry from a validated draft. Returns the persisted
   * entry so callers can (optionally) reference it in a toast.
   */
  add: (draft: MeasurementDraft) => MobileMeasurementEntry;
  /**
   * Replace an existing entry by id. No-ops (returns `null`) when the
   * id is unknown so the screen can treat the case defensively.
   */
  update: (
    id: string,
    draft: MeasurementDraft,
  ) => MobileMeasurementEntry | null;
  /** Remove the entry with the given id. No-op when the id is unseen. */
  remove: (id: string) => void;
  /**
   * Re-insert a previously-removed entry. Used by undo-toast after
   * `remove`. No-op (referentially identical state) when an entry with
   * the same id already exists.
   */
  restore: (entry: MobileMeasurementEntry) => void;
  /** Delete every entry. Used by the settings "reset data" button. */
  clear: () => void;
}

function readInitialFromCache(): MobileMeasurementEntry[] {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return [];
  return cache.measurements.map(projectMeasurementForMobile);
}

/**
 * Read / mutate the Fizruk measurement entries backed by SQLite.
 *
 * The hook returns sorted (newest-first) entries so the list
 * component stays pure. All mutations flow through pure reducers from
 * `@sergeant/fizruk-domain/domain/measurements`.
 */
export function useMeasurements(): UseMeasurementsResult {
  const [raw, setRaw] =
    useState<MobileMeasurementEntry[]>(readInitialFromCache);

  // Stage 8 PR #057f-tombstone: overlay measurements from the local
  // SQLite cache once it's warm.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setRaw(cache.measurements.map(projectMeasurementForMobile));
  }, [sqliteCacheTick]);

  const entries = useMemo(
    () => sortMeasurementsDesc(Array.isArray(raw) ? raw : []),
    [raw],
  );

  const persist = useCallback(
    (updater: (prev: MobileMeasurementEntry[]) => MobileMeasurementEntry[]) => {
      setRaw((prev) => {
        const next = updater(Array.isArray(prev) ? prev : []);
        const prevDualWrite =
          peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
        const nextDualWrite = {
          ...prevDualWrite,
          measurements: extractMeasurementSnapshots(next),
        };
        try {
          triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
        } catch {
          /* trigger is fire-and-forget */
        }
        return next;
      });
    },
    [],
  );

  const add = useCallback<UseMeasurementsResult["add"]>(
    (draft) => {
      const entry = normaliseMeasurementDraft(draft, makeId());
      persist((prev) => upsertMeasurement(prev, entry));
      return entry;
    },
    [persist],
  );

  const update = useCallback<UseMeasurementsResult["update"]>(
    (id, draft) => {
      const exists = (Array.isArray(raw) ? raw : []).some((e) => e.id === id);
      if (!exists) return null;
      const nextEntry = normaliseMeasurementDraft(draft, id);
      persist((prev) => upsertMeasurement(prev, nextEntry));
      return nextEntry;
    },
    [raw, persist],
  );

  const remove = useCallback<UseMeasurementsResult["remove"]>(
    (id) => {
      const current = Array.isArray(raw) ? raw : [];
      if (!current.some((e) => e.id === id)) return;
      persist((prev) => removeInList(prev, id));
    },
    [raw, persist],
  );

  const restore = useCallback<UseMeasurementsResult["restore"]>(
    (entry) => {
      if (!entry?.id) return;
      persist((prev) => {
        if (prev.some((e) => e.id === entry.id)) return prev;
        return upsertMeasurement(prev, entry);
      });
    },
    [persist],
  );

  const clear = useCallback<UseMeasurementsResult["clear"]>(() => {
    persist((prev) => (prev.length === 0 ? prev : []));
  }, [persist]);

  return { entries, add, update, remove, restore, clear };
}
