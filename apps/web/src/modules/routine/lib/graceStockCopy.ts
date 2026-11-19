/**
 * Текст запасу заморозок під серією (Р-4 (а), рішення власника 2026-11-18).
 *
 * Пояснення описує запас, що лишився, і звідки візьметься наступна заморозка.
 * Історію бюджету («1 стартова і 2 за 14 виконань») воно показує лише доти,
 * доки нічого не витрачено: тоді історія і є запасом. Після витрати вона
 * розходилася б із лічильником «N з 4», тож замість неї стоїть лише стан
 * («Стартову витрачено.», «Запас вичерпано.») або нічого, а скільки
 * витрачено, каже підпис серії вище (`graceUsedLabel`).
 */
import type { FlexibleStreakBreakdown } from "@sergeant/routine-domain";
import { pluralUa } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";

const T = messages.routine.streakCanvas;

const DONE_FORMS = {
  one: T.doneFormOne,
  few: T.doneFormFew,
  many: T.doneFormMany,
};

const USED_FORMS = {
  one: T.graceUsedFormOne,
  few: T.graceUsedFormFew,
  many: T.graceUsedFormMany,
};

/** Підставляє `{key}`-плейсхолдери шаблону каталогу. */
export function fillTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** «1 заморозку витрачено», «2 заморозки витрачено», «5 заморозок витрачено». */
export function graceUsedLabel(used: number): string {
  return `${used} ${pluralUa(used, USED_FORMS)} ${T.graceUsedSuffix}`;
}

function stockSentence(b: FlexibleStreakBreakdown): string {
  if (b.graceUsed === 0) {
    return b.graceFromDays > 0
      ? fillTemplate(T.graceSourceStartAndDays, {
          start: b.graceFromStart,
          earned: b.graceFromDays,
          days: b.days,
          doneForm: pluralUa(b.days, DONE_FORMS),
        })
      : fillTemplate(T.graceSourceStart, { start: b.graceFromStart });
  }
  if (b.graceRemaining > 0) return "";
  return b.graceFromDays > 0 ? T.graceSpentAll : T.graceSpentStart;
}

/** Рядок під лічильником «Заморозок у запасі: N з M». */
export function graceSourceLine(b: FlexibleStreakBreakdown): string {
  if (b.graceBudget === 0) return "";
  const next =
    b.daysToNextGrace === null
      ? T.graceAtCap
      : fillTemplate(T.graceNext, {
          days: b.daysToNextGrace,
          doneForm: pluralUa(b.daysToNextGrace, DONE_FORMS),
        });
  return [stockSentence(b), next].filter(Boolean).join(" ");
}
