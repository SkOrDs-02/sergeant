/**
 * Last validated: 2026-09-16
 * Status: Active
 *
 * «Швидкий запис» — вправа з власною вагою плюс число повторень.
 *
 * AI-CONTEXT (рішення власника 2026-09-15, перекомпоновано 2026-09-16). Це
 * наступник картки «Легка активність» з Прогресу: там був лічильник
 * відтискань з кнопками +10/+20/+30, який жив поза журналом — стрік,
 * відновлення й калорії його не бачили. Тут ті самі два тапи, але результат —
 * справжній `Workout` через `buildQuickLogWorkout`, тож запис одразу видно в
 * історії та на дні, а стрік читає його вагу за каноном §8 і серію ним не
 * рухає.
 *
 * **Чому це РЕЖИМ форми «Записати проведене», а не окремий аркуш.** Перша
 * версія (2026-09-15) була самостійним `QuickLogSheet` із власним текстовим
 * входом на домашній — і домашня дістала четвертий елемент у ряду стартів.
 * Власник 2026-09-16 попросив зібрати входи за двома осями: «почати зараз»
 * і «записати те, що вже було». Швидкий запис — це друге, тож він живе
 * третім режимом перемикача поруч із «Заняття й час» та «Вправи по
 * підходах». Аргумент проти («та форма питає дату, час, зону — пʼять полів
 * замість двох») знято тим, що режим показує лише СВОЇ два поля: дата тут
 * не питається навмисно, запис — «щойно».
 *
 * Стан форми винесено в хук, бо кнопку «Записати» тримає футер батьківського
 * `Sheet`: полям потрібен спільний стан із кнопкою, а не власний.
 */
import { useId, useMemo, useState } from "react";

import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Segmented } from "@shared/components/ui/Segmented";
import { messages } from "@shared/i18n/uk";
import { computeKcalBurned, FizrukData } from "@sergeant/fizruk-domain";

import {
  QUICK_LOG_EXERCISE_IDS,
  QUICK_LOG_EXERCISE_LABELS_UK,
  QUICK_LOG_MAX_REPS,
  QUICK_LOG_REPS_PRESETS,
  estimateQuickLogDurationSec,
  type QuickLogExerciseId,
} from "../../lib/quickLogWorkout";

export interface QuickLogPayload {
  exerciseId: QuickLogExerciseId;
  reps: number;
  /** `null`, коли ваги немає — запис зберігається, просто без оцінки витрат. */
  kcalBurned: number | null;
}

const DEFAULT_EXERCISE: QuickLogExerciseId = "pushup";
const DEFAULT_REPS = "20";

function parseReps(raw: string): number | null {
  const n = Number(raw.trim().replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  if (whole < 1 || whole > QUICK_LOG_MAX_REPS) return null;
  return whole;
}

export interface QuickLogFormState {
  exerciseId: QuickLogExerciseId;
  setExerciseId: (id: QuickLogExerciseId) => void;
  repsInput: string;
  setRepsInput: (raw: string) => void;
  /** Розібране число або `null`, якщо ввід порожній чи поза межами. */
  reps: number | null;
  /** Є ввід, але він невалідний — показуємо межі. */
  invalid: boolean;
  /** Оцінка витрат; `null` без ваги або без валідного числа. */
  kcal: number | null;
  /** Готовий до запису payload або `null`, поки «Записати» має бути вимкнена. */
  payload: QuickLogPayload | null;
}

/**
 * Стан швидкого запису. `open` потрібен, щоб кожне відкриття було новим
 * записом: вправа лишається (людина зазвичай повторює одну й ту саму), число
 * повертається до дефолту. Скидання під час рендера за `prevOpen`, а не в
 * ефекті — той самий патерн, що в `QuickStartSheet`: без зайвого кадру зі
 * старим числом.
 */
export function useQuickLogForm({
  open,
  weightKg = null,
}: {
  open: boolean;
  weightKg?: number | null | undefined;
}): QuickLogFormState {
  const [exerciseId, setExerciseId] =
    useState<QuickLogExerciseId>(DEFAULT_EXERCISE);
  const [repsInput, setRepsInput] = useState(DEFAULT_REPS);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setRepsInput(DEFAULT_REPS);
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const reps = parseReps(repsInput);
  const invalid = repsInput.trim() !== "" && reps === null;

  const kcal = useMemo(() => {
    if (reps === null) return null;
    const ex = FizrukData.findExerciseById(exerciseId);
    if (!ex || typeof ex.met !== "number") return null;
    return computeKcalBurned({
      met: ex.met,
      weightKg,
      durationSec: estimateQuickLogDurationSec(reps),
    });
  }, [exerciseId, reps, weightKg]);

  return {
    exerciseId,
    setExerciseId,
    repsInput,
    setRepsInput,
    reps,
    invalid,
    kcal,
    payload: reps === null ? null : { exerciseId, reps, kcalBurned: kcal },
  };
}

export interface QuickLogFieldsProps {
  state: QuickLogFormState;
  /** Enter у полі теж записує — кнопка у футері не єдиний шлях. */
  onSubmit: () => void;
}

export function QuickLogFields({ state, onSubmit }: QuickLogFieldsProps) {
  const t = messages.fizruk.quickLog;
  const repsId = useId();

  const items = useMemo(
    () =>
      QUICK_LOG_EXERCISE_IDS.map((id) => ({
        value: id,
        label: QUICK_LOG_EXERCISE_LABELS_UK[id],
      })),
    [],
  );

  return (
    <form
      className="w-full min-w-0 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-2">
        <span className="text-style-label text-text block">{t.exercise}</span>
        <Segmented
          variant="fizruk"
          layout="pill"
          ariaLabel={t.exercise}
          items={items}
          value={state.exerciseId}
          onChange={state.setExerciseId}
        />
      </div>

      <div className="space-y-2">
        <Input
          id={repsId}
          label={t.reps}
          inputMode="numeric"
          value={state.repsInput}
          onChange={(e) => state.setRepsInput(e.target.value)}
          error={state.invalid}
          helperText={state.invalid ? t.invalidReps : undefined}
          maxLength={4}
          showCharCount={false}
        />
        <div
          role="group"
          aria-label={t.repsPresetsLabel}
          className="grid grid-cols-4 gap-2"
        >
          {QUICK_LOG_REPS_PRESETS.map((n) => (
            <Button
              key={n}
              type="button"
              variant={state.reps === n ? "solid" : "soft"}
              tone="fizruk"
              size="sm"
              className="tabular-nums"
              onClick={() => state.setRepsInput(String(n))}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>

      {state.kcal !== null ? (
        <p className="text-style-caption text-fizruk-strong">
          {t.kcalPreview} {state.kcal} {t.kcalUnit}
        </p>
      ) : null}
    </form>
  );
}
