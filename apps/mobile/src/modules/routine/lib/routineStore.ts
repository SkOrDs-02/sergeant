/**
 * MMKV-backed routine state hook for the mobile app.
 *
 * Mirrors the shape of `apps/web/src/modules/routine/lib/routineStorage.ts`
 * (Phase 5 / PR 2) but on top of MMKV via `@/lib/storage`. Delegates
 * all normalization / reducer logic to `@sergeant/routine-domain` so
 * mobile and web share the exact same `RoutineState` semantics.
 *
 * Scope of this file (Phase 5 / PR 2 — Calendar):
 *  - `loadRoutineState()` + `saveRoutineState()` — raw MMKV I/O with
 *    the shared `ROUTINE_STORAGE_KEY`.
 *  - `useRoutineStore()` — React hook that returns the current state
 *    plus action callbacks for the minimum set of mutations the
 *    Calendar screen needs (toggle completion, bulk-mark day,
 *    set completion note). Habits edit UI / reminders / backup /
 *    delete ship in later PRs.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ROUTINE_STORAGE_KEY,
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
  normalizeRoutineState,
  snapshotHabit as snapshotHabitPure,
  type CreateHabitOptions,
  type Habit,
  type HabitDraftPatch,
  type HabitSnapshot,
  type RoutineState,
} from "@sergeant/routine-domain";
import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { enqueueChange } from "@/sync/enqueue";

/** Читає й нормалізує повний стан Рутини з MMKV. */
export function loadRoutineState(): RoutineState {
  const raw = safeReadLS<unknown>(ROUTINE_STORAGE_KEY, null);
  const merged = normalizeRoutineState(raw);
  const { state, changed } = ensureHabitOrder(merged);
  if (changed) {
    safeWriteLS(ROUTINE_STORAGE_KEY, state);
  }
  return state;
}

/** Записує повний стан Рутини у MMKV. */
export function saveRoutineState(next: RoutineState): boolean {
  return safeWriteLS(ROUTINE_STORAGE_KEY, next);
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
 * React-hook над MMKV: синхронний initial read, підписка на зовнішні
 * записи у той самий ключ через `addOnValueChangedListener`.
 */
export function useRoutineStore(): UseRoutineStoreReturn {
  const [routine, setRoutineState] = useState<RoutineState>(loadRoutineState);

  const refresh = useCallback(() => {
    setRoutineState(loadRoutineState());
  }, []);

  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      if (changedKey === ROUTINE_STORAGE_KEY) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const setRoutine = useCallback((next: RoutineState) => {
    setRoutineState(next);
    saveRoutineState(next);
    enqueueChange(ROUTINE_STORAGE_KEY);
  }, []);

  const toggleHabit = useCallback((habitId: string, dateKey: string) => {
    setRoutineState((prev) => {
      const next = applyToggleHabitCompletion(prev, habitId, dateKey);
      if (next === prev) return prev;
      saveRoutineState(next);
      enqueueChange(ROUTINE_STORAGE_KEY);
      return next;
    });
  }, []);

  const bulkMarkDay = useCallback((dateKey: string) => {
    setRoutineState((prev) => {
      const next = applyMarkAllScheduledHabitsComplete(prev, dateKey);
      if (next === prev) return prev;
      saveRoutineState(next);
      enqueueChange(ROUTINE_STORAGE_KEY);
      return next;
    });
  }, []);

  const setCompletionNote = useCallback(
    (habitId: string, dateKey: string, text: string) => {
      setRoutineState((prev) => {
        const next = applySetCompletionNote(prev, habitId, dateKey, text);
        if (next === prev) return prev;
        saveRoutineState(next);
        enqueueChange(ROUTINE_STORAGE_KEY);
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
      enqueueChange(ROUTINE_STORAGE_KEY);
      return next;
    });
  }, []);

  const updateHabit = useCallback(
    (id: string, patch: HabitDraftPatch | Partial<Habit>) => {
      setRoutineState((prev) => {
        const next = applyUpdateHabit(prev, id, patch);
        if (next === prev) return prev;
        saveRoutineState(next);
        enqueueChange(ROUTINE_STORAGE_KEY);
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
      enqueueChange(ROUTINE_STORAGE_KEY);
      return next;
    });
  }, []);

  const deleteHabit = useCallback((id: string) => {
    setRoutineState((prev) => {
      const next = applyDeleteHabit(prev, id);
      if (next === prev) return prev;
      saveRoutineState(next);
      enqueueChange(ROUTINE_STORAGE_KEY);
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
      enqueueChange(ROUTINE_STORAGE_KEY);
      return next;
    });
  }, []);

  const moveHabitInOrder = useCallback((id: string, delta: number) => {
    setRoutineState((prev) => {
      const next = applyMoveHabitInOrder(prev, id, delta);
      if (next === prev) return prev;
      saveRoutineState(next);
      enqueueChange(ROUTINE_STORAGE_KEY);
      return next;
    });
  }, []);

  const setHabitOrder = useCallback((orderedActiveIds: string[]) => {
    setRoutineState((prev) => {
      const next = applySetHabitOrder(prev, orderedActiveIds);
      if (next === prev) return prev;
      saveRoutineState(next);
      enqueueChange(ROUTINE_STORAGE_KEY);
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
