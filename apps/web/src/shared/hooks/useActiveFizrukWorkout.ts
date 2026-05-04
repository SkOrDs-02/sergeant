import { useEffect, useState } from "react";
import { safeReadStringLS, safeRemoveLS } from "@shared/lib/storage/storage";

/**
 * Shared read-only pointer to the in-progress Fizruk workout.
 *
 * Fizruk persists `fizruk_active_workout_id_v1` in localStorage while a
 * workout is open. Other surfaces (Hub header, module pages, cross-module
 * CTAs) need to see that signal so they can offer a "Повернутися до
 * тренування" shortcut without pulling in the whole `useWorkouts` API.
 *
 * The active-id key is the single source of truth for "is there a session
 * to resume?", but it can end up stale in several real-world paths:
 *   - cloud-sync pulls in the completed session from another device but
 *     this device's active-id key was never cleared,
 *   - the workouts list gets wiped (FIZRUK_RESET_KEYS, manual reset, demo
 *     data cleanup) while the active-id key was missed,
 *   - a workout was ended through a non-UI path (hub chat `finish_workout`
 *     failing mid-write, cross-tab race) without clearing the active-id,
 *   - the referenced workout was deleted.
 * In all of those the banner would keep blinking "Тренування триває" even
 * though there is nothing to return to — this hook therefore validates the
 * pointer against `fizruk_workouts_v1` and treats it as `null` (and clears
 * the stale key) if the workout is missing or already has `endedAt`.
 *
 * Listens to `storage` events so that when the user ends a workout in
 * another tab the banner disappears immediately, not on next navigation.
 *
 * Also dispatches a synthetic `local-storage` event on same-tab writes
 * if callers want cross-component reactivity (Fizruk's own
 * setActiveWorkoutId dispatches via the effect that writes the key).
 */
const ACTIVE_WORKOUT_KEY = "fizruk_active_workout_id_v1";
const WORKOUTS_KEY = "fizruk_workouts_v1";

/**
 * Accepts both the current `{ schemaVersion, workouts }` envelope and the
 * legacy plain-array shape — mirrors `parseWorkoutsFromStorage` in the
 * fizruk-domain package. Inlined here so the hook stays in `shared/` and
 * doesn't pull in the fizruk package.
 */
function readActiveId(): string | null {
  const id = safeReadStringLS(ACTIVE_WORKOUT_KEY);
  if (!id) return null;

  const raw = safeReadStringLS(WORKOUTS_KEY);
  if (raw === null) {
    // No workouts persisted (or storage threw). Either way the pointer
    // cannot be validated against the list, so clear it as stale.
    clearStaleActiveId();
    return null;
  }

  let list: unknown;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) list = parsed;
    else if (
      parsed &&
      Array.isArray((parsed as { workouts?: unknown }).workouts)
    )
      list = (parsed as { workouts: unknown[] }).workouts;
    else list = [];
  } catch {
    // Corrupt JSON — fail open: don't hide a potentially active session
    // on parse error.
    return id;
  }

  if (!Array.isArray(list)) return id;
  const match = (list as Array<{ id?: unknown; endedAt?: unknown }>).find(
    (w) => w && w.id === id,
  );
  if (!match) {
    clearStaleActiveId();
    return null;
  }
  if (match.endedAt) {
    clearStaleActiveId();
    return null;
  }
  return id;
}

function clearStaleActiveId(): void {
  safeRemoveLS(ACTIVE_WORKOUT_KEY);
}

export function useActiveFizrukWorkout(): string | null {
  const [id, setId] = useState<string | null>(() => readActiveId());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // e.key === null means storage was cleared entirely (logout, sync).
      // Also re-validate when the workouts list changes — a finish flow
      // elsewhere may have flipped `endedAt` without touching the pointer.
      if (
        e.key === ACTIVE_WORKOUT_KEY ||
        e.key === WORKOUTS_KEY ||
        e.key === null
      ) {
        setId(readActiveId());
      }
    };
    // Poll every 1.5s as a fallback — storage events don't fire in the
    // same tab, and Fizruk writes via localStorage.setItem in an effect.
    // The cost (1-2 localStorage.getItem + JSON.parse per 1.5s) is
    // negligible compared to keeping a zombie "Тренування триває" pill.
    const poll = setInterval(() => {
      const next = readActiveId();
      setId((prev) => (prev === next ? prev : next));
    }, 1500);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(poll);
    };
  }, []);

  return id;
}
