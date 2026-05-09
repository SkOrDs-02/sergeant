/**
 * `useCustomExercises` — mobile hook for the Fizruk **Exercise library**
 * (user-created entries layered on top of the built-in catalogue).
 *
 * Stage 8 PR #057f-tombstone of `docs/planning/storage-roadmap.md`.
 * Reads from the SQLite warm cache and persists exclusively through
 * the dual-write pipeline (`triggerFizrukDualWrite`). The legacy MMKV
 * slot `STORAGE_KEYS.FIZRUK_CUSTOM_EXERCISES` is drained on first
 * boot via `importFizrukResidualFromMmkv` and removed.
 *
 * Mutators are no-op-guarded: passing an unknown id to `update` /
 * `remove` keeps the in-memory state referentially identical and
 * skips the dual-write trigger entirely.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { FizrukData } from "@sergeant/fizruk-domain";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractCustomExerciseSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

type RawExerciseDef = FizrukData.RawExerciseDef;

export interface CustomExercise {
  id: string;
  nameUk: string;
  primaryGroup?: string;
  musclesPrimary?: string[];
  musclesSecondary?: string[];
  type?: "strength" | "distance" | "time";
  notes?: string;
  [extra: string]: unknown;
}

export type CustomExerciseDraft = Omit<CustomExercise, "id"> & {
  id?: string;
};

function uid(): string {
  return `cex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Translate the cache's `RawExerciseDef[]` shape (from
 * `@sergeant/fizruk-domain`) onto the loose mobile `CustomExercise`
 * shape consumed by `useExerciseCatalog`.
 */
function projectFromCache(ex: RawExerciseDef): CustomExercise {
  return {
    id: ex.id,
    nameUk: ex.name?.uk ?? "",
    primaryGroup: ex.primaryGroup ?? "",
    musclesPrimary: ex.muscles?.primary ?? [],
    musclesSecondary: ex.muscles?.secondary ?? [],
  };
}

/**
 * Translate the loose mobile `CustomExercise` shape into the
 * `RawExerciseDef` shape understood by the dual-write snapshot
 * extractor and the SQLite adapter.
 */
function toRawExerciseDef(ex: CustomExercise): RawExerciseDef {
  return {
    id: ex.id,
    name: { uk: ex.nameUk },
    primaryGroup: ex.primaryGroup ?? "",
    muscles: {
      primary: ex.musclesPrimary ?? [],
      secondary: ex.musclesSecondary ?? [],
    },
    _custom: true,
  };
}

export interface UseCustomExercisesResult {
  exercises: readonly CustomExercise[];
  add(draft: CustomExerciseDraft): CustomExercise;
  update(id: string, patch: Partial<CustomExercise>): CustomExercise | null;
  remove(id: string): void;
  clear(): void;
}

function readInitialFromCache(): CustomExercise[] {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return [];
  return cache.customExercises.map(projectFromCache);
}

export function useCustomExercises(): UseCustomExercisesResult {
  const [exercises, setExercises] =
    useState<CustomExercise[]>(readInitialFromCache);
  // See `useFizrukWorkouts` for why we mirror state in a ref.
  const stateRef = useRef<CustomExercise[]>(exercises);

  // Stage 8 PR #057f-tombstone: overlay custom exercises from the
  // SQLite warm cache once it's available.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = cache.customExercises.map(projectFromCache);
    stateRef.current = overlay;
    setExercises(overlay);
  }, [sqliteCacheTick]);

  const persist = useCallback(
    (updater: (prev: CustomExercise[]) => CustomExercise[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;

      const prevDualWrite =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      const nextDualWrite = {
        ...prevDualWrite,
        customExercises: extractCustomExerciseSnapshots(
          next.map(toRawExerciseDef),
        ),
      };
      try {
        triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
      } catch {
        /* trigger is fire-and-forget */
      }

      setExercises(next);
    },
    [],
  );

  const add = useCallback<UseCustomExercisesResult["add"]>(
    (draft) => {
      // The `[extra: string]: unknown` index signature on
      // `CustomExercise` widens spread-result property types to
      // `unknown`. Cast through `unknown` so TS treats the literal as
      // a fresh `CustomExercise` rather than re-typing every field.
      const entry: CustomExercise = {
        ...draft,
        id: draft.id || uid(),
      } as unknown as CustomExercise;
      persist((prev) => [entry, ...prev]);
      return entry;
    },
    [persist],
  );

  const update = useCallback<UseCustomExercisesResult["update"]>(
    (id, patch) => {
      const idx = stateRef.current.findIndex((e) => e.id === id);
      if (idx < 0) return null;
      const updated: CustomExercise = {
        ...stateRef.current[idx]!,
        ...patch,
        id,
      };
      persist((prev) => {
        const i = prev.findIndex((e) => e.id === id);
        if (i < 0) return prev;
        const next = prev.slice();
        next[i] = updated;
        return next;
      });
      return updated;
    },
    [persist],
  );

  const remove = useCallback<UseCustomExercisesResult["remove"]>(
    (id) => {
      persist((prev) => {
        const next = prev.filter((e) => e.id !== id);
        return next.length === prev.length ? prev : next;
      });
    },
    [persist],
  );

  const clear = useCallback<UseCustomExercisesResult["clear"]>(() => {
    persist((prev) => (prev.length === 0 ? prev : []));
  }, [persist]);

  return { exercises, add, update, remove, clear };
}
