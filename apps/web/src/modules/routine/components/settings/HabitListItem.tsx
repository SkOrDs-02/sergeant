import { memo, type DragEventHandler } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { IconButton } from "@shared/components/ui/IconButton";
import { RECURRENCE_OPTIONS } from "../../lib/routineConstants";
import type { Habit } from "../../lib/types";

export interface HabitListItemProps {
  habit: Habit;
  editing: boolean;
  dragging: boolean;
  onDragStart: DragEventHandler<HTMLLIElement>;
  onDragEnd: DragEventHandler<HTMLLIElement>;
  onDragOver: DragEventHandler<HTMLLIElement>;
  onDrop: DragEventHandler<HTMLLIElement>;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpenDetails: () => void;
  onStartEdit: () => void;
  onArchive: () => void;
  onRequestDelete: () => void;
}

/**
 * Єдиний рядок у списку активних звичок: перетягування, кнопки ↑↓,
 * «Деталі», «Змінити», «В архів», «Видалити». Мемоізовано, щоб редагування
 * іншої звички не спричиняло re-render усіх рядків.
 */
export const HabitListItem = memo(function HabitListItem({
  habit: h,
  editing,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMoveUp,
  onMoveDown,
  onOpenDetails,
  onStartEdit,
  onArchive,
  onRequestDelete,
}: HabitListItemProps) {
  const recLabel =
    RECURRENCE_OPTIONS.find((o) => o.value === (h.recurrence || "daily"))
      ?.label || "";

  return (
    <li
      draggable
      aria-grabbed={dragging}
      className={cn(
        "flex flex-col gap-2 border-b border-line/40 pb-3 last:border-0 last:pb-0 cursor-grab active:cursor-grabbing",
        editing &&
          "ring-2 ring-routine-ring/60 dark:ring-routine-border-dark/40 rounded-xl p-2 -mx-1",
        dragging && "opacity-70",
      )}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-style-label">
            {h.emoji} {h.name}
          </span>
          <p className="text-2xs text-subtle mt-0.5">
            {recLabel}
            {h.timeOfDay ? ` · ${h.timeOfDay}` : ""}
            {h.startDate ? ` · з ${h.startDate}` : ""}
            {h.endDate ? ` до ${h.endDate}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end shrink-0 max-w-[min(100%,12rem)] sm:max-w-none">
          <div className="flex gap-1">
            <IconButton
              size="sm"
              variant="ghost"
              className="rounded-xl border border-line text-xs! text-muted"
              onClick={onMoveUp}
              aria-label="Вгору в списку"
            >
              ↑
            </IconButton>
            <IconButton
              size="sm"
              variant="ghost"
              className="rounded-xl border border-line text-xs! text-muted"
              onClick={onMoveDown}
              aria-label="Вниз в списку"
            >
              ↓
            </IconButton>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9! px-3! text-xs! bg-routine-surface/40 dark:bg-routine-surface-dark/10"
            onClick={onOpenDetails}
          >
            Деталі
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9! px-3! text-xs!"
            onClick={onStartEdit}
          >
            Змінити
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9! px-3! text-xs!"
            onClick={onArchive}
          >
            В архів
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9! px-3! text-xs! text-danger"
            onClick={onRequestDelete}
          >
            Видалити
          </Button>
        </div>
      </div>
    </li>
  );
});
