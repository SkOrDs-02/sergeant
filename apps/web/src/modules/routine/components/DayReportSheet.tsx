import { useState } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { IconButton } from "@shared/components/ui/IconButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";
import { ROUTINE_THEME as C } from "../lib/routineConstants";
import { SKIP_REASON_LABELS, SKIP_REASON_OPTIONS } from "../lib/skipReasons";
import type { HabitSkip, SkipReason } from "@sergeant/routine-domain";
import type { Habit } from "../lib/types";
import { HabitGlyph } from "./HabitGlyph";
import { Icon } from "@shared/components/ui/Icon";

export interface ScheduledHabitForReport extends Habit {
  completed: boolean;
}

export interface DayReportSheetProps {
  open: boolean;
  onClose: () => void;
  dayLabel: string;
  scheduledHabits: ScheduledHabitForReport[];
  onToggleHabit: (habitId: string, dateKey: string) => void;
  dateKey: string;
  /** Позначки «не зміг» за цей день: `habitId → HabitSkip`. */
  skipsForDay?: Record<string, HabitSkip> | undefined;
  onSetSkip?: ((habitId: string, reason: SkipReason) => void) | undefined;
  onClearSkip?: ((habitId: string) => void) | undefined;
}

export function DayReportSheet({
  open,
  onClose,
  dayLabel,
  scheduledHabits,
  onToggleHabit,
  dateKey,
  skipsForDay,
  onSetSkip,
  onClearSkip,
}: DayReportSheetProps) {
  // Який рядок зараз питає причину. Інлайн-розкриття замість окремого
  // діалогу: причина — це продовження того самого рішення, а не нова задача.
  const [askingFor, setAskingFor] = useState<string | null>(null);

  const skips = skipsForDay || {};
  const done = scheduledHabits.filter((h) => h.completed);
  // Три стани дня взаємно виключні, тож «не зміг» виходить із «пропущено»:
  // інакше той самий день читався б і як провал, і як заявлений пропуск.
  const skipped = scheduledHabits.filter((h) => !h.completed && skips[h.id]);
  const missed = scheduledHabits.filter((h) => !h.completed && !skips[h.id]);
  // Знаменник підсумку — без заявлених пропусків (канон §5: «не зміг» ≠ провал).
  const counted = done.length + missed.length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Денний звіт"
      description={dayLabel}
      panelClassName="routine-sheet"
      zIndex={200}
    >
      {scheduledHabits.length === 0 && (
        <p className="text-style-label text-muted text-center py-6">
          На цей день немає запланованих звичок
        </p>
      )}

      {done.length > 0 && (
        <div className="mb-4">
          <SectionHeading as="p" size="xs" className="mb-2" variant="routine">
            Виконано ({done.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {done.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 rounded-xl bg-routine-surface/40 dark:bg-routine-surface-dark/10 border border-routine-line/30 dark:border-routine-border-dark/20 px-3 py-2.5"
              >
                <IconButton
                  size="xs"
                  variant="ghost"
                  onClick={() => onToggleHabit(h.id, dateKey)}
                  className={cn("shrink-0 rounded-xl border font-bold", C.done)}
                  aria-label="Скасувати виконання"
                >
                  <Icon name="check" size={14} aria-hidden />
                </IconButton>
                <span className="text-style-label text-text flex items-center gap-1.5 truncate">
                  <HabitGlyph value={h.emoji} size="sm" />
                  <span className="truncate">{h.name}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missed.length > 0 && (
        <div>
          <SectionHeading as="p" size="xs" className="mb-2" variant="routine">
            Пропущено ({missed.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {missed.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 rounded-xl bg-panel border border-line px-3 py-2.5"
              >
                <IconButton
                  size="xs"
                  variant="ghost"
                  onClick={() => onToggleHabit(h.id, dateKey)}
                  className="shrink-0 rounded-xl border border-line font-bold text-muted"
                  aria-label="Відмітити як виконано"
                >
                  <Icon name="circle-outline" size={14} aria-hidden />
                </IconButton>
                <span className="text-style-label text-muted flex items-center gap-1.5 truncate">
                  <HabitGlyph value={h.emoji} size="sm" />
                  <span className="truncate">{h.name}</span>
                </span>
                {onSetSkip && (
                  <button
                    type="button"
                    onClick={() =>
                      setAskingFor((cur) => (cur === h.id ? null : h.id))
                    }
                    className="touch-target ml-auto shrink-0 rounded-lg px-2 text-style-caption text-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-routine-ring/60"
                    aria-expanded={askingFor === h.id}
                  >
                    Не зміг
                  </button>
                )}
              </li>
            ))}
          </ul>
          {onSetSkip && askingFor !== null && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SKIP_REASON_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onSetSkip(askingFor, o.value);
                    setAskingFor(null);
                  }}
                  className="touch-target rounded-full border border-line px-3 text-style-caption text-text hover:bg-routine-surface/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-routine-ring/60"
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {skipped.length > 0 && (
        <div className="mt-4">
          <SectionHeading as="p" size="xs" className="mb-2" variant="routine">
            Не зміг ({skipped.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {skipped.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 rounded-xl bg-panel border border-line border-dashed px-3 py-2.5"
              >
                <span className="text-style-label text-muted flex items-center gap-1.5 truncate">
                  <HabitGlyph value={h.emoji} size="sm" />
                  <span className="truncate">{h.name}</span>
                </span>
                <span className="text-style-caption text-subtle">
                  {SKIP_REASON_LABELS[skips[h.id]?.reason ?? "other"]}
                </span>
                {onClearSkip && (
                  <button
                    type="button"
                    onClick={() => onClearSkip(h.id)}
                    className="touch-target ml-auto shrink-0 rounded-lg px-2 text-style-caption text-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-routine-ring/60"
                  >
                    Зняти
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-style-body text-muted mt-2">
            Заявлений пропуск не рахується провалом і не ламає серію.
          </p>
        </div>
      )}

      {scheduledHabits.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line text-center">
          <p className="text-style-caption text-subtle">
            {done.length} з {counted} виконано
            {counted > 0 && (
              <span className="ml-1 font-semibold text-text">
                (
                <Measure
                  value={Math.round((done.length / counted) * 100)}
                  unit="%"
                  tone="inherit"
                />
                )
              </span>
            )}
            {skipped.length > 0 && (
              <span className="ml-1">· не зміг: {skipped.length}</span>
            )}
          </p>
        </div>
      )}
    </Sheet>
  );
}
