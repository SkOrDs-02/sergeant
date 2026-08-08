/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import type { WorkoutItem, WorkoutSet } from "@sergeant/fizruk-domain";
import { messages } from "@shared/i18n/uk";
import { calcCardioMetrics } from "./activeWorkoutLib";

export type LastByExerciseEntry = WorkoutItem & { _startedAt?: string };

export interface WorkoutItemLastTimeHintProps {
  last: LastByExerciseEntry | undefined;
}

/**
 * "Минулого разу …" hint rendered above a `WorkoutItemCard`. Extracted
 * out of the card to keep that file under the 600-line module cap
 * (Hard Rule #18) — purely presentational, no state of its own.
 *
 * Filters strength sets with the same non-empty criterion the domain
 * uses for the "N підходів" pill (`computeWorkoutSetCount` in
 * `packages/fizruk-domain/src/domain/workouts/journal.ts`): a set only
 * counts when `weightKg > 0 || reps > 0`. Without the filter, an empty
 * placeholder set produced garbage like "80×8, 0×0" — or a bare "0×0"
 * when it was the only logged set. Renders nothing at all once the
 * filtered text comes back empty, instead of a bare "Минулого разу:"
 * line.
 */
export function WorkoutItemLastTimeHint({
  last,
}: WorkoutItemLastTimeHintProps) {
  if (!last) return null;
  const text =
    last.type === "strength"
      ? (last.sets || [])
          .filter((s: WorkoutSet) => (s.weightKg ?? 0) > 0 || (s.reps ?? 0) > 0)
          .map((s: WorkoutSet) => `${s.weightKg ?? 0}×${s.reps ?? 0}`)
          .slice(0, 3)
          .join(", ")
      : last.type === "distance"
        ? (() => {
            const m = calcCardioMetrics(last.distanceM, last.durationSec);
            return m
              ? `${last.distanceM ?? 0}м · ${m.pace}`
              : `${last.distanceM ?? 0}м за ${last.durationSec ?? 0}с`;
          })()
        : `${last.durationSec ?? 0}с`;
  if (!text) return null;
  return (
    <div className="text-style-caption text-subtle/70 mb-1">
      {messages.fizruk.lastTimeHint.label}{" "}
      {last._startedAt
        ? `(${new Date(last._startedAt).toLocaleDateString("uk-UA", { month: "short", day: "numeric" })})`
        : ""}
      : {text}
    </div>
  );
}
