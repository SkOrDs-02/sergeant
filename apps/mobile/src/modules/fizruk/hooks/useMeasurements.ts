/**
 * `useMeasurements` — mobile hook for the Fizruk Measurements screen
 * (Phase 6 · Measurements PR).
 *
 * Mirrors the public surface of the web hook at
 * `apps/web/src/modules/fizruk/hooks/useMeasurements.ts` — a sorted
 * newest-first list plus imperative CRUD — but wider (the mobile port
 * needs `update` + `clear` for edit-in-place and delete-all flows).
 *
 * Persistence goes through the shared MMKV-backed `useLocalStorage`
 * helper so the same `FIZRUK_MEASUREMENTS` storage slot that web
 * CloudSync already tracks is reused unchanged. All ordering,
 * upserting, and removal logic lives in
 * `@sergeant/fizruk-domain/domain/measurements` — this file is a thin
 * wrapper so the selectors stay unit-testable in isolation and we can
 * share them with the web port later.
 *
 * Scope note: photo progress (`BodyPhoto`) is explicitly out of scope
 * for the Phase 6 migration, so this hook only owns numeric entries.
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
import { STORAGE_KEYS } from "@sergeant/shared";

import { useSyncedStorage } from "@/sync/useSyncedStorage";

import {
  getCachedFizrukSqliteState,
  type FizrukMeasurementEntry,
} from "../lib/sqliteReader";
import { useFizrukSqliteReadGate } from "../lib/sqliteReadGate";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_MEASUREMENTS;

const EMPTY: readonly MobileMeasurementEntry[] = [];

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

/**
 * Read / mutate the Fizruk measurement entries backed by MMKV.
 *
 * The hook returns sorted (newest-first) entries so the list
 * component stays pure. All mutations flow through pure reducers from
 * `@sergeant/fizruk-domain/domain/measurements`.
 */
export function useMeasurements(): UseMeasurementsResult {
  const [raw, setRaw, removeRaw] = useSyncedStorage<
    readonly MobileMeasurementEntry[]
  >(STORAGE_KEY, EMPTY);

  // Stage 4 PR #029a: under `feature.fizruk.sqlite_v2.read_sqlite`,
  // overlay measurements from the local SQLite cache once it's warm.
  // The MMKV-backed `useSyncedStorage` read above stays as the
  // synchronous fallback so the first paint never blocks on SQLite.
  // Writes still go through `setRaw` / `removeRaw` exactly as today —
  // PR #029a does NOT change the write path.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useFizrukSqliteReadGate();
  const [overlay, setOverlay] = useState<
    readonly MobileMeasurementEntry[] | null
  >(null);

  useEffect(() => {
    if (!sqliteReadEnabled) {
      // Flag flipped off — drop the overlay so we fall back to MMKV
      // without waiting for a remount.
      setOverlay((prev) => (prev === null ? prev : null));
      return;
    }
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setOverlay(cache.measurements.map(projectMeasurementForMobile));
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const entries = useMemo(() => {
    const source: readonly MobileMeasurementEntry[] =
      overlay !== null ? overlay : Array.isArray(raw) ? raw : [];
    return sortMeasurementsDesc(source);
  }, [overlay, raw]);

  const add = useCallback<UseMeasurementsResult["add"]>(
    (draft) => {
      const entry = normaliseMeasurementDraft(draft, makeId());
      setRaw((prev) =>
        upsertMeasurement(Array.isArray(prev) ? prev : [], entry),
      );
      return entry;
    },
    [setRaw],
  );

  const update = useCallback<UseMeasurementsResult["update"]>(
    (id, draft) => {
      const prev = Array.isArray(raw) ? raw : [];
      const exists = prev.some((e) => e.id === id);
      if (!exists) return null;
      const nextEntry = normaliseMeasurementDraft(draft, id);
      setRaw((current) =>
        upsertMeasurement(Array.isArray(current) ? current : [], nextEntry),
      );
      return nextEntry;
    },
    [raw, setRaw],
  );

  const remove = useCallback<UseMeasurementsResult["remove"]>(
    (id) => {
      const current = Array.isArray(raw) ? raw : [];
      if (!current.some((e) => e.id === id)) return;
      setRaw((prev) => removeInList(Array.isArray(prev) ? prev : [], id));
    },
    [raw, setRaw],
  );

  const restore = useCallback<UseMeasurementsResult["restore"]>(
    (entry) => {
      if (!entry?.id) return;
      setRaw((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((e) => e.id === entry.id)) return list;
        return upsertMeasurement(list, entry);
      });
    },
    [setRaw],
  );

  const clear = useCallback<UseMeasurementsResult["clear"]>(() => {
    removeRaw();
  }, [removeRaw]);

  return { entries, add, update, remove, restore, clear };
}
