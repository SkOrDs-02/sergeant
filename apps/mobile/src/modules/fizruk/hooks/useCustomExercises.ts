/**
 * `useCustomExercises` — mobile hook for the Fizruk **Exercise library**
 * (user-created entries layered on top of the built-in catalogue).
 *
 * Persists under `STORAGE_KEYS.FIZRUK_CUSTOM_EXERCISES`
 * (`fizruk_custom_exercises_v1`), the same MMKV slot already declared
 * in `apps/mobile/src/sync/config.ts`. Every mutator routes through
 * `persist()` so writes share a single code path. Mutators are
 * no-op-guarded: passing an unknown id to `update` / `remove` keeps
 * the in-memory state referentially identical and skips the MMKV
 * write entirely.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";

import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadGate } from "../lib/sqliteReadGate";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_CUSTOM_EXERCISES;

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

function readList(): CustomExercise[] {
  const raw = safeReadLS<unknown>(STORAGE_KEY, []);
  return Array.isArray(raw) ? (raw as CustomExercise[]) : [];
}

export interface UseCustomExercisesResult {
  exercises: readonly CustomExercise[];
  add(draft: CustomExerciseDraft): CustomExercise;
  update(id: string, patch: Partial<CustomExercise>): CustomExercise | null;
  remove(id: string): void;
  clear(): void;
}

export function useCustomExercises(): UseCustomExercisesResult {
  const [exercises, setExercises] = useState<CustomExercise[]>(readList);
  // See `useFizrukWorkouts` for why we mirror state in a ref.
  const stateRef = useRef<CustomExercise[]>(exercises);

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== STORAGE_KEY) return;
      const fresh = readList();
      stateRef.current = fresh;
      setExercises(fresh);
    });
    return () => sub.remove();
  }, []);

  // Stage 4 PR #029a: under `feature.fizruk.sqlite_v2.read_sqlite`,
  // overlay custom exercises from the local SQLite cache once it's
  // warm. The MMKV first-paint read above stays as a synchronous
  // fallback so the first paint never blocks on SQLite.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useFizrukSqliteReadGate();
  useEffect(() => {
    if (!sqliteReadEnabled) return;
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    // `cache.customExercises` is `RawExerciseDef[]` from
    // `@sergeant/fizruk-domain`; translate to the loose mobile
    // `CustomExercise` shape consumed by `useExerciseCatalog`.
    const overlay: CustomExercise[] = cache.customExercises.map((ex) => ({
      id: ex.id,
      nameUk: ex.name?.uk ?? "",
      primaryGroup: ex.primaryGroup ?? "",
      musclesPrimary: ex.muscles?.primary ?? [],
      musclesSecondary: ex.muscles?.secondary ?? [],
    }));
    stateRef.current = overlay;
    setExercises(overlay);
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const persist = useCallback(
    (updater: (prev: CustomExercise[]) => CustomExercise[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;
      safeWriteLS(STORAGE_KEY, next);
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
