/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo, type DragEventHandler } from "react";
import { dateKeyInPauseInterval } from "@sergeant/routine-domain";
import { anchoredTodayKey } from "../../lib/dayAnchor";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { IconButton } from "@shared/components/ui/IconButton";
import { Icon } from "@shared/components/ui/Icon";
import { DropdownMenu } from "@shared/components/ui/DropdownMenu";
import { RECURRENCE_OPTIONS } from "../../lib/routineConstants";
import type { Habit } from "../../lib/types";
import { ROUTINE_OUTLINE_ICON_BUTTON } from "../routineIconButton";
import { formatDateShort } from "@shared/lib/time/formatDate";
import { parseDateKey } from "../../lib/weekUtils";

/** «28 лип.» замість сирого «2026-07-28»; рік лише коли він не поточний. */
function dayKeyShort(key: string): string {
  const date = parseDateKey(key);
  // ADR-0078: день-ключ звички належить пристрою, тож і «поточний рік» теж.
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time, no-restricted-syntax -- ADR-0078: особистий день звички device-local
  const thisYear = new Date().getFullYear();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: той самий device-local рік
  const withYear = date.getFullYear() !== thisYear;
  return formatDateShort(date, { withYear }) || key;
}

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
 * Єдиний рядок у списку активних звичок: тап по рядку відкриває редагування,
 * а «Змінити», «Деталі», «Вище», «Нижче», «В архів» і «Видалити» живуть в
 * одному меню «⋯» (П6 анти-слоп стратегії: один афорданс на рядок). Мемоізовано, щоб редагування іншої звички не
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

  const paused =
    h.paused || dateKeyInPauseInterval(h.pauseIntervals, anchoredTodayKey());

  return (
    <li
      draggable
      aria-grabbed={dragging}
      className={cn(
        "flex flex-col gap-2 border-b border-line/40 pb-3 last:border-0 last:pb-0 cursor-grab active:cursor-grabbing",
        editing && "outline outline-1 outline-line rounded-lg p-2 -mx-1",
        dragging && "opacity-70",
      )}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-start justify-between gap-2">
        {/* Тап по рядку = редагування; решта дій в одному «···»
            (redesign v3.2, 12, П6). */}
        <button
          type="button"
          onClick={onStartEdit}
          className="min-w-0 flex-1 text-left rounded-lg focus-ring"
          aria-label={`Змінити звичку ${h.name}`}
        >
          <span className="text-style-label-lg font-semibold flex items-center gap-1.5">
            {paused && (
              <span
                role="img"
                aria-label={messages.routine.streakCanvas.legendPauseTitle}
                className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-muted"
              />
            )}
            <span className="truncate">{h.name}</span>
          </span>
          <p className="text-style-label text-muted mt-0.5">
            {recLabel}
            {h.timeOfDay ? ` · ${h.timeOfDay}` : ""}
            {h.startDate ? ` · з ${dayKeyShort(h.startDate)}` : ""}
            {h.endDate ? ` до ${dayKeyShort(h.endDate)}` : ""}
          </p>
        </button>
        <div className="shrink-0">
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
                id: "edit",
                label: "Змінити",
                onSelect: onStartEdit,
              },
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
                onSelect: onMoveUp,
              },
              {
                type: "item",
                id: "move-down",
                label: "Нижче",
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
