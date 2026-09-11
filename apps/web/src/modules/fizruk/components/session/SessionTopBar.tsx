/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import { Button } from "@shared/components/ui/Button";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "@shared/components/ui/DropdownMenu";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

export interface SessionTopBarProps {
  /** Pre-formatted live duration (`mm:ss`) — the single hero number. */
  duration: string | null;
  /** Left action: «Згорнути» on the list, «Список» on an exercise. */
  leftLabel: string;
  onLeft: () => void;
  onFinish: () => void;
  /** Extra overflow-menu entries (superset grouping lives here). */
  menuItems?: DropdownMenuItem[] | undefined;
  onDeleteWorkout: () => void;
}

/**
 * Верхня смуга сесійного режиму: замінює шапку модуля й заголовок сторінки
 * (спека `fizruk-active-session.md`, рішення 1). Один hero-показник —
 * тривалість — і одна помітна дія «Завершити». Видалення й групування
 * сховані в ⋯ (V-8, аудит 08-07: деструктивна дія не стоїть поруч із
 * головною).
 */
export function SessionTopBar({
  duration,
  leftLabel,
  onLeft,
  onFinish,
  menuItems,
  onDeleteWorkout,
}: SessionTopBarProps) {
  const ss = messages.fizruk.session;
  const items: DropdownMenuItem[] = [
    ...(menuItems ?? []),
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
    <div className="sticky top-0 z-30 border-b border-line bg-panel">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-1 px-1">
        <button
          type="button"
          onClick={onLeft}
          className="focus-ring flex h-11 items-center gap-0.5 rounded-xl pl-1.5 pr-3 text-style-label font-semibold text-fizruk-strong dark:text-fizruk hover:bg-panelHi"
        >
          <Icon name="chevron-left" size={18} aria-hidden />
          {leftLabel}
        </button>
        <div
          className="flex-1 text-center text-style-title font-bold tracking-tight tabular-nums text-text"
          role="timer"
          aria-label={ss.durationAria}
        >
          {duration ?? "00:00"}
        </div>
        <Button
          module="fizruk"
          size="sm"
          className="h-9 px-4"
          type="button"
          onClick={onFinish}
        >
          {ss.finish}
        </Button>
        <DropdownMenu
          ariaLabel={ss.moreActions}
          items={items}
          placement="bottom-end"
          trigger={
            <Button
              variant="outline"
              tone="neutral"
              size="sm"
              iconOnly
              type="button"
              aria-label={ss.moreActions}
            >
              <Icon name="more-horizontal" size={16} aria-hidden />
            </Button>
          }
        />
      </div>
    </div>
  );
}
