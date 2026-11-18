/**
 * Один шлях відмітки звички для модуля і для хаба.
 *
 * AI-CONTEXT: OD-29, Р-2 (а), відповідь власника П-17 (А) 2026-11-18:
 * відмітка з блоку «Зараз» на хабі дає ту саму винагороду моменту (рядок
 * моменту, тост віхи), що й у модулі. Тому тут, а не в хабі, живуть обидві
 * половини тапу, які раніше сиділи інлайном у `useRoutineAppState`:
 *
 * 1. `applyHabitCheckIn` — читання свіжого стану, доменний редʼюсер
 *    `applyToggleHabitCompletion` через `toggleHabitCompletion` (розклад,
 *    заборона майбутнього, зняття «не зміг») і запис у сховище;
 * 2. `afterHabitCheckIn` — рядок моменту (`recordRoutineMoment`, ADR-0096)
 *    і подія `routine_habit_checked`.
 *
 * Розділено навмисно: модуль кличе (1) усередині `startTransition`, а (2)
 * поза ним, бо запис у сховище моментів і телеметрія не мають потрапити в
 * render-фазу (докладно — коментар в `onToggleHabit`).
 *
 * Тост віхи серії модуль показує хуком `useStreakMilestoneCelebration` на
 * похідному `streakMax`; хаб цього хука не має, тож кличе
 * `celebrateRoutineStreakMilestone` — ту саму функцію, якою хук і показує
 * тост, з тим самим сховищем зайнятих віх, тож віха не дублюється, коли
 * людина потім відкриє модуль.
 */

import { flexibleMaxActiveStreak } from "@sergeant/routine-domain";
import { celebrateStreakMilestone } from "@shared/hooks/useStreakMilestoneCelebration";
import type { ToastApi } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import { readSignalContext } from "../../../core/observability/valueSignalAttribution";
import { anchoredTodayKey } from "./dayAnchor";
import { recordRoutineMoment } from "./routineMoments";
import { loadRoutineState, toggleHabitCompletion } from "./routineStorage";
import { readStreakExposure } from "./streakExposure";
import type { RoutineState } from "./types";

/** Звідки прийшов тап: значення поля `source` події `routine_habit_checked`. */
export type HabitCheckInSource = "ui" | "hub";

export interface HabitCheckInOutcome {
  /** Чи відмітка справді змінилась (тап по незапланованій звичці — no-op). */
  changed: boolean;
  /** Чи день відмічено після тапу. */
  done: boolean;
  prev: RoutineState;
  next: RoutineState;
}

/** Половина (1): перемкнути відмітку на свіжому стані й записати. */
export function applyHabitCheckIn(
  habitId: string,
  dateKey: string,
): HabitCheckInOutcome {
  const prev = loadRoutineState();
  const next = toggleHabitCompletion(prev, habitId, dateKey);
  return {
    changed: next !== prev,
    done: (next.completions[habitId] ?? []).includes(dateKey),
    prev,
    next,
  };
}

/** Половина (2): рядок моменту і телеметрія. No-op, якщо нічого не змінилось. */
export function afterHabitCheckIn(
  outcome: HabitCheckInOutcome,
  habitId: string,
  dateKey: string,
  source: HabitCheckInSource,
): void {
  if (!outcome.changed) return;
  recordRoutineMoment(outcome.prev, outcome.next, habitId, dateKey);
  trackEvent(ANALYTICS_EVENTS.ROUTINE_HABIT_CHECKED, {
    state: outcome.done ? "done" : "undone",
    source,
    // Ключ, яким домен адресує відмітку: день пристрою (ADR-0078).
    day_key: dateKey,
    // Показаний стрік — максимум по ВСІХ звичках, а чекін per-habit.
    scope: "max_across_habits",
    ...readStreakExposure(),
    ...readSignalContext("routine"),
  });
}

/**
 * Тост віхи серії після відмітки поза модулем. Число — той самий
 * `flexibleMaxActiveStreak`, що й `streakMax` модуля.
 */
export function celebrateRoutineStreakMilestone(
  state: RoutineState,
  todayKey: string,
  success: ToastApi["success"],
): void {
  const streak = flexibleMaxActiveStreak(
    state.habits,
    state.completions,
    todayKey,
    state.skips ?? {},
  );
  celebrateStreakMilestone(
    "routine",
    streak,
    messages.routine.streakMilestone.toast,
    success,
  );
}

/**
 * Відмітка звички з блоку «Зараз» на хабі (П-16 (А) 2026-11-18): чекбокс
 * рядка відмічає звичку за сьогодні (день пристрою), тост несе одну дію
 * «Скасувати», яка проходить тим самим шляхом у зворотний бік (рядок
 * моменту знімається, подія `undone`). Віха серії — окремим тихим тостом,
 * як у модулі.
 *
 * Повертає результат тапу; `changed: false` означає, що звичка сьогодні не
 * запланована або вже відмічена (з іншої вкладки чи пристрою), і тоді
 * тостів немає.
 */
export function checkInHabitFromHub(
  habitId: string,
  toast: Pick<ToastApi, "success">,
): HabitCheckInOutcome {
  const todayKey = anchoredTodayKey();
  // Чекбокс «Зараз» лише відмічає: якщо день уже відмічено (наприклад, з
  // іншої вкладки чи пристрою), тап нічого не знімає.
  const current = loadRoutineState();
  if ((current.completions[habitId] ?? []).includes(todayKey)) {
    return { changed: false, done: true, prev: current, next: current };
  }
  const outcome = applyHabitCheckIn(habitId, todayKey);
  afterHabitCheckIn(outcome, habitId, todayKey, "hub");
  if (!outcome.changed) return outcome;

  const name =
    outcome.next.habits.find((h) => h.id === habitId)?.name ||
    messages.routine.hubCheckIn.unnamed;
  const msg = messages.routine.hubCheckIn.done.replace("{name}", name);
  toast.success(msg, undefined, {
    label: messages.routine.hubCheckIn.undo,
    kind: "undo",
    onClick: () => {
      // Відкат лише знімає: відмітку вже могли зняти в модулі, і тоді
      // повторний тогл поставив би її знову.
      const latest = loadRoutineState();
      if (!(latest.completions[habitId] ?? []).includes(todayKey)) return;
      const back = applyHabitCheckIn(habitId, todayKey);
      afterHabitCheckIn(back, habitId, todayKey, "hub");
    },
  });
  celebrateRoutineStreakMilestone(outcome.next, todayKey, toast.success);
  return outcome;
}
