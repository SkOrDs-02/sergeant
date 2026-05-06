import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { safeRemoveLS, safeWriteLS } from "@shared/lib/storage/storage";
import { ACTIVE_WORKOUT_KEY, type Workout } from "@sergeant/fizruk-domain";
import type { RestTimerState } from "./useFizrukRestSound";
import type { WorkoutsView } from "../pages/Workouts.types";

const VIEW_FROM_SESSION_KEY = "fizruk_workouts_mode";

/**
 * Persist `activeWorkoutId` into local storage so a refresh keeps the
 * user inside the same session. Set-to-`null` removes the key.
 */
export function useActiveWorkoutIdPersistence(
  activeWorkoutId: string | null,
): void {
  useEffect(() => {
    if (!activeWorkoutId) safeRemoveLS(ACTIVE_WORKOUT_KEY);
    else safeWriteLS(ACTIVE_WORKOUT_KEY, activeWorkoutId);
  }, [activeWorkoutId]);
}

/**
 * Clear a stale `activeWorkoutId` that no longer matches any workout
 * (e.g. the workout was deleted on another device before sync).
 */
export function useStaleActiveWorkoutCleanup(
  workoutsLoaded: boolean,
  workouts: readonly Workout[],
  activeWorkoutId: string | null,
  setActiveWorkoutId: Dispatch<SetStateAction<string | null>>,
): void {
  useEffect(() => {
    if (!workoutsLoaded || !activeWorkoutId) return;
    if (!workouts.some((w) => w.id === activeWorkoutId)) {
      setActiveWorkoutId(null);
    }
  }, [workoutsLoaded, activeWorkoutId, workouts, setActiveWorkoutId]);
}

/**
 * Restore `view` from a one-shot `sessionStorage` flag set by other
 * surfaces ("open Templates" / "open Journal" deep-links). The flag
 * is consumed (cleared) on read so a refresh reverts to "home".
 */
export function useWorkoutsViewFromSession(
  setView: (v: WorkoutsView) => void,
): void {
  useEffect(() => {
    try {
      const m = sessionStorage.getItem(VIEW_FROM_SESSION_KEY);
      if (m === "templates") {
        setView("templates");
        sessionStorage.removeItem(VIEW_FROM_SESSION_KEY);
      } else if (m === "log") {
        setView("log");
        sessionStorage.removeItem(VIEW_FROM_SESSION_KEY);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; setView identity is stable
  }, []);
}

/**
 * Tick the rest timer once per second; when `remaining` reaches 0
 * call `markCompletedNaturally` so the rest-sound hook can play the
 * end-cue, then clear the timer.
 */
export function useRestTimerCountdown(
  restTimer: RestTimerState | null,
  setRestTimer: Dispatch<SetStateAction<RestTimerState | null>>,
  markCompletedNaturally: () => void,
): void {
  useEffect(() => {
    if (!restTimer || restTimer.remaining <= 0) return;
    const id = setInterval(() => {
      setRestTimer((r) => {
        if (!r || r.remaining <= 1) {
          markCompletedNaturally();
          return null;
        }
        return { ...r, remaining: r.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [restTimer, markCompletedNaturally, setRestTimer]);
}

/**
 * Re-render the active-workout duration once per second while the
 * session is unfinished. Re-subscribes only when the active workout
 * `id` or its `endedAt` changes — full workout-object churn (set
 * edits, etc.) doesn't restart the interval.
 */
export function useLiveWorkoutTick(
  activeWorkout: Workout | null,
  setNow: Dispatch<SetStateAction<number>>,
): void {
  useEffect(
    () => {
      if (!activeWorkout || activeWorkout.endedAt) return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- достатньо id/endedAt; повний об’єкт workout змінюється часто
    [activeWorkout?.id, activeWorkout?.endedAt],
  );
}
