import { useCallback } from "react";
import { ACTIVE_WORKOUT_KEY } from "@sergeant/fizruk-domain";
import type { WorkoutItem } from "@sergeant/fizruk-domain/domain";
import { safeWriteLS } from "@shared/lib/storage";

interface Exercise {
  id: string;
  name?: { uk?: string; en?: string };
  primaryGroup?: string;
  muscles?: { primary?: string[]; secondary?: string[] };
}

interface Session {
  exerciseIds?: readonly string[];
  progressionKg?: number;
}

interface WorkoutsApi {
  workouts: Array<{
    items?: Array<{ exerciseId?: string; sets?: Array<{ weightKg?: number }> }>;
  }>;
  createWorkout: () => { id: string };
  addItem: (workoutId: string, item: Partial<WorkoutItem>) => string;
}

/**
 * Factory hook for the "start today's program workout" button. Encodes
 * the progression + last-weight logic previously inlined in FizrukApp so
 * the main orchestrator doesn't need to know about `primaryGroup`,
 * `progressionKg`, or the `ACTIVE_WORKOUT_KEY` session handoff.
 */
export function useFizrukProgramStart({
  workouts,
  createWorkout,
  addItem,
  exercises,
  navigate,
}: WorkoutsApi & {
  exercises: readonly Exercise[];
  navigate: (next: string) => void;
}) {
  return useCallback(
    (session: Session | undefined | null) => {
      if (!session) return;
      const exIds = session.exerciseIds || [];
      const picks = exIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((e): e is Exercise => Boolean(e));
      if (picks.length === 0) return;
      const progressionKg = session.progressionKg ?? 0;
      const w = createWorkout();
      for (const ex of picks) {
        const isCardio = ex.primaryGroup === "cardio";
        let suggestedWeight = 0;
        if (!isCardio && progressionKg > 0) {
          const lastWorkoutWithEx = workouts.find((wo) =>
            (wo.items || []).some((it) => it.exerciseId === ex.id),
          );
          if (lastWorkoutWithEx) {
            const item = lastWorkoutWithEx.items?.find(
              (it) => it.exerciseId === ex.id,
            );
            const maxWeight = Math.max(
              0,
              ...(item?.sets || []).map((s) => s.weightKg || 0),
            );
            if (maxWeight > 0) {
              suggestedWeight = Math.round((maxWeight + progressionKg) * 2) / 2;
            }
          }
        }
        addItem(w.id, {
          exerciseId: ex.id,
          nameUk: ex?.name?.uk || ex?.name?.en,
          primaryGroup: ex.primaryGroup,
          musclesPrimary: ex?.muscles?.primary || [],
          musclesSecondary: ex?.muscles?.secondary || [],
          type: isCardio ? "distance" : "strength",
          sets: isCardio ? undefined : [{ weightKg: suggestedWeight, reps: 0 }],
          durationSec: 0,
          ...(isCardio ? { distanceM: 0 } : {}),
        });
      }
      safeWriteLS(ACTIVE_WORKOUT_KEY, w.id);
      try {
        sessionStorage.setItem("fizruk_workouts_mode", "log");
      } catch {
        // best-effort session handoff; failure just means the Workouts
        // page opens in its default mode.
      }
      navigate("workouts");
    },
    [workouts, createWorkout, addItem, exercises, navigate],
  );
}
