import type { Workout } from "@sergeant/fizruk-domain";
import { Button } from "@shared/components/ui/Button";

/**
 * Header band of `ActiveWorkoutPanel`: title (Active vs Finished),
 * formatted start time + optional duration, and the
 * Finish / Collapse / Delete action cluster.
 *
 * Pure presentation — no local state. Owns its own visual structure
 * so the parent panel can stay focused on the items list.
 */
export interface ActiveWorkoutHeaderProps {
  activeWorkout: Workout;
  /** Pre-formatted duration ("42 хв"). When `null` we hide the suffix. */
  activeDuration: string | null;
  onFinishClick: () => void;
  onDeleteWorkout: () => void;
  /** Only used when the workout is already ended. */
  onCollapse?: () => void;
}

export function ActiveWorkoutHeader({
  activeWorkout,
  activeDuration,
  onFinishClick,
  onDeleteWorkout,
  onCollapse,
}: ActiveWorkoutHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-bold text-text">
          {activeWorkout.endedAt
            ? "Завершене тренування"
            : "Активне тренування"}
        </div>
        <div className="text-xs text-subtle mt-0.5">
          {new Date(activeWorkout.startedAt).toLocaleString("uk-UA", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {activeDuration ? (
            <span className="ml-2">· {activeDuration}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!activeWorkout.endedAt ? (
          <Button
            size="sm"
            className="h-9 px-4"
            type="button"
            onClick={onFinishClick}
          >
            Завершити
          </Button>
        ) : onCollapse ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-4"
            type="button"
            onClick={onCollapse}
            aria-label="Згорнути завершене тренування"
          >
            Згорнути
          </Button>
        ) : (
          <span className="text-xs text-subtle">Завершено</span>
        )}
        <Button
          variant="danger"
          size="sm"
          className="h-9 px-4"
          type="button"
          onClick={onDeleteWorkout}
        >
          Видалити
        </Button>
      </div>
    </div>
  );
}
