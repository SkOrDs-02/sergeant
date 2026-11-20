/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";
import {
  formatProgramExercisePlan,
  programPlanForWorkoutItem,
} from "@sergeant/fizruk-domain";
import { findExerciseById } from "@sergeant/fizruk-domain/data";
import { Input } from "@shared/components/ui/Input";
import { clampNumericInput } from "@shared/lib/format/numberInput";
import { messages } from "@shared/i18n/uk";
import { MAX_DISTANCE_M, MAX_DURATION_SEC } from "../../lib/numericBounds";
import { calcCardioMetrics } from "./activeWorkoutLib";

export interface WorkoutItemCardioFieldsProps {
  it: WorkoutItem;
  activeWorkout: Workout;
  isReadOnly: boolean;
  updateItem: (
    workoutId: string,
    itemId: string,
    patch: Partial<WorkoutItem>,
  ) => void;
}

const INPUT_CLASS =
  "tabular-nums read-only:opacity-70 read-only:cursor-not-allowed";

/**
 * Time / distance inputs of a non-strength item. Split out of
 * `WorkoutItemCard` so the strength half (set rows) stays under the
 * 600-line cap (Hard Rule #18) after the 2026-09 session redesign.
 */
export function WorkoutItemCardioFields({
  it,
  activeWorkout,
  isReadOnly,
  updateItem,
}: WorkoutItemCardioFieldsProps) {
  const ss = messages.fizruk.session;
  const cardioMetrics =
    it.type === "distance"
      ? calcCardioMetrics(it.distanceM, it.durationSec)
      : null;

  const durationInput = (
    <Input
      className={INPUT_CLASS}
      type="number"
      inputMode="numeric"
      placeholder={ss.cardioSecondsPlaceholder}
      aria-label={ss.cardioDurationAria}
      value={it.durationSec || ""}
      readOnly={isReadOnly}
      onFocus={(e) => e.target.select()}
      onChange={(e) =>
        updateItem(activeWorkout.id, it.id, {
          durationSec: clampNumericInput(e.target.value, MAX_DURATION_SEC),
        })
      }
    />
  );

  if (it.type === "time") {
    // Утримання з програми: план «3×20–40 с», а поле одне на всю вправу —
    // секунд на підхід модель поки не має (спека типу виміру вправи).
    const plan = programPlanForWorkoutItem(
      activeWorkout.programRef,
      it.exerciseId ? findExerciseById(it.exerciseId) : null,
    );
    const timedPlan = plan?.kind === "time" ? plan : null;
    return (
      <div className="mt-2 space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          {durationInput}
          <div className="h-12" aria-hidden />
        </div>
        <div className="text-style-caption text-subtle">
          {timedPlan
            ? `${ss.timedPlanPrefix} ${formatProgramExercisePlan(timedPlan)}, ${ss.timedPlanTotalHint}`
            : ss.cardioTimeHint}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          className={INPUT_CLASS}
          type="number"
          inputMode="numeric"
          placeholder={ss.cardioMetersPlaceholder}
          min={0}
          max={MAX_DISTANCE_M}
          aria-label={ss.cardioDistanceAria}
          value={it.distanceM || ""}
          readOnly={isReadOnly}
          onFocus={(e) => e.target.select()}
          onChange={(e) =>
            updateItem(activeWorkout.id, it.id, {
              distanceM: clampNumericInput(e.target.value, MAX_DISTANCE_M),
            })
          }
        />
        {durationInput}
      </div>
      {cardioMetrics && (
        <div className="flex items-baseline gap-4 text-style-caption text-subtle">
          <span>
            {ss.cardioPace}{" "}
            <span className="text-style-label text-text tabular-nums">
              {cardioMetrics.pace}
            </span>
          </span>
          <span>
            {ss.cardioSpeed}{" "}
            <span className="text-style-label text-text tabular-nums">
              {cardioMetrics.speed}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
