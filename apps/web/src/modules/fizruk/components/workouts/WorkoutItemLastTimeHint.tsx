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
 * Non-empty-set criterion shared with the domain's "N підходів" pill
 * (`computeWorkoutSetCount` in
 * `packages/fizruk-domain/src/domain/workouts/journal.ts`): a set only
 * counts when `weightKg > 0 || reps > 0`. Exported so `WorkoutItemCard`
 * can reuse it to compute the per-row "було" ghost values (redesign
 * 2026-08 — the strength half of this hint moved into the set rows,
 * see the early-return below).
 */
export function filterNonEmptyStrengthSets(
  sets: WorkoutSet[] | undefined,
): WorkoutSet[] {
  return (sets || []).filter((s) => (s.weightKg ?? 0) > 0 || (s.reps ?? 0) > 0);
}

/**
 * "Минулого разу …" hint rendered above a `WorkoutItemCard`. Extracted
 * out of the card to keep that file under the 600-line module cap
 * (Hard Rule #18) — purely presentational, no state of its own.
 *
 * Strength items render nothing here since the redesign (2026-08):
 * the "було" value now lives per-row as a tap-to-fill ghost next to
 * each set (see `WorkoutSetRow` + `filterNonEmptyStrengthSets` above),
 * so the old amber-free caption line above the title would just be a
 * duplicate. Time/distance items have no per-row equivalent, so they
 * keep this compact hint.
 */
export function WorkoutItemLastTimeHint({
  last,
}: WorkoutItemLastTimeHintProps) {
  if (!last) return null;
  if (last.type === "strength") return null;
  const text =
    last.type === "distance"
      ? (() => {
          const m = calcCardioMetrics(last.distanceM, last.durationSec);
          return m
            ? `${last.distanceM ?? 0}м · ${m.pace}`
            : `${last.distanceM ?? 0}м за ${last.durationSec ?? 0}с`;
        })()
      : `${last.durationSec ?? 0}с`;
  if (!text) return null;
  return (
    <div className="text-style-caption text-subtle mb-1">
      {messages.fizruk.lastTimeHint.label}{" "}
      {last._startedAt
        ? `(${new Date(last._startedAt).toLocaleDateString("uk-UA", { month: "short", day: "numeric" })})`
        : ""}
      : {text}
    </div>
  );
}
