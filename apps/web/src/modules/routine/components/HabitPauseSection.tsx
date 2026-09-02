/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Планована пауза наперед (канон `routine.md` §4).
 *
 * AI-CONTEXT: це НЕ той самий механізм, що легасі-прапор `Habit.paused`.
 * Прапор недатований, тож він або переписує всю історію, або (з `pausedFrom`)
 * вгадує «сьогодні» — саме про це аудит E-3: «60-денний стрік обнулився після
 * дії, яку всі три колонки вважали safe». Інтервал знає обидві межі, тому
 * заявлена наперед відпустка не ламає серію і не переписує минулий heatmap.
 */
import { useId, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import type { Dispatch, SetStateAction } from "react";
import { pauseHabitBetween, resumeHabitFrom } from "../lib/routineStorage";
import type { Habit, RoutineState } from "../lib/types";

export interface HabitPauseSectionProps {
  habit: Habit;
  /** Київський день «сьогодні» — межа, від якої пропонуємо паузу. */
  todayKey: string;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
}

function formatUk(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}.${m}.${y}`;
}

function rangeLabel(iv: { from: string; to: string | null }): string {
  return iv.to === null
    ? `${messages.routinePause.fromShort} ${formatUk(iv.from)}`
    : `${formatUk(iv.from)} – ${formatUk(iv.to)}`;
}

export function HabitPauseSection({
  habit,
  todayKey,
  setRoutine,
}: HabitPauseSectionProps) {
  const [from, setFrom] = useState(todayKey);
  const [to, setTo] = useState("");
  const fromId = useId();
  const toId = useId();

  const intervals = habit.pauseIntervals || [];
  // Активна саме та пауза, що накриває сьогодні — решта історична.
  const active = intervals.find(
    (iv) => todayKey >= iv.from && (iv.to === null || todayKey <= iv.to),
  );
  const planned = intervals.filter((iv) => iv.from > todayKey);

  const declare = () => {
    if (!from) return;
    setRoutine((s) => pauseHabitBetween(s, habit.id, from, to || null));
    setTo("");
  };

  const t = messages.routinePause;
  const activeLabel = active
    ? active.to === null
      ? `${t.activeOpenPrefix} ${formatUk(active.from)}`
      : `${t.activePrefix} ${formatUk(active.from)} – ${formatUk(active.to)}`
    : "";

  return (
    <section className="mb-5" aria-label={t.heading}>
      <SectionHeading as="h3" size="xs" className="mb-2" variant="routine">
        {t.heading}
      </SectionHeading>

      {active ? (
        <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <p className="text-style-label text-text">{activeLabel}</p>
          <p className="text-style-caption text-subtle mt-0.5">
            {t.activeHint}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() =>
              setRoutine((s) => resumeHabitFrom(s, habit.id, todayKey))
            }
          >
            {t.resumeToday}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <p className="text-style-body text-subtle mb-2">{t.hint}</p>
          <div
            role="group"
            aria-label={t.heading}
            className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
          >
            <DateField
              id={fromId}
              label={t.fromLabel}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="routine-touch-field"
            />
            <DateField
              id={toId}
              label={t.toLabel}
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="routine-touch-field"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="mt-2 w-full sm:w-auto"
            onClick={declare}
          >
            {t.declare}
          </Button>
        </div>
      )}

      {planned.length > 0 && (
        <ul className="mt-2 space-y-1">
          {planned.map((iv) => (
            <li key={iv.from} className="text-style-caption text-subtle">
              {`${t.plannedPrefix} ${rangeLabel(iv)}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
