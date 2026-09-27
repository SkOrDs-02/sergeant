/**
 * Петля винагороди: моменти, варті слова (ADR-0096).
 *
 * Запис, який щось справді змінив, отримує рівно один рядок у самому
 * елементі; рядовий запис не отримує нічого. Тут лише чиста логіка над
 * станом до і після запису: без сховища, без React.
 *
 * Пороги не дублюються: ступені серії йдуть із вогника, умови інсайту з
 * самого рушія, квота заморозок із домену. Якщо рушій змінить поріг,
 * момент зсунеться разом із ним.
 */

import {
  calcRoutineDayProgress,
  flexibleStreakBreakdown,
  type RoutineState,
} from "@sergeant/routine-domain";

import { STREAK_MILESTONES } from "../../../modules/routine/hooks/useStreakFlame";
import {
  bestHabitMonthInsight,
  habitInsightProgress,
  HABIT_INSIGHT_MIN_COMPLETIONS,
  HABIT_INSIGHT_MIN_MONTHS,
  HABIT_INSIGHT_MIN_WEEKS,
} from "../../lib/insightsEngine";

export type MomentKind =
  "threshold" | "streak" | "freeze" | "dayClosed" | "approach";

/**
 * Від найрідкіснішого до найчастішого: поріг інсайту перетинається раз,
 * ступінь серії раз на тижні чи місяці, заморозка раз на кілька тижнів,
 * день закривається регулярно. Правило збігу бере перший у цьому порядку,
 * і жодного окремого списку пріоритетів тут немає (ADR-0096 § Decision).
 * Наближення не момент, а підказка про накопичення, тож воно останнє.
 *
 * Порядок спирається на оцінку частоти, не на замір: телеметрія моментів
 * дасть фактичні частоти, і зміна порядку буде зміною ADR, не тихим фіксом.
 */
export const MOMENT_RARITY: readonly MomentKind[] = [
  "threshold",
  "streak",
  "freeze",
  "dayClosed",
  "approach",
];

/** Куди лягає рядок: `"day"` для героя дня, інакше id звички. */
export const DAY_TARGET = "day";

export interface Moment {
  kind: MomentKind;
  target: string;
  /** Ступінь серії (`streak`), лишок заморозок (`freeze`) чи відміток (`approach`). */
  value?: number;
}

/** Один запис дає рівно один рядок: найрідкісніший із кандидатів. */
export function pickRarest(candidates: readonly Moment[]): Moment | null {
  let best: Moment | null = null;
  for (const m of candidates) {
    if (
      !best ||
      MOMENT_RARITY.indexOf(m.kind) < MOMENT_RARITY.indexOf(best.kind)
    ) {
      best = m;
    }
  }
  return best;
}

/** Частка шляху до порога, на якій людина бачить, скільки лишилось. */
export const APPROACH_SHARE = 0.2;

/**
 * Скільки лишилось до порога, якщо людина вже на останніх 20% шляху;
 * інакше `null`. Для 20 тренувань це останні чотири, для 10 спільних днів
 * останні два: пропорція, а не фіксоване число, бо «ще три» по-різному
 * читається на порозі 10 і на порозі 28.
 */
export function approachRemaining(
  count: number,
  threshold: number,
): number | null {
  const remaining = threshold - count;
  if (remaining <= 0) return null;
  return remaining <= Math.floor(threshold * APPROACH_SHARE) ? remaining : null;
}

type RoutineSlice = Pick<RoutineState, "habits" | "completions" | "skips">;

function dayClosed(state: RoutineSlice, todayKey: string): boolean {
  const { completed, scheduled } = calcRoutineDayProgress(
    state.habits,
    state.completions,
    todayKey,
    todayKey,
    state.skips ?? {},
  );
  return scheduled > 0 && completed >= scheduled;
}

/** Дні, які не є ні відміткою, ні пропуском: пауза, вихідний, «не зміг». */
const NEUTRAL_KINDS = new Set(["off", "pause", "skip"]);

export interface RoutineMomentInput {
  prev: RoutineSlice;
  next: RoutineSlice;
  habitId: string;
  dateKey: string;
  todayKey: string;
}

/**
 * Момент, який дає відмітка звички, або `null`, якщо запис рядовий.
 *
 * Лише відмітка на сьогодні: рядок живе до кінця доби, а запис за минулий
 * день не має «сьогодні», у якому його показати. Зняття відмітки моменту
 * не дає ніколи.
 */
export function detectRoutineMoment({
  prev,
  next,
  habitId,
  dateKey,
  todayKey,
}: RoutineMomentInput): Moment | null {
  if (dateKey !== todayKey) return null;
  const wasDone = (prev.completions[habitId] ?? []).includes(dateKey);
  const isDone = (next.completions[habitId] ?? []).includes(dateKey);
  if (wasDone || !isDone) return null;
  const habit = next.habits.find((h) => h.id === habitId);
  if (!habit) return null;

  const candidates: Moment[] = [];

  if (!dayClosed(prev, todayKey) && dayClosed(next, todayKey)) {
    candidates.push({ kind: "dayClosed", target: DAY_TARGET });
  }

  const opts = { skipsForHabit: next.skips?.[habitId] };
  const before = flexibleStreakBreakdown(
    habit,
    prev.completions[habitId],
    todayKey,
    { skipsForHabit: prev.skips?.[habitId] },
  );
  const after = flexibleStreakBreakdown(
    habit,
    next.completions[habitId],
    todayKey,
    opts,
  );
  const milestone = STREAK_MILESTONES.find(
    (m) => before.days < m && after.days >= m,
  );
  if (milestone !== undefined) {
    candidates.push({ kind: "streak", target: habitId, value: milestone });
  }

  // Заморозка спрацювала: сьогоднішня відмітка продовжила серію, а
  // останній запланований день перед сьогодні був мовчазним пропуском.
  // `"miss"` усередині вікна серії за визначенням прощений бюджетом
  // (`FlexibleStreakBreakdown.window`), тож серія його пережила.
  const lastBeforeToday = [...after.window]
    .reverse()
    .find((c) => c.key < todayKey && !NEUTRAL_KINDS.has(c.kind));
  if (lastBeforeToday?.kind === "miss") {
    candidates.push({
      kind: "freeze",
      target: habitId,
      value: after.graceRemaining,
    });
  }

  if (!bestHabitMonthInsight(prev) && bestHabitMonthInsight(next)) {
    candidates.push({ kind: "threshold", target: habitId });
  } else {
    // Наближення показуємо, лише коли бракує тільки відміток: інакше
    // рядок пообіцяв би висновок, який на порозі все одно не зʼявиться.
    const progress = habitInsightProgress(next);
    const remaining = approachRemaining(
      progress.completions,
      HABIT_INSIGHT_MIN_COMPLETIONS,
    );
    if (
      remaining !== null &&
      progress.weeks >= HABIT_INSIGHT_MIN_WEEKS &&
      Object.keys(progress.monthDone).length >= HABIT_INSIGHT_MIN_MONTHS
    ) {
      candidates.push({ kind: "approach", target: habitId, value: remaining });
    }
  }

  return pickRarest(candidates);
}
