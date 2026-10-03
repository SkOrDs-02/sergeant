/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import type { Workout, WorkoutItem } from "@sergeant/fizruk-domain";
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
  "input-focus-fizruk h-11 rounded-xl border border-line bg-panelHi px-3 text-style-body text-text tabular-nums read-only:opacity-70 read-only:cursor-not-allowed";

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
    <input
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
    return (
      <div className="mt-2 space-y-1.5">
        <div className="grid grid-cols-2 gap-2">
          {durationInput}
          <div className="h-11" aria-hidden />
        </div>
        <div className="text-style-caption text-subtle">
          {ss.cardioTimeHint}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
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
