import type { Workout } from "@sergeant/fizruk-domain";
import { Button } from "@shared/components/ui/Button";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "@shared/components/ui/DropdownMenu";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

/**
 * Header band of `ActiveWorkoutPanel`: title (Active vs Finished),
 * formatted start time + optional duration, and the
 * Finish / Collapse / Delete action cluster.
 *
 * Pure presentation — no local state. Owns its own visual structure
 * so the parent panel can stay focused on the items list.
 *
 * V-8 audit fix (2026-08-08): "Видалити" no longer sits in prime
 * position next to "Завершити" — a destructive action does not
 * deserve the same visual weight as the primary action for the
 * entire session. It now lives behind an overflow ("⋯") menu via the
 * shared `DropdownMenu` primitive, which already owns the a11y
 * contract we need here (aria-haspopup/aria-expanded/aria-controls on
 * the trigger, Escape-to-close, click-outside-to-close, roving
 * keyboard focus) — see `DropdownMenu.tsx`. The undo toast shown by
 * the caller (`removeItemWithUndo`-style flow in the orchestrator)
 * is unrelated to this component and is untouched by this change.
 */
export interface ActiveWorkoutHeaderProps {
  activeWorkout: Workout;
  /** Pre-formatted duration ("42 хв"). When `null` we hide the suffix. */
  activeDuration: string | null;
  onFinishClick: () => void;
  onDeleteWorkout: () => void;
  /** Only used when the workout is already ended. */
  onCollapse?: (() => void) | undefined;
}

export function ActiveWorkoutHeader({
  activeWorkout,
  activeDuration,
  onFinishClick,
  onDeleteWorkout,
  onCollapse,
}: ActiveWorkoutHeaderProps) {
  const overflowMenuItems: DropdownMenuItem[] = [
    {
      type: "item",
      id: "delete-workout",
      label: messages.fizruk.sessionHeader.deleteWorkout,
      icon: <Icon name="trash" size={16} aria-hidden />,
      destructive: true,
      onSelect: onDeleteWorkout,
    },
  ];

  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        {/* Заголовок «Активне тренування» вже стоїть у шапці сторінки над
            панеллю; повторювати його тут — шум. Завершене відрізняється від
            активного лише цим словом, тож для нього підпис лишається. */}
        {activeWorkout.endedAt ? (
          <div className="text-style-label text-text">Завершене тренування</div>
        ) : null}
        <div
          className={
            activeWorkout.endedAt
              ? "text-style-caption text-subtle mt-0.5"
              : "text-style-label text-text"
          }
        >
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
            module="fizruk"
            size="sm"
            className="h-9 px-4"
            type="button"
            onClick={onFinishClick}
          >
            Завершити
          </Button>
        ) : onCollapse ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-9 px-4"
            type="button"
            onClick={onCollapse}
            aria-label="Згорнути завершене тренування"
          >
            Згорнути
          </Button>
        ) : (
          <span className="text-style-caption text-subtle">Завершено</span>
        )}
        <DropdownMenu
          ariaLabel={messages.fizruk.sessionHeader.moreActionsAriaLabel}
          items={overflowMenuItems}
          placement="bottom-end"
          trigger={
            <Button
              variant="outline"
              tone="neutral"
              size="sm"
              iconOnly
              type="button"
              aria-label={messages.fizruk.sessionHeader.moreActionsAriaLabel}
            >
              <Icon name="more-horizontal" size={16} aria-hidden />
            </Button>
          }
        />
      </div>
    </div>
  );
}
