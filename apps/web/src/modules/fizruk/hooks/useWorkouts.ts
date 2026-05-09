import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChecklistItem,
  Workout,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain/domain";
import {
  parseWorkoutsFromStorage,
  serializeWorkoutsToStorage,
  WORKOUTS_STORAGE_KEY,
} from "../lib/fizrukStorage";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";

/**
 * Window event fired when persisting workouts to `localStorage` throws
 * (quota exceeded, Safari private mode, etc.). `FizrukApp` listens for this
 * and surfaces a persistent `<Banner variant="danger">` so the user can free
 * space or export a backup — mirroring Nutrition's `storageBanner` pattern
 * and Routine's `ROUTINE_STORAGE_ERROR` event.
 */
export const FIZRUK_WORKOUTS_STORAGE_ERROR = "fizruk-workouts-storage-error";

/**
 * @typedef {{ id: string, done: boolean, label: string }} ChecklistItem
 */

/**
 * @typedef {{
 *   id: string,
 *   exerciseId: string,
 *   nameUk: string,
 *   primaryGroup: string,
 *   musclesPrimary: string[],
 *   musclesSecondary: string[],
 *   type: 'strength'|'distance'|'time',
 *   sets?: Array<{ weightKg: number, reps: number }>,
 *   durationSec?: number,
 *   distanceM?: number,
 * }} WorkoutItem
 * A single exercise entry within a workout session.
 */

/**
 * @typedef {{
 *   id: string,
 *   startedAt: string,
 *   endedAt: string|null,
 *   items: WorkoutItem[],
 *   groups: Array<{ id: string, itemIds: string[] }>,
 *   warmup: ChecklistItem[]|null,
 *   cooldown: ChecklistItem[]|null,
 *   note: string,
 * }} Workout
 * A complete workout session.
 */

/**
 * Generate a unique ID with a given prefix.
 * @param {string} [prefix]
 * @returns {string}
 */
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_WARMUP_ITEMS = [
  { label: "Загальна розминка (5-10 хв легкого кардіо)" },
  {
    label: "Суглобова розминка (шия, плечі, лікті, зап'ястки, стегна, коліна)",
  },
  { label: "Специфічна розминка до тренування (легкі підходи)" },
];

const DEFAULT_COOLDOWN_ITEMS = [
  { label: "Статична розтяжка опрацьованих м'язів (2-3 хв)" },
  { label: "Дихальні вправи / заспокоєння пульсу" },
  { label: "Пінний ролик або масаж (за потреби)" },
];

/**
 * Build a default warmup checklist with generated IDs.
 */
export function makeDefaultWarmup(): ChecklistItem[] {
  return DEFAULT_WARMUP_ITEMS.map((x) => ({
    id: uid("wm"),
    ...x,
    done: false,
  }));
}

/**
 * Build a default cooldown checklist with generated IDs.
 */
export function makeDefaultCooldown(): ChecklistItem[] {
  return DEFAULT_COOLDOWN_ITEMS.map((x) => ({
    id: uid("cd"),
    ...x,
    done: false,
  }));
}

/**
 * Hook for managing the list of workout sessions.
 * Persists to localStorage under `WORKOUTS_STORAGE_KEY`.
 *
 * @returns {{
 *   workouts: Workout[],
 *   loaded: boolean,
 *   createWorkout: () => Workout,
 *   createWorkoutWithTimes: (opts: { startedAt: string }) => Workout,
 *   updateWorkout: (id: string, patch: Partial<Workout>) => void,
 *   deleteWorkout: (id: string) => void,
 *   restoreWorkout: (workout: Workout) => void,
 *   endWorkout: (id: string) => Workout|null,
 *   addItem: (workoutId: string, item: Partial<WorkoutItem>) => string,
 *   updateItem: (workoutId: string, itemId: string, patch: Partial<WorkoutItem>) => void,
 *   removeItem: (workoutId: string, itemId: string) => void,
 * }}
 */
export function useWorkouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loaded, setLoaded] = useState(false);
  const sqliteCacheTick = useFizrukSqliteReadTick();

  useEffect(() => {
    // `safeReadStringLS` глитає будь-які read-failure-и (private mode,
    // disabled storage, throwing access) — так само, як попередній
    // inline try/catch, тільки централізовано в `@shared/lib/storage`.
    const raw = safeReadStringLS(WORKOUTS_STORAGE_KEY, null);
    const parsed = parseWorkoutsFromStorage(raw);
    // Storage parser returns `unknown[]` (the persisted blob is loose):
    // it's the boundary between untyped JSON and typed runtime state, so
    // we trust the shape here. Each consumer already guards optional
    // fields (`w.items || []`, `w.endedAt`, etc.).
    if (Array.isArray(parsed)) setWorkouts(parsed as Workout[]);
    setLoaded(true);
  }, []);

  // Stage 8 PR #057f-flag: read overlay тепер unconditional (flag
  // dropped). Overlay workouts from the local SQLite cache once it's
  // warm. LS reads above stay as a synchronous fallback so the first
  // paint never blocks on SQLite.
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setWorkouts(cache.workouts);
  }, [sqliteCacheTick]);

  /**
   * Persist an updated workouts array to localStorage.
   * Accepts either a new array or an updater function.
   */
  const persist = useCallback(
    (nextOrUpdater: Workout[] | ((prev: Workout[]) => Workout[])) => {
      setWorkouts((prev) => {
        const next =
          typeof nextOrUpdater === "function"
            ? nextOrUpdater(prev)
            : nextOrUpdater;
        const ok = safeWriteLS(
          WORKOUTS_STORAGE_KEY,
          serializeWorkoutsToStorage(next),
        );
        if (!ok) {
          // Surface quota/private-mode failures to the UI instead of silently
          // losing data. We keep `next` in memory so the current session does
          // not visibly reset — the banner prompts the user to act.
          // `safeWriteLS` глитає specific Error.message (quota / private
          // mode), тож передаємо generic reason — банер сам формує текст.
          try {
            window.dispatchEvent(
              new CustomEvent(FIZRUK_WORKOUTS_STORAGE_ERROR, {
                detail: { message: "сховище недоступне або переповнене" },
              }),
            );
          } catch {
            /* dispatchEvent can throw in exotic embeddings — ignore */
          }
        }
        return next;
      });
    },
    [],
  );

  /**
   * Create a new workout session starting now and add it to the list.
   * @returns {Workout} The newly created workout.
   */
  const createWorkout = useCallback((): Workout => {
    const w: Workout = {
      id: uid("w"),
      startedAt: new Date().toISOString(),
      endedAt: null,
      items: [],
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
    };
    persist((prev: Workout[]) => [w, ...prev]);
    return w;
  }, [persist]);

  /**
   * Create a new workout session with a custom start time.
   * @param {{ startedAt: string }} opts - ISO start timestamp.
   * @returns {Workout} The newly created workout.
   */
  const createWorkoutWithTimes = useCallback(
    ({ startedAt }: { startedAt: string }): Workout => {
      const w: Workout = {
        id: uid("w"),
        startedAt: startedAt || new Date().toISOString(),
        endedAt: null,
        items: [],
        groups: [],
        warmup: null,
        cooldown: null,
        note: "",
      };
      persist((prev: Workout[]) => [w, ...prev]);
      return w;
    },
    [persist],
  );

  /**
   * Mark a workout as ended with the current timestamp.
   * If the workout is already ended, returns it unchanged.
   * @param {string} id - Workout ID.
   * @returns {Workout|null} The updated (or already-ended) workout, or null.
   */
  const endWorkout = useCallback(
    (id: string): Workout | null => {
      const nowIso = new Date().toISOString();
      let ended: Workout | null = null;
      persist((prev: Workout[]) =>
        prev.map((w: Workout): Workout => {
          if (w.id !== id) return w;
          if (w.endedAt) {
            ended = w;
            return w;
          }
          ended = { ...w, endedAt: nowIso };
          return ended;
        }),
      );
      return ended;
    },
    [persist],
  );

  /**
   * Apply a partial update to a workout.
   * @param {string} id - Workout ID.
   * @param {Partial<Workout>} patch - Fields to merge.
   */
  const updateWorkout = useCallback(
    (id: string, patch: Partial<Workout>) => {
      persist((prev: Workout[]) =>
        prev.map((w: Workout) => (w.id === id ? { ...w, ...patch } : w)),
      );
    },
    [persist],
  );

  /**
   * Permanently delete a workout by ID.
   * @param {string} id - Workout ID.
   */
  const deleteWorkout = useCallback(
    (id: string) => {
      persist((prev: Workout[]) => prev.filter((w: Workout) => w.id !== id));
    },
    [persist],
  );

  /**
   * Re-insert a previously deleted workout, preserving chronological order by
   * `startedAt`. Used by undo flows after `deleteWorkout`.
   * @param {Workout} workout
   */
  const restoreWorkout = useCallback(
    (workout: Workout) => {
      if (!workout?.id) return;
      persist((prev: Workout[]) => {
        if (prev.some((w: Workout) => w.id === workout.id)) return prev;
        const next = [...prev, workout];
        next.sort((a: Workout, b: Workout) => {
          const at = Date.parse(a?.startedAt || "") || 0;
          const bt = Date.parse(b?.startedAt || "") || 0;
          return at - bt;
        });
        return next;
      });
    },
    [persist],
  );

  /**
   * Add an exercise item to a workout. Appends to the items list so that the
   * stored order matches the order in which the user (or a template) added
   * exercises — users read the workout log top-to-bottom chronologically.
   * @param {string} workoutId
   * @param {Partial<WorkoutItem>} item - Item data; `id` is generated if absent.
   * @returns {string} The generated item ID.
   */
  const addItem = useCallback(
    (workoutId: string, item: Partial<WorkoutItem>): string => {
      const itemId = item.id || uid("i");
      persist((prev: Workout[]) =>
        prev.map((w: Workout): Workout => {
          if (w.id !== workoutId) return w;
          return {
            ...w,
            items: [...(w.items || []), { id: itemId, ...item } as WorkoutItem],
          };
        }),
      );
      return itemId;
    },
    [persist],
  );

  /**
   * Apply a partial update to a specific exercise item within a workout.
   * @param {string} workoutId
   * @param {string} itemId
   * @param {Partial<WorkoutItem>} patch
   */
  const updateItem = useCallback(
    (workoutId: string, itemId: string, patch: Partial<WorkoutItem>) => {
      persist((prev: Workout[]) =>
        prev.map((w: Workout): Workout => {
          if (w.id !== workoutId) return w;
          return {
            ...w,
            items: (w.items || []).map((i: WorkoutItem) =>
              i.id === itemId ? { ...i, ...patch } : i,
            ),
          };
        }),
      );
    },
    [persist],
  );

  /**
   * Remove an exercise item from a workout.
   * Also cleans up any superset groups that referenced the item.
   * @param {string} workoutId
   * @param {string} itemId
   */
  const removeItem = useCallback(
    (workoutId: string, itemId: string) => {
      persist((prev: Workout[]) =>
        prev.map((w: Workout): Workout => {
          if (w.id !== workoutId) return w;
          const newGroups = (w.groups || [])
            .map((g: WorkoutGroup) => ({
              ...g,
              itemIds: (g.itemIds || []).filter((id: string) => id !== itemId),
            }))
            .filter((g: WorkoutGroup) => (g.itemIds || []).length >= 2);
          return {
            ...w,
            items: (w.items || []).filter((i: WorkoutItem) => i.id !== itemId),
            groups: newGroups,
          };
        }),
      );
    },
    [persist],
  );

  /** Workouts sorted by `startedAt` descending (most recent first). */
  const sorted = useMemo(() => {
    return [...workouts].sort((a, b) =>
      (b.startedAt || "").localeCompare(a.startedAt || ""),
    );
  }, [workouts]);

  return {
    workouts: sorted,
    loaded,
    createWorkout,
    createWorkoutWithTimes,
    updateWorkout,
    deleteWorkout,
    restoreWorkout,
    endWorkout,
    addItem,
    updateItem,
    removeItem,
  };
}
