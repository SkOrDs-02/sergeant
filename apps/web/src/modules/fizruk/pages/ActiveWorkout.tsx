/**
 * Last validated: 2026-08-01
 * Status: Active
 */
import { useEffect } from "react";
import { Workouts } from "./Workouts";
import { trackFizrukWorkoutRouteOpened } from "../lib/workoutTelemetry";

interface ActiveWorkoutProps {
  workoutId: string;
  /** Вправа, відкрита на весь екран (`workout/<id>/<itemId>`). */
  focusItemId?: string | undefined;
  onNavigate: (target: string) => void;
}

/** Route-owned active workout surface (`/fizruk/workout/:id`). */
export function ActiveWorkout({
  workoutId,
  focusItemId,
  onNavigate,
}: ActiveWorkoutProps) {
  useEffect(() => {
    trackFizrukWorkoutRouteOpened(workoutId);
  }, [workoutId]);

  return (
    <Workouts
      workoutId={workoutId}
      focusItemId={focusItemId}
      activeOnly
      onNavigate={onNavigate}
    />
  );
}
