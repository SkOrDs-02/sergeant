/**
 * Старіння 1RM і протокол повернення — pure.
 *
 * AI-CONTEXT: канон [`fizruk.md §6`] дослівно вимагає дві зчеплені механіки,
 * яких модуль не мав: (1) після N тижнів без вправи її 1RM позначається
 * **застарілою**, бо сила за паузу впала і рахувати робочу вагу від старого
 * піка небезпечно; (2) після паузи вмикається **мʼякий режим** зі зниженими
 * орієнтирами і **без порівняння з піком** — повернення це окремий
 * продуктовий стан, а не «продовжуй, де зупинився».
 *
 * Код робив протилежне обом пунктам: `computeExerciseBest().best1rm` — це
 * максимум за ВСЮ історію без поля віку, і калькулятор навантаження рахував
 * відсотки саме від нього. Після трьох тижнів перерви користувач бачив вагу
 * від піка, якого вже не підніме.
 *
 * AI-DANGER: `reference1rm` — це число, від якого людина кладе вагу на
 * штангу. Зміна, що піднімає його ближче до піка, знімає рівно той захист,
 * заради якого модуль існує (канон §4–§6 — «контракти довіри тіла»). Будь-яка
 * правка порогів іде разом із бампом `METRICS_VERSION`.
 *
 * Пік НЕ переписуємо: рекорд лишається рекордом і далі показується як
 * `peak1rm`. Старіє не досягнення, а його придатність як орієнтира.
 */

import type { ExerciseBestSummary } from "./exerciseDetail.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Скільки днів без цієї вправи роблять 1RM застарілою.
 *
 * ⚠️ **Інженерний дефолт, не рішення founder-а.** Канон каже «після N тижнів»
 * і N не називає. 28 днів (4 тижні) обрано як нижня межа, на якій втрата сили
 * після повного припинення навантаження вже стабільно описана в літературі і
 * при цьому звичайна відпустка на 2 тижні ще не вмикає мʼякий режим —
 * інакше режим повернення спрацьовував би на кожному відпочинку і знецінився.
 * Ратифікація — окремий крок.
 */
export const ONE_RM_STALE_AFTER_DAYS = 28;

/**
 * Наскільки знижуємо орієнтир за кожен тиждень ПОНАД поріг застарілості.
 *
 * ⚠️ Інженерний дефолт. Канон вимагає «знижені орієнтири», числа не дає.
 * 2.5%/тиждень — навмисно консервативний нахил: помилка «дав занизьку вагу»
 * коштує одного легкого підходу, помилка «дав завищену» коштує травми.
 */
export const ONE_RM_DECAY_PER_WEEK = 0.025;

/**
 * Нижня межа зниження. Далі падати не даємо: після дуже довгої паузи число
 * все одно перестає щось означати, і чесніше показати «застаріле» словом,
 * ніж вдавати точність зниженням до нуля.
 */
export const ONE_RM_DECAY_FLOOR = 0.75;

/**
 * Скільки днів після ЗНЯТТЯ позначки травми тримається режим повернення.
 *
 * Це закриває розрив E-5 з [ADR-0083](../../../../../docs/04-governance/adr/0083-injury-model-zone-level.md):
 * позначка блокувала вправу, а її зняття повертало користувача одразу до
 * повних орієнтирів від піка — тобто найнебезпечніший момент циклу був
 * єдиним, який продукт ніяк не позначав.
 */
export const INJURY_RETURN_WINDOW_DAYS = 21;

/**
 * Коефіцієнт орієнтира одразу після зняття позначки травми.
 *
 * ⚠️ Інженерний дефолт, і саме тут він найконсервативніший: 0.9 діє навіть
 * тоді, коли пауза була коротка і за критерієм давності 1RM ще «свіжа».
 */
export const INJURY_RETURN_FACTOR = 0.9;

/** Чому ввімкнено мʼякий режим. `null` — режим вимкнено. */
export type ReturnReason = "layoff" | "injury";

export interface OneRmAgingInput {
  /** Пік за всю історію (`ExerciseBestSummary.best1rm`). */
  readonly peak1rm: number;
  /** ISO часу піка — для підпису «рекорд від …». */
  readonly peakAt?: string | null;
  /** ISO останнього СИЛОВОГО підходу цієї вправи. */
  readonly lastSessionAt?: string | null;
  /** ISO зняття позначки травми, що накривала цю вправу (E-5). */
  readonly injuryClearedAt?: string | null;
  readonly now?: Date | number | undefined;
  /** Перевизначення порогу застарілості (тести, майбутні налаштування). */
  readonly staleAfterDays?: number | undefined;
}

export interface OneRmAging {
  /** Рекорд лишається рекордом — не занижуємо і не ховаємо. */
  readonly peak1rm: number;
  readonly peakAt: string | null;
  /** Днів від останнього силового підходу. `null` — історії немає. */
  readonly daysSinceLastSession: number | null;
  /** Днів від зняття позначки травми. `null` — позначки не було. */
  readonly daysSinceInjuryCleared: number | null;
  /** 1RM застаріла — показувати її як орієнтир без застереження не можна. */
  readonly isStale: boolean;
  /**
   * Число, від якого рахуємо робочу вагу. Дорівнює піку, поки той свіжий.
   */
  readonly reference1rm: number;
  /** На скільки відсотків орієнтир нижчий за пік (0 — не занижений). */
  readonly reductionPct: number;
  /** Мʼякий режим: знижені орієнтири, порівняння з піком ховаємо. */
  readonly returnMode: boolean;
  readonly returnReason: ReturnReason | null;
  /** Поріг, за яким рахували — щоб UI не вигадував власне число. */
  readonly staleAfterDays: number;
}

function toMs(value: Date | number | undefined): number {
  if (value instanceof Date) return value.getTime();
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Date.now();
}

function daysSince(
  iso: string | null | undefined,
  nowMs: number,
): number | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  // Майбутні дати (кривий годинник, ручний імпорт) — це 0 днів тому, не
  // відʼємна давність, інакше орієнтир «омолодився» б.
  return Math.max(0, Math.floor((nowMs - t) / MS_PER_DAY));
}

/**
 * Розібране старіння 1RM для однієї вправи.
 *
 * Функція не дивиться в історію сама — вона працює з уже згорнутим піком,
 * тож викликач контролює скоуп (наприклад, обмежує діапазоном дат).
 */
export function computeOneRmAging(input: OneRmAgingInput): OneRmAging {
  const nowMs = toMs(input.now);
  const staleAfterDays =
    typeof input.staleAfterDays === "number" && input.staleAfterDays > 0
      ? Math.floor(input.staleAfterDays)
      : ONE_RM_STALE_AFTER_DAYS;

  const peak1rm = Number.isFinite(input.peak1rm)
    ? Math.max(0, input.peak1rm)
    : 0;
  const peakAt = input.peakAt ?? null;
  const daysSinceLastSession = daysSince(input.lastSessionAt, nowMs);
  const daysSinceInjuryCleared = daysSince(input.injuryClearedAt, nowMs);

  const isStale =
    peak1rm > 0 &&
    daysSinceLastSession !== null &&
    daysSinceLastSession >= staleAfterDays;

  // Затухання за простій: рахуємо лише ПОНАД поріг, тож на 28-й день
  // орієнтир ще дорівнює піку — застереження вмикається раніше за зниження.
  let factor = 1;
  if (isStale && daysSinceLastSession !== null) {
    const weeksOver = (daysSinceLastSession - staleAfterDays) / 7;
    factor = Math.max(
      ONE_RM_DECAY_FLOOR,
      1 - weeksOver * ONE_RM_DECAY_PER_WEEK,
    );
  }

  const injuryReturn =
    daysSinceInjuryCleared !== null &&
    daysSinceInjuryCleared <= INJURY_RETURN_WINDOW_DAYS;
  if (injuryReturn) {
    // Беремо СУВОРІШИЙ із двох коефіцієнтів, не добуток: два незалежні
    // приводи для обережності не мають множитись у безглуздо низьке число.
    factor = Math.min(factor, INJURY_RETURN_FACTOR);
  }

  const returnMode = peak1rm > 0 && (isStale || injuryReturn);
  const returnReason: ReturnReason | null = !returnMode
    ? null
    : injuryReturn
      ? "injury"
      : "layoff";

  const reference1rm = peak1rm > 0 ? peak1rm * factor : 0;

  return {
    peak1rm,
    peakAt,
    daysSinceLastSession,
    daysSinceInjuryCleared,
    isStale,
    reference1rm,
    reductionPct: Math.round((1 - factor) * 100),
    returnMode,
    returnReason,
    staleAfterDays,
  };
}

/** Зручна обгортка над згорнутим підсумком вправи. */
export function computeOneRmAgingForSummary(
  summary: ExerciseBestSummary,
  options: Omit<OneRmAgingInput, "peak1rm" | "peakAt" | "lastSessionAt"> = {},
): OneRmAging {
  return computeOneRmAging({
    ...options,
    peak1rm: summary.best1rm,
    peakAt: summary.bestSet?.at ?? null,
    lastSessionAt: summary.lastStrengthAt,
  });
}
