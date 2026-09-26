/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo, type DragEventHandler } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { IconButton } from "@shared/components/ui/IconButton";
import { Icon } from "@shared/components/ui/Icon";
import { DropdownMenu } from "@shared/components/ui/DropdownMenu";
import { RECURRENCE_OPTIONS } from "../../lib/routineConstants";
import type { Habit } from "../../lib/types";
import { HabitGlyph } from "../HabitGlyph";
import { ROUTINE_OUTLINE_ICON_BUTTON } from "../routineIconButton";

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
 * Єдиний рядок у списку активних звичок: на виду лише «Змінити» і меню «⋯»,
 * щоб на телефоні рядок не загортався в кілька поверхів. «Деталі», «Вище»,
 * «Нижче», «В архів» і «Видалити» живуть у меню «⋯», щоб деструктивна дія не займала цілий вертикальний ряд на
 * екрані з десятком звичок. Мемоізовано, щоб редагування іншої звички не
 * спричиняло re-render усіх рядків.
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
          <span className="text-style-label flex items-center gap-1.5">
            <HabitGlyph value={h.emoji} size="sm" />
            <span className="truncate">{h.name}</span>
          </span>
          <p className="text-style-caption text-subtle mt-0.5">
            {recLabel}
            {h.timeOfDay ? ` · ${h.timeOfDay}` : ""}
            {h.startDate ? ` · з ${h.startDate}` : ""}
            {h.endDate ? ` до ${h.endDate}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end shrink-0 max-w-[min(100%,12rem)] sm:max-w-none">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9! px-3! text-xs!"
            onClick={onStartEdit}
          >
            Змінити
          </Button>
          <DropdownMenu
            ariaLabel={`Ще дії зі звичкою ${h.name}`}
            placement="bottom-end"
            trigger={
              <IconButton
                size="sm"
                variant="ghost"
                className={ROUTINE_OUTLINE_ICON_BUTTON}
                aria-label={`Ще дії зі звичкою ${h.name}`}
              >
                <Icon name="more-horizontal" size="sm" aria-hidden />
              </IconButton>
            }
            items={[
              {
                type: "item",
                id: "details",
                label: "Деталі",
                onSelect: onOpenDetails,
              },
              { type: "separator" },
              {
                type: "item",
                id: "move-up",
                label: "Вище",
                icon: <Icon name="arrow-up" size="md" aria-hidden />,
                onSelect: onMoveUp,
              },
              {
                type: "item",
                id: "move-down",
                label: "Нижче",
                icon: <Icon name="arrow-down" size="md" aria-hidden />,
                onSelect: onMoveDown,
              },
              { type: "separator" },
              {
                type: "item",
                id: "archive",
                label: "В архів",
                onSelect: onArchive,
              },
              {
                type: "item",
                id: "delete",
                label: "Видалити",
                icon: <Icon name="trash" size="md" aria-hidden />,
                destructive: true,
                onSelect: onRequestDelete,
              },
            ]}
          />
        </div>
      </div>
    </li>
  );
});
