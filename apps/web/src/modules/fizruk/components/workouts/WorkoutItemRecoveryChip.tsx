/**
 * Last validated: 2026-08-08
 * Status: Active
 */
import {
  recoveryConflictsForWorkoutItem,
  type WorkoutItem,
} from "@sergeant/fizruk-domain";
import { Icon } from "@shared/components/ui/Icon";
import { Popover } from "@shared/components/ui/Popover";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

export interface WorkoutItemRecoveryChipProps {
  it: WorkoutItem;
  recBy: Record<string, unknown>;
}

/**
 * Compact recovery-warning affordance rendered next to the exercise
 * title inside `WorkoutItemCard`. Redesign 2026-08: replaces the old
 * always-expanded 2-3 line amber banner (the loudest block on the
 * pre-redesign card) with a small chip; the full muscle breakdown
 * moves behind a tap. Canon `fizruk.md` §4 — recovery is advice, not a
 * gate — so it should not out-shout the set row.
 *
 * `recoveryConflictsForWorkoutItem` itself is untouched; only the
 * presentation changed.
 */
export function WorkoutItemRecoveryChip({
  it,
  recBy,
}: WorkoutItemRecoveryChipProps) {
  const cf = recoveryConflictsForWorkoutItem(
    it,
    recBy as Parameters<typeof recoveryConflictsForWorkoutItem>[1],
  );
  if (!cf.hasWarning) return null;

  const rc = messages.fizruk.recoveryChip;
  const isRed = cf.red.length > 0 || cf.injury.blocked;
  const redLabel = cf.red.map((x) => x.label).join(", ");
  const yellowLabel = cf.yellow.map((x) => x.label).join(", ");

  return (
    <Popover
      placement="bottom-start"
      role="dialog"
      label={rc.detailAriaLabel}
      wrapperClassName="shrink-0"
      trigger={
        <span
          aria-label={rc.triggerAriaLabel}
          className={cn(
            "flex items-center rounded-full border px-1.5 py-0.5 cursor-pointer select-none",
            isRed
              ? "border-danger/40 bg-danger/10 text-danger-strong dark:text-danger"
              : "border-warning/40 bg-warning/10 text-warning-strong dark:text-warning",
          )}
        >
          <Icon name="alert-triangle" size={11} aria-hidden />
        </span>
      }
    >
      <div className="max-w-[260px] px-3.5 py-2.5 text-style-caption leading-snug text-text">
        {cf.injury.blocked ? (
          <div className="font-semibold text-danger-strong dark:text-danger">
            {rc.injuryLine}
          </div>
        ) : null}
        {cf.red.length ? (
          <div className={cf.injury.blocked ? "mt-1.5" : ""}>
            <span className="font-semibold">{rc.redPrefix}</span> {redLabel}
          </div>
        ) : null}
        {cf.yellow.length ? (
          <div className="mt-1.5">
            <span className="font-semibold">{rc.yellowPrefix}</span>{" "}
            {yellowLabel}
          </div>
        ) : null}
      </div>
    </Popover>
  );
}
