/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Сабміт «Швидкого запису» — винесено з `useWorkoutsOrchestrator`, бо той
 * упирається в стелю 600 рядків (Hard Rule #18), а ця гілка від решти
 * оркестратора не залежить: їй потрібні лише `restoreWorkout` і тост.
 * Стану відкриття тут немає з 2026-09-16: швидкий запис — режим форми
 * «Записати проведене» (`LogPastWorkoutSheet`), і відкритість тримає вона.
 *
 * AI-CONTEXT (рішення власника 2026-09-15). «+20 відтискань» — це
 * завершений `Workout` (`buildQuickLogWorkout`), наступник лічильника
 * «Легка активність» з Прогресу. Запис народжується завершеним і слот «одне
 * активне» не займає, тож діалог конфлікту тут зайвий — як і в короткому
 * шляху `submitPastWorkout`. Пишемо через `restoreWorkout`: це єдиний
 * мутатор `useWorkouts`, що приймає ГОТОВИЙ `Workout` одним записом
 * (створити + item + kcal було б три dual-write-цикли на один тап). Ім'я в
 * нього від undo-сценарію, але контракт той самий — «вставити, якщо такого
 * id ще немає».
 */
import { useCallback } from "react";

import type { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import type { Workout } from "@sergeant/fizruk-domain";

import type { QuickLogPayload } from "../components/workouts/QuickLogForm";
import {
  QUICK_LOG_EXERCISE_LABELS_UK,
  buildQuickLogWorkout,
} from "../lib/quickLogWorkout";
import { trackFizrukWorkoutStarted } from "../lib/workoutTelemetry";

interface UseQuickLogInput {
  restoreWorkout: (workout: Workout) => void;
  toast: ReturnType<typeof useToast>;
}

export function useQuickLog({ restoreWorkout, toast }: UseQuickLogInput) {
  const submitQuickLog = useCallback(
    (payload: QuickLogPayload) => {
      const workout = buildQuickLogWorkout({
        exerciseId: payload.exerciseId,
        reps: payload.reps,
        // eslint-disable-next-line no-restricted-syntax -- мить завершення запису, UTC-instant, не день-ключ
        endedAt: new Date().toISOString(),
        kcalBurned: payload.kcalBurned,
      });
      if (!workout) return;
      restoreWorkout(workout);
      trackFizrukWorkoutStarted(workout.id, "quick_log");
      toast.success(
        messages.fizruk.quickLog.savedToast
          .replace("{n}", String(payload.reps))
          .replace(
            "{exercise}",
            QUICK_LOG_EXERCISE_LABELS_UK[payload.exerciseId],
          ),
      );
    },
    [restoreWorkout, toast],
  );

  return { submitQuickLog };
}
