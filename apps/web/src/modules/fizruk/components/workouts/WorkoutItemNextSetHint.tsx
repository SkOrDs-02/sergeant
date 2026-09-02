/**
 * Last validated: 2026-08-31
 * Status: Active
 */
import {
  computeOneRmAging,
  epley1rm,
  suggestNextSet,
} from "@sergeant/fizruk-domain";
import type {
  ReadinessAnswer,
  WorkoutSet,
  WorkoutVariantChoice,
} from "@sergeant/fizruk-domain";
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
  /**
   * Відповідь про готовність із ПОТОЧНОГО тренування (`Workout.wellbeing`).
   * Немає або нейтральна — картка виглядає рівно як до цієї фічі.
   */
  readiness?: ReadinessAnswer | null | undefined;
  onApply: (
    weightKg: number,
    reps: number,
    variant: WorkoutVariantChoice,
  ) => void;
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

/**
 * Причини МʼЯКОГО РЕЖИМУ, і лише вони. Готовність сюди навмисно не додана:
 * `returnReason` віддає `computeOneRmAging` з історії вправи (затухання 1ПМ,
 * вікно після травми), а готовність — це самозвіт про сьогодні. Змішати їх в
 * одному переліку означало б, що `ReturnProtocolNotice` (компонент про
 * старіння 1ПМ) мусив би знати про сон, а `aging.returnReason` міг би
 * набути значення, якого `computeOneRmAging` не вміє видавати.
 */
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
  readiness,
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
    ...(readiness ? { readiness } : {}),
  });
  if (!suggestion) return null;

  const t = messages.fizruk.nextSetHint;
  const reason = suggestion.returnReason
    ? RETURN_REASON_TEXT[suggestion.returnReason]
    : null;
  const softNote = suggestion.softMode
    ? `${t.softPrefix} ${reason ?? t.softFallback}`
    : `${t.targetPrefix} ${suggestion.targetReps.min}-${suggestion.targetReps.max} ${t.targetSuffix}`;
  // Коли готовність відкрила другий варіант, підпис пояснює саме її: інакше
  // поруч із двома кнопками стояла б підказка про цільовий діапазон, яка до
  // вибору не має стосунку.
  const note =
    suggestion.secondOption === "easier"
      ? t.easierNote
      : suggestion.secondOption === "harder"
        ? t.harderNote
        : softNote;

  const second =
    suggestion.secondOption === "easier" &&
    suggestion.easedWeightKg !== undefined &&
    suggestion.easedReps !== undefined
      ? {
          variant: "easier" as const,
          weightKg: suggestion.easedWeightKg,
          reps: suggestion.easedReps,
          label: t.easierPrefix,
        }
      : suggestion.secondOption === "harder" &&
          suggestion.altWeightKg !== undefined &&
          suggestion.altReps !== undefined
        ? {
            variant: "harder" as const,
            weightKg: suggestion.altWeightKg,
            reps: suggestion.altReps,
            label: t.harderPrefix,
          }
        : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onApply(suggestion.weightKg, suggestion.reps, "planned")}
        className="focus-ring min-h-[44px] rounded-full border border-fizruk-ring bg-fizruk-surface px-3 text-style-caption text-fizruk-soft-fg font-semibold transition-colors hover:bg-fizruk-surface/80 dark:border-fizruk-border-dark/40 dark:bg-fizruk-surface-dark/15"
      >
        {`${t.prefix} ${fmt(suggestion.weightKg, 1)} ${t.kgUnit} × ${suggestion.reps}`}
      </button>
      {second && (
        <button
          type="button"
          onClick={() => onApply(second.weightKg, second.reps, second.variant)}
          className="focus-ring min-h-[44px] rounded-full border border-fizruk-ring/60 bg-transparent px-3 text-style-caption text-subtle font-semibold transition-colors hover:bg-fizruk-surface/60 dark:border-fizruk-border-dark/30"
        >
          {`${second.label} ${fmt(second.weightKg, 1)} ${t.kgUnit} × ${second.reps}`}
        </button>
      )}
      <span className="text-style-caption text-subtle">{note}</span>
    </div>
  );
}
