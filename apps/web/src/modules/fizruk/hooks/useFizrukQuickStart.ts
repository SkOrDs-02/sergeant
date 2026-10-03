/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * «Швидкий старт» — порожнє тренування просто зараз, без шаблону й без
 * програми.
 *
 * AI-CONTEXT: чому окремий хук, а не гілка в `useFizrukProgramStart`.
 * Той хук вимагає сесію з непорожнім `exerciseIds` і мовчки виходить на
 * `!session` (`:53`) та на `picks.length === 0` (`:58`) — тобто «старт без
 * вправ» там не просто не підтриманий, а є умовою НЕ-старту. Пхати
 * порожній випадок туди означало б зняти обидві сторожі й зробити мовчазні
 * виходи недосяжними для читача.
 *
 * Спільним лишається те, що справді спільне: перевірка «одне активне
 * тренування» і той самий `onConflict`, тож обидва шляхи підіймають ОДИН
 * діалог конфлікту у `FizrukApp`, а не два схожі.
 *
 * Навігація йде на маршрут `workout/<id>`, а не в режим «лог» вкладки
 * «Тренування»: у другому випадку адреса лишається `/fizruk/workouts`, і
 * браузерне «назад» виходить із модуля замість повернення на Огляд — та
 * сама вада, що й у PR-Z8.
 */
import { useCallback } from "react";
import { ACTIVE_WORKOUT_KEY } from "@sergeant/fizruk-domain";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { trackFizrukWorkoutStarted } from "../lib/workoutTelemetry";

export function useFizrukQuickStart({
  workouts,
  createWorkout,
  navigate,
  onConflict,
}: {
  workouts: ReadonlyArray<{ endedAt?: string | null }>;
  createWorkout: () => { id: string };
  navigate: (next: string) => void;
  onConflict?: ((start: () => void) => void) | undefined;
}) {
  return useCallback(() => {
    const start = () => {
      const workout = createWorkout();
      safeWriteLS(ACTIVE_WORKOUT_KEY, workout.id);
      trackFizrukWorkoutStarted(workout.id, "quick_start");
      navigate(`workout/${workout.id}`);
    };
    if (workouts.some((workout) => !workout.endedAt) && onConflict) {
      onConflict(start);
      return;
    }
    start();
  }, [workouts, createWorkout, navigate, onConflict]);
}
