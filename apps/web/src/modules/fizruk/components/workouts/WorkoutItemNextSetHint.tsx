/**
 * Last validated: 2026-08-31
 * Status: Active
 */
import {
  computeOneRmAging,
  epley1rm,
  suggestNextSet,
} from "@sergeant/fizruk-domain";
import type { WorkoutSet } from "@sergeant/fizruk-domain";
import { findExerciseById } from "@sergeant/fizruk-domain/data";
import { messages } from "@shared/i18n/uk";
import { fmt } from "../../lib/numberFmt";
import { filterNonEmptyStrengthSets } from "./WorkoutItemLastTimeHint";
import type { LastByExerciseEntry } from "./WorkoutItemLastTimeHint";

export interface WorkoutItemNextSetHintProps {
  /** Останнє тренування з цією вправою (`lastByExerciseId`). */
  last: LastByExerciseEntry | undefined;
  exerciseId: string | null | undefined;
  isReadOnly: boolean;
  onApply: (weightKg: number, reps: number) => void;
}

function bestSetOf(sets: WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null;
  let bestEst = 0;
  for (const s of sets) {
    const est = epley1rm(s.weightKg, s.reps);
    if (est > bestEst) {
      bestEst = est;
      best = s;
    }
  }
  return best;
}

const RETURN_REASON_TEXT: Record<string, string> = {
  layoff: messages.fizruk.nextSetHint.softLayoff,
  injury: messages.fizruk.nextSetHint.softInjury,
};

/**
 * Підказка ваги й повторів у момент запису підходу.
 *
 * Це підказка, а не автомат: значення підставляється в поле лише по тапу і
 * його можна перебити. Прогресія подвійна (спершу повтори, потім вага) і в
 * режимі повернення вагу не піднімає — обидва рішення живуть у домені
 * (`suggestNextSet`), тут лише виклик і копія.
 *
 * `injuryClearedAt` сюди не доходить: картка знає лише історію самої вправи,
 * тож м'який режим тут вмикає пауза. Позначка болю має власне попередження
 * у `WorkoutItemRecoveryChip` поруч.
 */
export function WorkoutItemNextSetHint({
  last,
  exerciseId,
  isReadOnly,
  onApply,
}: WorkoutItemNextSetHintProps) {
  if (isReadOnly || last?.type !== "strength") return null;

  const best = bestSetOf(filterNonEmptyStrengthSets(last.sets));
  if (!best) return null;

  const aging = computeOneRmAging({
    peak1rm: epley1rm(best.weightKg, best.reps),
    lastSessionAt: last._startedAt ?? null,
  });
  const suggestion = suggestNextSet(best, {
    exercise: exerciseId ? findExerciseById(exerciseId) : null,
    aging,
  });
  if (!suggestion) return null;

  const t = messages.fizruk.nextSetHint;
  const reason = suggestion.returnReason
    ? RETURN_REASON_TEXT[suggestion.returnReason]
    : null;
  const note = suggestion.softMode
    ? `${t.softPrefix} ${reason ?? t.softFallback}`
    : `${t.targetPrefix} ${suggestion.targetReps.min}-${suggestion.targetReps.max} ${t.targetSuffix}`;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onApply(suggestion.weightKg, suggestion.reps)}
        className="focus-ring min-h-[44px] rounded-full border border-fizruk-ring bg-fizruk-surface px-3 text-style-caption text-fizruk-soft-fg font-semibold transition-colors hover:bg-fizruk-surface/80 dark:border-fizruk-border-dark/40 dark:bg-fizruk-surface-dark/15"
      >
        {`${t.prefix} ${fmt(suggestion.weightKg, 1)} ${t.kgUnit} × ${suggestion.reps}`}
      </button>
      <span className="text-style-caption text-subtle">{note}</span>
    </div>
  );
}
