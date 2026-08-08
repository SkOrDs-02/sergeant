import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import {
  safeReadStringSS,
  safeRemoveSS,
  safeWriteSS,
} from "@shared/lib/storage/storage";

/**
 * `repeat` — 02-A "Повторити це тренування" on the read-only summary of a
 * finished workout (`WorkoutSummaryView`): starts a new session pre-filled
 * with the same exercises (no sets), same conflict/telemetry path as every
 * other start source.
 */
export type FizrukWorkoutStartSource =
  "quick_start" | "template" | "resume" | "repeat";
export type FizrukRestTimerOutcome = "completed" | "skipped";

const NEW_ROUTE_MARKER = "fizruk_workout_new_route_v1";
const NEW_ROUTE_WINDOW_MS = 15_000;

export function trackFizrukWorkoutStarted(
  workoutId: string,
  source: Exclude<FizrukWorkoutStartSource, "resume">,
): void {
  safeWriteSS(
    NEW_ROUTE_MARKER,
    JSON.stringify({ workoutId, markedAt: Date.now() }),
  );
  trackEvent(ANALYTICS_EVENTS.FIZRUK_WORKOUT_STARTED, { source });
}

/** Emits resume unless this route mount is the immediate result of creation. */
export function trackFizrukWorkoutRouteOpened(workoutId: string): void {
  const raw = safeReadStringSS(NEW_ROUTE_MARKER);
  safeRemoveSS(NEW_ROUTE_MARKER);
  if (raw) {
    try {
      const marker = JSON.parse(raw) as {
        workoutId?: unknown;
        markedAt?: unknown;
      };
      if (
        marker.workoutId === workoutId &&
        typeof marker.markedAt === "number" &&
        Date.now() - marker.markedAt <= NEW_ROUTE_WINDOW_MS
      ) {
        return;
      }
    } catch {
      // A malformed one-shot marker is treated as a normal resume.
    }
  }
  trackEvent(ANALYTICS_EVENTS.FIZRUK_WORKOUT_STARTED, { source: "resume" });
}

export function trackFizrukWorkoutDiscarded(): void {
  trackEvent(ANALYTICS_EVENTS.FIZRUK_WORKOUT_DISCARDED);
}

export function trackFizrukRestTimerDone(
  outcome: FizrukRestTimerOutcome,
): void {
  trackEvent(ANALYTICS_EVENTS.FIZRUK_REST_TIMER_DONE, { outcome });
}
