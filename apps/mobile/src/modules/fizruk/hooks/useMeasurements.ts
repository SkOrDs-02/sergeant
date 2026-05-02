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
import { useCallback, useMemo } from "react";

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

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_MEASUREMENTS;

const EMPTY: readonly MobileMeasurementEntry[] = [];

function makeId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

  const entries = useMemo(
    () => sortMeasurementsDesc(Array.isArray(raw) ? raw : []),
    [raw],
  );

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
