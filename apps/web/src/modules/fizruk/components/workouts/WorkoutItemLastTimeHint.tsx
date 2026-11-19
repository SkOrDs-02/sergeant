/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import type {
  OneRmSessionPoint,
  WorkoutItem,
  WorkoutSet,
} from "@sergeant/fizruk-domain";
import { messages } from "@shared/i18n/uk";
import { formatDateShort } from "@shared/lib/time/formatDate";
import { calcCardioMetrics } from "./activeWorkoutLib";
import { isSetCompleted } from "@sergeant/fizruk-domain/domain";

export type LastByExerciseEntry = WorkoutItem & {
  _startedAt?: string;
  /** Силові сесії вправи (`collectLastByExerciseId`), див. `LastExerciseItem`. */
  _sessions?: OneRmSessionPoint[];
  /** Зняття позначки травми для вправи, див. `LastExerciseItem`. */
  _injuryClearedAt?: string | null;
};

export interface WorkoutItemLastTimeHintProps {
  last: LastByExerciseEntry | undefined;
}

/**
 * Виконані підходи минулої сесії — джерело «було» в рядках підходів.
 * Критерій єдиний для модуля (`isSetCompleted`, `setCompletion.ts` у
 * домені): рядок лише з вагою (посів старту програми, якого не зробили) не
 * стає підказкою «60×0». Exported so `WorkoutItemCard` can reuse it to
 * compute the per-row "було" ghost values.
 */
export function filterNonEmptyStrengthSets(
  sets: WorkoutSet[] | undefined,
  item?: WorkoutItem,
): WorkoutSet[] {
  // З `item` — правило його типу виміру (секунди, метри); без — повторення.
  return (sets || []).filter((s) => isSetCompleted(s, item));
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
            ? `${last.distanceM ?? 0}\u202Fм · ${m.pace}`
            : `${last.distanceM ?? 0}\u202Fм за ${last.durationSec ?? 0}\u202Fс`;
        })()
      : `${last.durationSec ?? 0}\u202Fс`;
  if (!text) return null;
  return (
    <div className="text-style-caption text-subtle mb-1">
      {messages.fizruk.lastTimeHint.label}{" "}
      {last._startedAt ? `(${formatDateShort(new Date(last._startedAt))})` : ""}
      : {text}
    </div>
  );
}
