/**
 * `useFizrukWorkouts` — mobile hook for the Fizruk **Workouts** list.
 *
 * Stage 8 PR #057f-tombstone of `docs/planning/storage-roadmap.md`.
 * The hook reads from the SQLite warm cache populated by
 * `bootFizrukSqliteReadPath` and persists exclusively through the
 * dual-write pipeline (`triggerFizrukDualWrite`). The legacy MMKV
 * slot `STORAGE_KEYS.FIZRUK_WORKOUTS` is drained on first boot via
 * `importFizrukResidualFromMmkv` and removed.
 *
 * No-op guard: when a mutator is asked to operate on an unknown id
 * (e.g. `updateWorkout("missing-id", …)`) or when an `endWorkout`
 * call hits an already-ended session, the in-memory state stays
 * referentially identical and the dual-write call is skipped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain/domain";

import { triggerFizrukDualWrite } from "../lib/dualWrite";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractWorkoutSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

export interface FizrukChecklistItem {
  id: string;
  done: boolean;
  label: string;
}

export interface FizrukWorkoutItem {
  id: string;
  exerciseId?: string;
  nameUk?: string;
  primaryGroup?: string;
  musclesPrimary?: string[];
  musclesSecondary?: string[];
  type?: "strength" | "distance" | "time";
  sets?: { weightKg: number; reps: number }[];
  durationSec?: number;
  distanceM?: number;
  [extra: string]: unknown;
}

export interface FizrukWorkoutGroup {
  id: string;
  itemIds: string[];
}

export interface FizrukWorkout {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items: FizrukWorkoutItem[];
  groups: FizrukWorkoutGroup[];
  warmup: FizrukChecklistItem[] | null;
  cooldown: FizrukChecklistItem[] | null;
  note: string;
}

function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Project a domain `WorkoutItem` (from `@sergeant/fizruk-domain`) onto
 * the loose mobile `FizrukWorkoutItem` shape used by the screen +
 * selectors.
 */
function projectWorkoutItem(item: WorkoutItem): FizrukWorkoutItem {
  const out: FizrukWorkoutItem = { id: item.id };
  if (item.exerciseId) out.exerciseId = item.exerciseId;
  if (item.nameUk) out.nameUk = item.nameUk;
  if (item.primaryGroup) out.primaryGroup = item.primaryGroup;
  if (item.musclesPrimary) out.musclesPrimary = item.musclesPrimary;
  if (item.musclesSecondary) out.musclesSecondary = item.musclesSecondary;
  if (item.type) out.type = item.type;
  if (item.sets) {
    out.sets = item.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps }));
  }
  if (item.durationSec != null) out.durationSec = item.durationSec;
  if (item.distanceM != null) out.distanceM = item.distanceM;
  return out;
}

/**
 * Project a domain `Workout` onto the mobile `FizrukWorkout` shape.
 */
function projectWorkout(workout: Workout): FizrukWorkout {
  return {
    id: workout.id,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    note: workout.note ?? "",
    items: workout.items.map(projectWorkoutItem),
    groups: workout.groups,
    warmup: workout.warmup,
    cooldown: workout.cooldown,
  };
}

export interface UseFizrukWorkoutsResult {
  /** Workouts sorted by `startedAt` descending (most recent first). */
  workouts: readonly FizrukWorkout[];
  createWorkout(opts?: { startedAt?: string }): FizrukWorkout;
  updateWorkout(id: string, patch: Partial<FizrukWorkout>): void;
  deleteWorkout(id: string): void;
  /** Re-insert a previously deleted workout (no-op if id already present). */
  restoreWorkout(workout: FizrukWorkout): void;
  /** Mark as ended with the current timestamp. No-op if already ended. */
  endWorkout(id: string): FizrukWorkout | null;
  addItem(workoutId: string, item: Partial<FizrukWorkoutItem>): string | null;
  updateItem(
    workoutId: string,
    itemId: string,
    patch: Partial<FizrukWorkoutItem>,
  ): void;
  removeItem(workoutId: string, itemId: string): void;
}

function readInitialFromCache(): FizrukWorkout[] {
  const cache = getCachedFizrukSqliteState();
  if (cache.refreshedAt === null) return [];
  return cache.workouts.map(projectWorkout);
}

export function useFizrukWorkouts(): UseFizrukWorkoutsResult {
  const [workouts, setWorkouts] =
    useState<FizrukWorkout[]>(readInitialFromCache);

  // Synchronously-tracked mirror of `workouts` so back-to-back mutators
  // within the same React batch (e.g. `createWorkout()` then
  // `addItem(...)`) see each other's effects without waiting for a
  // re-render.
  const stateRef = useRef<FizrukWorkout[]>(workouts);

  // Stage 8 PR #057f-tombstone: overlay workouts from the local SQLite
  // cache once it's warm. State is initialised from the cache (empty
  // until the first refresh) so consumers don't re-render on the first
  // tick when the cache holds the same data.
  const sqliteCacheTick = useFizrukSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = cache.workouts.map(projectWorkout);
    stateRef.current = overlay;
    setWorkouts(overlay);
  }, [sqliteCacheTick]);

  const persist = useCallback(
    (updater: (prev: FizrukWorkout[]) => FizrukWorkout[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;

      const prevDualWrite =
        peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
      const nextDualWrite = {
        ...prevDualWrite,
        workouts: extractWorkoutSnapshots(next),
      };
      try {
        triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
      } catch {
        /* trigger is fire-and-forget — never propagate */
      }

      setWorkouts(next);
    },
    [],
  );

  const createWorkout = useCallback<UseFizrukWorkoutsResult["createWorkout"]>(
    (opts) => {
      const w: FizrukWorkout = {
        id: uid("w"),
        startedAt: opts?.startedAt || new Date().toISOString(),
        endedAt: null,
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      };
      persist((prev) => [w, ...prev]);
      return w;
    },
    [persist],
  );

  const updateWorkout = useCallback<UseFizrukWorkoutsResult["updateWorkout"]>(
    (id, patch) => {
      persist((prev) => {
        const idx = prev.findIndex((w) => w.id === id);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = { ...prev[idx]!, ...patch };
        return next;
      });
    },
    [persist],
  );

  const deleteWorkout = useCallback<UseFizrukWorkoutsResult["deleteWorkout"]>(
    (id) => {
      persist((prev) => {
        const next = prev.filter((w) => w.id !== id);
        return next.length === prev.length ? prev : next;
      });
    },
    [persist],
  );

  const restoreWorkout = useCallback<UseFizrukWorkoutsResult["restoreWorkout"]>(
    (workout) => {
      if (!workout?.id) return;
      persist((prev) => {
        if (prev.some((w) => w.id === workout.id)) return prev;
        const next = [...prev, workout];
        next.sort((a, b) => {
          const at = Date.parse(a?.startedAt || "") || 0;
          const bt = Date.parse(b?.startedAt || "") || 0;
          return at - bt;
        });
        return next;
      });
    },
    [persist],
  );

  const endWorkout = useCallback<UseFizrukWorkoutsResult["endWorkout"]>(
    (id) => {
      const idx = stateRef.current.findIndex((w) => w.id === id);
      if (idx < 0) return null;
      const current = stateRef.current[idx]!;
      if (current.endedAt) return current; // already-ended → silent no-op
      const ended: FizrukWorkout = {
        ...current,
        endedAt: new Date().toISOString(),
      };
      persist((prev) => {
        const i = prev.findIndex((w) => w.id === id);
        if (i < 0 || prev[i]!.endedAt) return prev;
        const next = prev.slice();
        next[i] = ended;
        return next;
      });
      return ended;
    },
    [persist],
  );

  const addItem = useCallback<UseFizrukWorkoutsResult["addItem"]>(
    (workoutId, item) => {
      const itemId = item.id || uid("i");
      // Synchronous existence check via `stateRef` so we can return the
      // generated id (or `null`) without waiting for the React batch.
      if (!stateRef.current.some((w) => w.id === workoutId)) return null;
      persist((prev) => {
        const idx = prev.findIndex((w) => w.id === workoutId);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = {
          ...prev[idx]!,
          items: [
            ...(prev[idx]!.items || []),
            { ...(item as FizrukWorkoutItem), id: itemId },
          ],
        };
        return next;
      });
      return itemId;
    },
    [persist],
  );

  const updateItem = useCallback<UseFizrukWorkoutsResult["updateItem"]>(
    (workoutId, itemId, patch) => {
      persist((prev) => {
        const wIdx = prev.findIndex((w) => w.id === workoutId);
        if (wIdx < 0) return prev;
        const items = prev[wIdx]!.items || [];
        const iIdx = items.findIndex((i) => i.id === itemId);
        if (iIdx < 0) return prev;
        const nextItems = items.slice();
        nextItems[iIdx] = { ...items[iIdx]!, ...patch };
        const next = prev.slice();
        next[wIdx] = { ...prev[wIdx]!, items: nextItems };
        return next;
      });
    },
    [persist],
  );

  const removeItem = useCallback<UseFizrukWorkoutsResult["removeItem"]>(
    (workoutId, itemId) => {
      persist((prev) => {
        const wIdx = prev.findIndex((w) => w.id === workoutId);
        if (wIdx < 0) return prev;
        const items = prev[wIdx]!.items || [];
        if (!items.some((i) => i.id === itemId)) return prev;
        const nextItems = items.filter((i) => i.id !== itemId);
        const nextGroups = (prev[wIdx]!.groups || [])
          .map((g) => ({
            ...g,
            itemIds: (g.itemIds || []).filter((id) => id !== itemId),
          }))
          .filter((g) => (g.itemIds || []).length >= 2);
        const next = prev.slice();
        next[wIdx] = { ...prev[wIdx]!, items: nextItems, groups: nextGroups };
        return next;
      });
    },
    [persist],
  );

  const sorted = useMemo(
    () =>
      [...workouts].sort((a, b) =>
        (b.startedAt || "").localeCompare(a.startedAt || ""),
      ),
    [workouts],
  );

  return {
    workouts: sorted,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    restoreWorkout,
    endWorkout,
    addItem,
    updateItem,
    removeItem,
  };
}
