import { useCallback, useEffect, useState } from "react";
import {
  ROUTINE_EVENT,
  ROUTINE_STORAGE_KEY,
  loadRoutineState,
  setPref,
} from "../lib/routineStorage";
import type { RoutineState } from "../lib/types";

/**
 * Reactive routine state with cross-tab (`storage`) and same-tab
 * (`hub-routine-storage`) sync. Extracted from settings sections that
 * previously duplicated this subscription.
 */
export function useRoutineState() {
  const [routine, setRoutine] = useState<RoutineState>(() =>
    loadRoutineState(),
  );

  useEffect(() => {
    const handler = () => setRoutine(loadRoutineState());
    const storageHandler = (e: StorageEvent) => {
      if (e.key === ROUTINE_STORAGE_KEY || e.key === null) handler();
    };
    window.addEventListener(ROUTINE_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(ROUTINE_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  const updatePref = useCallback((key: string, value: unknown) => {
    setRoutine((s) => setPref(s, key, value));
  }, []);

  return { routine, setRoutine, updatePref };
}
