/**
 * SQLite-backed routine state hook for the mobile app.
 *
 * Stage 8 PR #057r-tombstone-mobile of `docs/planning/storage-roadmap.md`
 * — the MMKV write path is retired. `loadRoutineState()` overlays the
 * cached SQLite full-state onto `defaultRoutineState()` and
 * `saveRoutineState()` triggers the dual-write pipeline (the same one
 * Stage 10 PR #070r-mobile-dualwrite uses to mirror habits / tags /
 * categories / prefs / pushups / habitOrder / completionNotes /
 * completions to the 7 routine_* SQLite tables). Residual MMKV data
 * is drained on boot once via `importRoutineResidualFromMmkv`
 * (`./residualImport.ts`) and then the legacy `ROUTINE_STORAGE_KEY`
 * MMKV slot is deleted.
 *
 * Mobile mirror of `apps/web/src/modules/routine/lib/routineStorage.ts`
 * (PR #057r-tombstone web). The exported function names and the
 * `useRoutineStore` hook surface stay unchanged so call sites across
 * the mobile app keep working — only the source of truth moved from
 * MMKV to the SQLite cache.
 */

import { useCallback, useEffect, useState } from "react";
import {
  applyCreateHabit,
  applyDeleteHabit,
  applyMarkAllScheduledHabitsComplete,
  applyMoveHabitInOrder,
  applyRestoreHabit,
  applySetCompletionNote,
  applySetHabitArchived,
  applySetHabitOrder,
  applyToggleHabitCompletion,
  applyUpdateHabit,
  defaultRoutineState,
  ensureHabitOrder,
  snapshotHabit as snapshotHabitPure,
  type CreateHabitOptions,
  type Habit,
  type HabitDraftPatch,
  type HabitSnapshot,
  type RoutineState,
} from "@sergeant/routine-domain";
import { triggerRoutineDualWrite } from "./dualWrite";
import {
  getCachedSqliteCompletions,
  getCachedSqliteRoutineState,
  setCachedSqliteCompletions,
  setCachedSqliteRoutineState,
} from "./sqliteReader";
import {
  notifyRoutineSqliteCacheRefresh,
  useRoutineSqliteReadTick,
} from "./sqliteReadGate";

/**
 * Returns the routine state assembled from the SQLite warm caches.
 *
 * Stage 8 PR #057r-tombstone-mobile — MMKV read is retired. When
 * `bootRoutineSqliteReadPath()` has populated
 * `getCachedSqliteRoutineState()` we overlay all 7 entity slices
 * (habits / tags / categories / prefs / pushups / habitOrder /
 * completionNotes) onto a fresh `defaultRoutineState()`. The
 * `getCachedSqliteCompletions()` cache wins for `completions` (it
 * stays as source-of-truth for the `routine_entries` reader so the
 * rest of the codebase keeps its O(1) lookup shape).
 *
 * If neither cache is warm yet (pre-boot window — auth not resolved,
 * SQLite migration in flight, residual import running), returns
 * `defaultRoutineState()` so first-paint is deterministic. The
 * `useRoutineStore` hook re-renders via `useRoutineSqliteReadTick()`
 * once the boot wiring fires `notifyRoutineSqliteCacheRefresh()`.
 */
export function loadRoutineState(): RoutineState {
  const base = defaultRoutineState();

  const fullState = getCachedSqliteRoutineState();
  const completionsCache = getCachedSqliteCompletions();

  let next: RoutineState = base;

  if (fullState.refreshedAt !== null) {
    next = {
      ...base,
      habits: fullState.habits,
      tags: fullState.tags,
      categories: fullState.categories,
      prefs: { ...base.prefs, ...fullState.prefs },
      pushupsByDate: fullState.pushupsByDate,
      habitOrder: fullState.habitOrder,
      completionNotes: fullState.completionNotes,
    };
  }

  if (completionsCache.refreshedAt !== null) {
    next = { ...next, completions: completionsCache.completions };
  }

  // Idempotent: ensure the order array is canonical before handing
  // state to React. The dual-write layer mirrors the canonical order
  // back into SQLite via `saveRoutineState` if a normalization
  // happens to produce a change.
  const { state, changed } = ensureHabitOrder(next);
  if (changed) {
    saveRoutineState(state);
  }
  return state;
}

/**
 * Snapshot the currently-cached routine state. Mirrors the structure
 * of {@link loadRoutineState} without the `ensureHabitOrder` re-save
 * that the loader performs — used by {@link saveRoutineState} as the
 * `prev` argument to `diffRoutineDualWriteOps`.
 */
function readCachedRoutineState(): RoutineState {
  const base = defaultRoutineState();
  const fullState = getCachedSqliteRoutineState();
  const completionsCache = getCachedSqliteCompletions();

  let prev: RoutineState = base;
  if (fullState.refreshedAt !== null) {
    prev = {
      ...base,
      habits: fullState.habits,
      tags: fullState.tags,
      categories: fullState.categories,
      prefs: { ...base.prefs, ...fullState.prefs },
      pushupsByDate: fullState.pushupsByDate,
      habitOrder: fullState.habitOrder,
      completionNotes: fullState.completionNotes,
    };
  }
  if (completionsCache.refreshedAt !== null) {
    prev = { ...prev, completions: completionsCache.completions };
  }
  return prev;
}

/**
 * Persist routine state via the dual-write pipeline.
 *
 * Stage 8 PR #057r-tombstone-mobile — no MMKV write. The function
 * (a) snapshots the previous state from the SQLite warm cache so
 * `diffRoutineDualWriteOps` can emit only the deltas, (b) updates
 * the warm caches synchronously so the next `loadRoutineState()`
 * sees the change without waiting for the async dual-write round
 * trip, (c) fires the fire-and-forget dual-write trigger, and
 * (d) bumps the `sqliteReadGate` tick so `useRoutineStore`
 * subscribers re-render with the latest snapshot. Returns `true`
 * whenever the trigger is dispatched — SQLite latency / failures
 * are observed via dual-write telemetry, not the boolean return.
 *
 * Stage 8 PR #056r dropped the `feature.routine.sqlite_v2.dual_write`
 * flag — the dual-write fires whenever a context is registered.
 */
export function saveRoutineState(next: RoutineState): boolean {
  try {
    const prev = readCachedRoutineState();

    // Write-through: update the warm caches synchronously so the next
    // `loadRoutineState()` reflects the change without waiting for
    // the async dual-write → SQLite round trip. The dual-write is
    // still authoritative on boot (`refreshSqliteRoutineState`
    // overwrites these caches with the canonical SQLite read).
    setCachedSqliteRoutineState({
      habits: next.habits,
      tags: next.tags,
      categories: next.categories,
      prefs: next.prefs,
      pushupsByDate: next.pushupsByDate,
      habitOrder: next.habitOrder,
      completionNotes: next.completionNotes,
    });
    setCachedSqliteCompletions(next.completions);

    triggerRoutineDualWrite(prev, next);
    notifyRoutineSqliteCacheRefresh();
    return true;
  } catch {
    return false;
  }
}

export interface UseRoutineStoreReturn {
  routine: RoutineState;
  /** Примусово перечитати стан з MMKV (після зовнішнього запису). */
  refresh: () => void;
  /** Локально перезаписати весь стан (в обхід reducer-ів). */
  setRoutine: (next: RoutineState) => void;
  /** Тап по звичці у список дня — перемкнути відмітку на `dateKey`. */
  toggleHabit: (habitId: string, dateKey: string) => void;
  /** "Зробив усе" для дня — позначити кожну планову звичку виконаною. */
  bulkMarkDay: (dateKey: string) => void;
  /** Зберегти / стерти нотатку до відмітки. */
  setCompletionNote: (habitId: string, dateKey: string, text: string) => void;
  /** Створити нову звичку з patch-ем форми. */
  createHabit: (patch: Partial<CreateHabitOptions>) => void;
  /** Часткове оновлення звички за id. */
  updateHabit: (id: string, patch: HabitDraftPatch | Partial<Habit>) => void;
  /** В архів / з архіву. */
  setHabitArchived: (id: string, archived: boolean) => void;
  /** Остаточне видалення звички разом із completions / order / notes. */
  deleteHabit: (id: string) => void;
  /**
   * Повний знімок звички (сама звичка + completions + notes + позиція)
   * для undo-toast. Повертає `null`, якщо звичка не знайдена.
   */
  snapshotHabit: (id: string) => HabitSnapshot | null;
  /**
   * Відновити звичку зі знімка, отриманого `snapshotHabit`. Ідемпотентно:
   * якщо id вже існує — no-op.
   */
  restoreHabit: (snapshot: HabitSnapshot | null) => void;
  /** Перемістити звичку в списку на `delta` позицій (-1 = вгору). */
  moveHabitInOrder: (id: string, delta: number) => void;
  /**
   * Повністю переписати порядок активних звичок (наприклад після
   * drag-and-drop). Архівні id та id неіснуючих звичок ігноруються —
   * нормалізація делегується `applySetHabitOrder` з domain-пакета.
   */
  setHabitOrder: (orderedActiveIds: string[]) => void;
}

/**
 * React-hook над SQLite warm cache: синхронний initial read,
 * підписка на cache-refresh tick через `useRoutineSqliteReadTick`.
 *
 * Stage 8 PR #057r-tombstone-mobile — listens to
 * `notifyRoutineSqliteCacheRefresh()` ticks (fired by
 * `useRoutineSqliteReadBoot` after warm-up and by every
 * `saveRoutineState` for write-through reactivity) instead of the
 * MMKV `addOnValueChangedListener` that backed the legacy LS read.
 */
export function useRoutineStore(): UseRoutineStoreReturn {
  const [routine, setRoutineState] = useState<RoutineState>(loadRoutineState);

  const refresh = useCallback(() => {
    setRoutineState(loadRoutineState());
  }, []);

  // Re-read whenever the SQLite warm cache tick advances (boot
  // warm-up or write-through after a `saveRoutineState`). The tick
  // hook bumps via `useSyncExternalStore` so React schedules a
  // re-render automatically; the `useEffect` below pulls the fresh
  // snapshot into local state for downstream consumers.
  const cacheTick = useRoutineSqliteReadTick();
  useEffect(() => {
    refresh();
  }, [cacheTick, refresh]);

  const setRoutine = useCallback((next: RoutineState) => {
    setRoutineState(next);
    saveRoutineState(next);
  }, []);

  const toggleHabit = useCallback((habitId: string, dateKey: string) => {
    setRoutineState((prev) => {
      const next = applyToggleHabitCompletion(prev, habitId, dateKey);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  const bulkMarkDay = useCallback((dateKey: string) => {
    setRoutineState((prev) => {
      const next = applyMarkAllScheduledHabitsComplete(prev, dateKey);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  const setCompletionNote = useCallback(
    (habitId: string, dateKey: string, text: string) => {
      setRoutineState((prev) => {
        const next = applySetCompletionNote(prev, habitId, dateKey, text);
        if (next === prev) return prev;
        saveRoutineState(next);
        return next;
      });
    },
    [],
  );

  const createHabit = useCallback((patch: Partial<CreateHabitOptions>) => {
    setRoutineState((prev) => {
      const next = applyCreateHabit(prev, patch);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  const updateHabit = useCallback(
    (id: string, patch: HabitDraftPatch | Partial<Habit>) => {
      setRoutineState((prev) => {
        const next = applyUpdateHabit(prev, id, patch);
        if (next === prev) return prev;
        saveRoutineState(next);
        return next;
      });
    },
    [],
  );

  const setHabitArchived = useCallback((id: string, archived: boolean) => {
    setRoutineState((prev) => {
      const next = applySetHabitArchived(prev, id, archived);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setRoutineState((prev) => {
      const next = applyDeleteHabit(prev, id);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  // Тримаємо в state-getter-стилі: snapshotHabit читає поточний routine.
  // Не реактивний (useCallback з deps на routine), але стабільний у межах
  // одного рендеру. Це OK — snapshot треба зробити в момент видалення,
  // _до_ виклику deleteHabit.
  const snapshotHabit = useCallback(
    (id: string): HabitSnapshot | null => snapshotHabitPure(routine, id),
    [routine],
  );

  const restoreHabit = useCallback((snapshot: HabitSnapshot | null) => {
    setRoutineState((prev) => {
      const next = applyRestoreHabit(prev, snapshot);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  const moveHabitInOrder = useCallback((id: string, delta: number) => {
    setRoutineState((prev) => {
      const next = applyMoveHabitInOrder(prev, id, delta);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  const setHabitOrder = useCallback((orderedActiveIds: string[]) => {
    setRoutineState((prev) => {
      const next = applySetHabitOrder(prev, orderedActiveIds);
      if (next === prev) return prev;
      saveRoutineState(next);
      return next;
    });
  }, []);

  return {
    routine,
    refresh,
    setRoutine,
    toggleHabit,
    bulkMarkDay,
    setCompletionNote,
    createHabit,
    updateHabit,
    setHabitArchived,
    deleteHabit,
    snapshotHabit,
    restoreHabit,
    moveHabitInOrder,
    setHabitOrder,
  };
}

// Re-export for consumers that want the canonical default without a
// second `@sergeant/routine-domain` import.
export { defaultRoutineState };
