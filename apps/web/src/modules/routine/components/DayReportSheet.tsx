import { useState } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { HabitStateButton } from "./HabitStateButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { SKIP_REASON_LABELS, SKIP_REASON_OPTIONS } from "../lib/skipReasons";
import type { HabitSkip, SkipReason } from "@sergeant/routine-domain";
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
        <p className="text-style-label-lg font-semibold text-text text-center py-6">
          На цей день немає запланованих звичок
        </p>
      )}

      {done.length > 0 && (
        <div className="mb-7">
          <SectionHeading as="p" size="lg" className="mb-3">
            Виконано ({done.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {done.map((h) => (
              <li
                key={h.id}
                className="flex min-h-14 items-center gap-2 border-b border-line py-2"
              >
                <HabitStateButton
                  completed
                  onClick={() => onToggleHabit(h.id, dateKey)}
                  aria-label="Скасувати виконання"
                />
                <span className="text-style-label-lg font-semibold text-text flex items-center gap-1.5 truncate">
                  <span className="truncate">{h.name}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missed.length > 0 && (
        <div>
          <SectionHeading as="p" size="lg" className="mb-3">
            Пропущено ({missed.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {missed.map((h) => (
              <li key={h.id} className="border-b border-line py-2">
                <div className="flex items-center gap-3">
                  <HabitStateButton
                    completed={false}
                    onClick={() => onToggleHabit(h.id, dateKey)}
                    aria-label="Відмітити як виконано"
                  />
                  <span className="text-style-label-lg font-semibold text-text flex items-center gap-1.5 truncate">
                    <span className="truncate">{h.name}</span>
                  </span>
                  {onSetSkip && (
                    <button
                      type="button"
                      onClick={() =>
                        setAskingFor((cur) => (cur === h.id ? null : h.id))
                      }
                      className="touch-target ml-auto shrink-0 rounded-lg px-2 text-style-label text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
                      aria-expanded={askingFor === h.id}
                      // Лише коли група причин у DOM: інакше посилання на
                      // неіснуючий id.
                      aria-controls={
                        askingFor === h.id ? `skip-reasons-${h.id}` : undefined
                      }
                    >
                      Не зміг
                    </button>
                  )}
                </div>
                {/* Причини живуть у рядку своєї звички: одна група під усім
                    списком не казала, до якого пропуску вона відноситься. */}
                {onSetSkip && askingFor === h.id && (
                  <div
                    id={`skip-reasons-${h.id}`}
                    role="group"
                    aria-label={`Причина пропуску: ${h.name}`}
                    className="mt-2 divide-y divide-line"
                  >
                    {SKIP_REASON_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => {
                          onSetSkip(h.id, o.value);
                          setAskingFor(null);
                        }}
                        className="focus-ring flex min-h-11 w-full items-center border-b border-line py-2 text-left text-style-label-lg text-text"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="mt-7">
          <SectionHeading as="p" size="lg" className="mb-3">
            Не зміг ({skipped.length})
          </SectionHeading>
          <ul className="space-y-1.5">
            {skipped.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap min-h-14 items-center gap-3 border-b border-line py-2"
              >
                <span className="text-style-label-lg font-semibold text-text flex items-center gap-1.5 truncate">
                  <span className="truncate">{h.name}</span>
                </span>
                <span className="text-style-label text-muted">
                  {SKIP_REASON_LABELS[skips[h.id]?.reason ?? "other"]}
                </span>
                {onClearSkip && (
                  <button
                    type="button"
                    onClick={() => onClearSkip(h.id)}
                    className="touch-target ml-auto shrink-0 rounded-lg px-2 text-style-label text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
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
          <p className="text-style-label text-muted">
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
