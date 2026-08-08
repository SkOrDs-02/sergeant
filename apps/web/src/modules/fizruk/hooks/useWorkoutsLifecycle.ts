import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  safeReadStringSS,
  safeRemoveLS,
  safeRemoveSS,
  safeWriteLS,
} from "@shared/lib/storage/storage";
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
 * Options for `useStaleActiveWorkoutCleanup`.
 */
export interface StaleActiveWorkoutCleanupOptions {
  /**
   * True when the caller is a route that owns a specific workout id
   * (`/fizruk/workout/<id>` — `Workouts.tsx` rendered with `workoutId`).
   * Disables the two "home" behaviours that don't make sense once the
   * URL has already picked a workout:
   *  - auto-adopting the single unfinished workout into `activeWorkoutId`
   *    when none is selected;
   *  - clearing `activeWorkoutId` just because the selected workout has
   *    `endedAt` set.
   * Without this flag, a route-owned view of a *finished* workout used to
   * self-clear right after «Завершити» (the effect ran, saw `endedAt`,
   * and nulled the id) — the route then rendered a generic
   * "not found" dead-end instead of the read-only summary (02-A).
   * A genuinely missing workout (deleted, bad id) still clears — that
   * branch does not check this flag.
   */
  routeOwnsWorkoutId?: boolean;
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
  options?: StaleActiveWorkoutCleanupOptions,
): void {
  const routeOwnsWorkoutId = options?.routeOwnsWorkoutId ?? false;
  useEffect(() => {
    if (!workoutsLoaded) return;
    if (!activeWorkoutId) {
      if (routeOwnsWorkoutId) return;
      const unfinished = workouts.find((workout) => !workout.endedAt);
      if (unfinished) setActiveWorkoutId(unfinished.id);
      return;
    }
    const selected = workouts.find((workout) => workout.id === activeWorkoutId);
    if (!selected) {
      setActiveWorkoutId(null);
      return;
    }
    if (selected.endedAt && !routeOwnsWorkoutId) {
      setActiveWorkoutId(null);
    }
  }, [
    workoutsLoaded,
    activeWorkoutId,
    workouts,
    setActiveWorkoutId,
    routeOwnsWorkoutId,
  ]);
}

/**
 * Restore `view` from a one-shot `sessionStorage` flag set by other
 * surfaces ("open Templates" / "open Journal" deep-links). The flag
 * is consumed (cleared) on read so a refresh reverts to "home".
 */
export function useWorkoutsViewFromSession(
  setView: (v: WorkoutsView) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    // `safeReadStringSS`/`safeRemoveSS` centralise the private-mode-Safari /
    // disabled-storage guard that used to live as an inline try/catch here.
    const m = safeReadStringSS(VIEW_FROM_SESSION_KEY);
    if (m === "templates") {
      setView(m);
      safeRemoveSS(VIEW_FROM_SESSION_KEY);
    }
  }, [enabled, setView]);
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
    // AI-DANGER: rest-timer countdown. The functional updater, the
    // `<= 1` boundary (fires `markCompletedNaturally` on the final tick,
    // not at 0), and the `clearInterval` cleanup are load-bearing. Changing
    // the boundary or dropping the cleanup double-fires the end-cue or
    // leaks intervals across navigation. Verify against RestTimerProvider.
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
  useEffect(() => {
    if (!activeWorkout?.id || activeWorkout.endedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeWorkout?.id, activeWorkout?.endedAt, setNow]);
}
