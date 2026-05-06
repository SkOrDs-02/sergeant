/**
 * `useFizrukWorkouts` — mobile hook for the Fizruk **Workouts** list.
 *
 * Owns the persisted list of workout sessions under
 * `STORAGE_KEYS.FIZRUK_WORKOUTS` (`fizruk_workouts_v1`) — the same
 * MMKV slot that the web hook
 * `apps/web/src/modules/fizruk/hooks/useWorkouts.ts` writes to.
 *
 * The shape mirrors the web port (workouts hold `items`, `groups`,
 * optional `warmup` / `cooldown` checklists, a free-form `note`, and
 * lifecycle timestamps `startedAt` / `endedAt`). The hook is kept
 * intentionally generic — pure UI affordances live in their callers —
 * but every mutator routes through a single `persist()` that writes
 * to MMKV and re-renders consumers.
 *
 * No-op guard: when a mutator is asked to operate on an unknown id
 * (e.g. `updateWorkout("missing-id", …)`) or when an `endWorkout`
 * call hits an already-ended session, the in-memory state stays
 * referentially identical and the MMKV write is skipped. This
 * matches the existing `useMeasurements` / `usePrograms` hooks and the
 * `routine-domain` reducer pattern (see Task #5).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain/domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";

import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadGate } from "../lib/sqliteReadGate";

const STORAGE_KEY = STORAGE_KEYS.FIZRUK_WORKOUTS;

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

function readWorkouts(): FizrukWorkout[] {
  const raw = safeReadLS<unknown>(STORAGE_KEY, []);
  return Array.isArray(raw) ? (raw as FizrukWorkout[]) : [];
}

/**
 * Project a domain `WorkoutItem` (from `@sergeant/fizruk-domain`) onto
 * the loose mobile `FizrukWorkoutItem` shape used by the screen +
 * selectors. The two shapes overlap on every required field — the
 * mobile type is intentionally permissive (every field optional, plus
 * an index signature) so the projection is a 1:1 copy.
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
 * Used to overlay the SQLite-backed cache values into a hook surface
 * shaped like the existing MMKV blob.
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

export function useFizrukWorkouts(): UseFizrukWorkoutsResult {
  const [workouts, setWorkouts] = useState<FizrukWorkout[]>(readWorkouts);

  // Synchronously-tracked mirror of `workouts` so back-to-back mutators
  // within the same React batch (e.g. `createWorkout()` then
  // `addItem(...)`) see each other's effects without waiting for a
  // re-render. Critical for the no-op guards: we have to know the
  // *current* state at call time to decide whether anything actually
  // changed (and therefore whether to skip the MMKV write).
  const stateRef = useRef<FizrukWorkout[]>(workouts);

  // React to out-of-band writes (cloud-sync pull, settings reset, etc).
  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey !== STORAGE_KEY) return;
      const fresh = readWorkouts();
      stateRef.current = fresh;
      setWorkouts(fresh);
    });
    return () => sub.remove();
  }, []);

  // Stage 4 PR #029a: under `feature.fizruk.sqlite_v2.read_sqlite`,
  // overlay workouts from the local SQLite cache once it's warm. The
  // MMKV first-paint read above stays as a synchronous fallback so the
  // first paint never blocks on SQLite.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useFizrukSqliteReadGate();
  useEffect(() => {
    if (!sqliteReadEnabled) return;
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    const overlay = cache.workouts.map(projectWorkout);
    stateRef.current = overlay;
    setWorkouts(overlay);
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const persist = useCallback(
    (updater: (prev: FizrukWorkout[]) => FizrukWorkout[]) => {
      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      stateRef.current = next;
      safeWriteLS(STORAGE_KEY, next);
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
