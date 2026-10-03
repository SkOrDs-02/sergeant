/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Fizruk insight trigger: `fizruk-rest-day-overdue`.
 *
 * Fires when the user has not logged a completed workout for
 * REST_DAY_THRESHOLD or more consecutive days. Returns `null` when
 * the condition is not met or data has not loaded yet (so callers
 * can render nothing safely while the SQLite boot is in flight).
 */

import { useMemo } from "react";
import { pluralDays } from "@sergeant/shared";
import { wholeDaysSince } from "@shared/lib/time/wholeDaysSince";
import type { Workout } from "@sergeant/fizruk-domain/domain";
import type { Insight } from "@shared/lib/insights/types";

/** Minimum gap (days) before the insight fires. Tune here, not inline. */
const REST_DAY_THRESHOLD = 3;

/**
 * Скільки ЦІЛИХ календарних діб минуло від останнього завершеного
 * тренування.
 *
 * AI-CONTEXT: власна копія цієї арифметики вже розійшлась із рушієм
 * рекомендацій — на одному екрані стояли «15 днів» і «16 днів» для тієї
 * самої паузи (browser QA 2026-08-23). Тому обчислення живе в спільному
 * `wholeDaysSince`, а тут лишається тільки вибір моменту: найпізніший
 * `endedAt`. Межа доби — годинник ПРИСТРОЮ (ADR-0078): це клієнтська
 * re-engagement-евристика, не серверний період.
 */
function daysSinceLastWorkout(workouts: readonly Workout[]): number {
  let latestMs = -Infinity;
  for (const w of workouts) {
    if (!w.endedAt) continue;
    const ms = Date.parse(w.endedAt);
    if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
  }
  if (!Number.isFinite(latestMs)) return Infinity;
  return wholeDaysSince(latestMs);
}

export function useRestDayOverdueInsight(
  workouts: readonly Workout[],
  loaded: boolean,
): Insight | null {
  return useMemo(() => {
    // Suppress while SQLite boot is still in flight — avoids a false
    // "no workouts" state triggering the card on first render.
    if (!loaded) return null;

    const days = daysSinceLastWorkout(workouts);

    // Never-trained users have no completed workouts, so `days` is Infinity.
    // The empty-state UI already prompts them to start; showing "N днів без
    // тренування" would be nonsensical here.
    if (!Number.isFinite(days)) return null;

    if (days < REST_DAY_THRESHOLD) return null;

    return {
      id: "fizruk-rest-day-overdue",
      module: "fizruk",
      title: `${days} ${pluralDays(days)} без тренування`,
      subtitle: "Час повернутися?",
      // AI-DANGER: питання мусить казати те саме, що й заголовок. Тут стояв
      // текст «N днів поспіль БЕЗ ДНЯ ВІДНОВЛЕННЯ» — протилежний зміст:
      // заголовок каже «ти не тренувався», а питання питало, коли поставити
      // відпочинок, ніби людина тренувалась без пауз. Один і той самий рядок
      // на екрані казав дві протилежні речі (звіт власника 2026-09-02).
      // Лишок від первісної рамки, з якої походить і назва
      // `rest-day-overdue`: тригер рахує ДНІ ВІД ОСТАННЬОГО ТРЕНУВАННЯ, а
      // не серію без відпочинку. Правиш заголовок — правь і це.
      askAiPrompt: `${days} ${pluralDays(days)} без тренування. Наскільки це критично за моїми даними і як найкраще повернутися?`,
      action: { type: "navigate", path: "/fizruk/workouts" },
      // Hub surface promoted post-Phase 5e: rest-day overdue is the canonical
      // cross-module re-engagement signal — needs Hub visibility to actually
      // catch a user who is busy in finyk/routine/nutrition.
      showOn: "both",
    };
  }, [workouts, loaded]);
}
