import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChecklistItem,
  Workout,
  WorkoutGroup,
  WorkoutItem,
} from "@sergeant/fizruk-domain/domain";
import { triggerFizrukDualWrite } from "../lib/dualWrite/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractWorkoutSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

/**
 * Window event fired when persisting workouts fails. Kept for backwards
 * compatibility with the `<StorageErrorBanner>` listener — Stage 8 PR
 * #057f-tombstone makes SQLite the only sink, so this event is now
 * dispatched only when the dual-write context is unavailable (typically
 * pre-auth) and we have no place to persist mutations to.
 */
export const FIZRUK_WORKOUTS_STORAGE_ERROR = "fizruk-workouts-storage-error";

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

/** Build a default warmup checklist with generated IDs. */
export function makeDefaultWarmup(): ChecklistItem[] {
  return DEFAULT_WARMUP_ITEMS.map((x) => ({
    id: uid("wm"),
    ...x,
    done: false,
  }));
}

/** Build a default cooldown checklist with generated IDs. */
export function makeDefaultCooldown(): ChecklistItem[] {
  return DEFAULT_COOLDOWN_ITEMS.map((x) => ({
    id: uid("cd"),
    ...x,
    done: false,
  }));
}

/**
 * Hook for managing the list of workout sessions.
 *
 * Stage 8 PR #057f-tombstone: state is initialised from the SQLite
 * warm cache (empty `[]` until `useFizrukSqliteReadBoot` finishes)
 * and re-overlaid whenever the cache ticks. Mutations call
 * `triggerFizrukDualWrite` directly (no LS round-trip).
 */
export function useWorkouts() {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [workouts, setWorkouts] = useState<Workout[]>(() => {
    const cache = getCachedFizrukSqliteState();
    return cache.refreshedAt === null ? [] : cache.workouts;
  });
  const [loaded, setLoaded] = useState(() => {
    return getCachedFizrukSqliteState().refreshedAt !== null;
  });

  // Stage 8 PR #057f-tombstone: overlay workouts from the local SQLite
  // cache once it's warm. The hook exposes `loaded=true` after the
  // first cache refresh so consumers can distinguish "boot in flight"
  // from "boot complete with empty state".
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setWorkouts(cache.workouts);
    setLoaded(true);
  }, [sqliteCacheTick]);

  /**
   * Persist an updated workouts array. Stage 8 PR #057f-tombstone: the
   * SQLite-backed dual-write pipeline is the only sink — LS writes are
   * gone. Pre-auth (no dual-write context) the call is a silent no-op
   * on the persistence side, but the React state still updates so the
   * pending UI reflects the change until the boot wires up the
   * context.
   */
  const persist = useCallback(
    (nextOrUpdater: Workout[] | ((prev: Workout[]) => Workout[])) => {
      setWorkouts((prevState) => {
        const next =
          typeof nextOrUpdater === "function"
            ? nextOrUpdater(prevState)
            : nextOrUpdater;

        const prevDualWrite =
          peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
        const nextDualWrite = {
          ...prevDualWrite,
          workouts: extractWorkoutSnapshots(next),
        };
        try {
          triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
        } catch (err) {
          // The trigger is fire-and-forget — it should never throw, but
          // surface unexpected sync failures via the existing banner so
          // the user knows the change did not persist.
          try {
            window.dispatchEvent(
              new CustomEvent(FIZRUK_WORKOUTS_STORAGE_ERROR, {
                detail: {
                  message:
                    err instanceof Error
                      ? err.message
                      : "не вдалося зберегти сесію",
                },
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

  const updateWorkout = useCallback(
    (id: string, patch: Partial<Workout>) => {
      persist((prev: Workout[]) =>
        prev.map((w: Workout) => (w.id === id ? { ...w, ...patch } : w)),
      );
    },
    [persist],
  );

  const deleteWorkout = useCallback(
    (id: string) => {
      persist((prev: Workout[]) => prev.filter((w: Workout) => w.id !== id));
    },
    [persist],
  );

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
