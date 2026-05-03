import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";
import { ROUTINE_THEME as C } from "../lib/routineConstants";
import type { Habit } from "../lib/types";

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
}

export function DayReportSheet({
  open,
  onClose,
  dayLabel,
  scheduledHabits,
  onToggleHabit,
  dateKey,
}: DayReportSheetProps) {
  const done = scheduledHabits.filter((h) => h.completed);
  const missed = scheduledHabits.filter((h) => !h.completed);

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
        <p className="text-sm text-muted text-center py-6">
          На цей день немає запланованих звичок
        </p>
      )}

      {done.length > 0 && (
        <div className="mb-4">
          <SectionHeading as="p" size="xs" className="mb-2">
            Виконано ({done.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {done.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 rounded-xl bg-routine-surface/40 dark:bg-routine-surface-dark/10 border border-routine-line/30 dark:border-routine-border-dark/20 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => onToggleHabit(h.id, dateKey)}
                  className={cn(
                    "w-8 h-8 rounded-xl border flex items-center justify-center text-sm font-bold shrink-0 transition-colors",
                    C.done,
                  )}
                  aria-label="Скасувати виконання"
                >
                  ✓
                </button>
                <span className="text-style-label text-text truncate">
                  {h.emoji} {h.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missed.length > 0 && (
        <div>
          <SectionHeading as="p" size="xs" className="mb-2">
            Пропущено ({missed.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {missed.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 rounded-xl bg-panel border border-line px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => onToggleHabit(h.id, dateKey)}
                  className="w-8 h-8 rounded-xl border border-line flex items-center justify-center text-sm font-bold shrink-0 text-muted hover:bg-panelHi transition-colors"
                  aria-label="Відмітити як виконано"
                >
                  ○
                </button>
                <span className="text-style-label text-muted truncate">
                  {h.emoji} {h.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {scheduledHabits.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line text-center">
          <p className="text-xs text-subtle">
            {done.length} з {scheduledHabits.length} виконано
            <span className="ml-1 font-semibold text-text">
              ({Math.round((done.length / scheduledHabits.length) * 100)}%)
            </span>
          </p>
        </div>
      )}
    </Sheet>
  );
}
