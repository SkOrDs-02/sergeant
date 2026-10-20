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
 *
 * AI-CONTEXT (аудит 2026-10-01, `logic-04`): давність останньої сесії сама по
 * собі режим повернення не тримає — одна легка сесія після пів року паузи
 * обнуляла її, і орієнтир стрибав назад до повного піка (140 кг при
 * фактичних 76). Тому, коли викликач передає `sessions`, режим повернення
 * після паузи, що вже закінчилась, триває, доки найкращий e1RM сесій після
 * неї не досягне {@link RETURN_EXIT_RATIO} від зниженого піка (пік ×
 * коефіцієнт за довжину тієї паузи). Якщо після довгої паузи йде ще одна (≥ 28
 * днів), поки повернення не завершене, береться найсуворіший коефіцієнт
 * ланцюжка — ні друга пауза, ні її триваюча давність не піднімають орієнтир
 * назад до піка. Без `sessions` поведінка як раніше.
 */

import { epley1rm } from "../../lib/workoutStats.js";
import type {
  ExerciseBestSummary,
  ExerciseHistoryEntry,
} from "./exerciseDetail.js";

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
 * Це закриває розрив E-5 з [ADR-0083](../../../../../docs/governance/adr/0083-injury-model-zone-level.md):
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

/**
 * Частка зниженого піка, яку свіжий e1RM має набрати, щоб режим повернення
 * після паузи вимкнувся.
 *
 * Рішення власника (аудит 2026-10-01, `logic-04`, варіант «а»): режим тримається,
 * доки найкращий e1RM сесій ПІСЛЯ паузи не досягне ≥90% від зниженого піка
 * (`peak1rm * factor`, де factor рахується від довжини паузи). Одна легка
 * сесія повернення режим не знімає.
 */
export const RETURN_EXIT_RATIO = 0.9;

/** Чому ввімкнено мʼякий режим. `null` — режим вимкнено. */
export type ReturnReason = "layoff" | "injury";

/**
 * Одна силова сесія вправи: коли і який найкращий e1RM у ній. `best1rm = 0` —
 * сесія була, але жоден підхід не дає e1RM (понад `E1RM_REP_CAP` повторів):
 * вона рахується виходом у зал (закінчує паузу), але повернення не просуває.
 */
export interface OneRmSessionPoint {
  readonly at: string;
  readonly best1rm: number;
}

export interface OneRmAgingInput {
  /** Пік за всю історію (`ExerciseBestSummary.best1rm`). */
  readonly peak1rm: number;
  /** ISO часу піка — для підпису «рекорд від …». */
  readonly peakAt?: string | null;
  /** ISO останнього СИЛОВОГО підходу цієї вправи. */
  readonly lastSessionAt?: string | null;
  /**
   * Силові сесії цієї вправи: ISO часу + найкращий e1RM сесії (будь-який
   * порядок). Без них функція бачить лише давність останньої сесії і не може
   * відрізнити «повернувся і піднімає як раніше» від «зробив один легкий
   * підхід після пів року паузи» — тоді режим повернення після паузи, що вже
   * закінчилась, не тримається.
   */
  readonly sessions?: readonly OneRmSessionPoint[] | undefined;
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

/** Коефіцієнт зниження орієнтира за паузу в `days` днів (1 — поріг не дійшов). */
function layoffFactor(days: number, staleAfterDays: number): number {
  if (days < staleAfterDays) return 1;
  const weeksOver = (days - staleAfterDays) / 7;
  return Math.max(ONE_RM_DECAY_FLOOR, 1 - weeksOver * ONE_RM_DECAY_PER_WEEK);
}

interface Comeback {
  /** Найсуворіший коефіцієнт серед непройдених пауз ланцюжка. */
  readonly factor: number;
  /** Найкращий e1RM сесій від першої після найдавнішої паузи ланцюжка. */
  readonly freshBest1rm: number;
}

/**
 * Незавершене повернення: ланцюжок пауз (≥ порогу між сусідніми сесіями), після
 * кожної з яких найкращий e1RM ще нижчий за {@link RETURN_EXIT_RATIO} від
 * `пік × коефіцієнт тієї паузи`. Іде від останньої паузи назад і зупиняється на
 * першій, після якої людина вже повернулась. `null` — незавершеного повернення
 * немає.
 *
 * Фактор береться від ДОВЖИНИ паузи (від її початку — останньої сесії до неї),
 * а не від давності останньої сесії: та після повернення вже майже нуль. Для
 * ланцюжка береться НАЙСУВОРІШИЙ фактор: друга, коротка пауза посеред
 * непройденого повернення не повертає орієнтир до піка (пік 140 → 4 міс → 76 →
 * 30 днів → 80 тримається на 105, а не на 139). Сила почала падати з початку
 * довгої паузи, і ніяка коротка перерва після неї цього не скасовує.
 */
function unfinishedComeback(
  sessions: readonly OneRmSessionPoint[] | undefined,
  staleAfterDays: number,
  peak1rm: number,
): Comeback | null {
  // Сесія з `best1rm = 0` (силова, але без підходу в межах формули Еплі:
  // легка вага на 12-15 повторів) лишається в списку: це справжній вихід у
  // зал, і саме нею закінчується пауза. Відкинути її — значить не побачити
  // паузи й скинути орієнтир до піка після найтиповішого легкого повернення.
  const points = (sessions ?? [])
    .map((s) => ({ t: Date.parse(s.at), best1rm: s.best1rm }))
    .filter(
      (s) =>
        Number.isFinite(s.t) && Number.isFinite(s.best1rm) && s.best1rm >= 0,
    )
    .sort((a, b) => a.t - b.t);

  // Паузи від останньої назад. Для кожної міряємо найкращий e1RM її СЕГМЕНТА
  // (від першої сесії після неї до наступної, новішої паузи): повернення, яке
  // не було завершене до того, як прийшла наступна пауза, лишається в ланцюжку.
  let factor = 1;
  let chainStart = -1;
  let segmentEnd = points.length; // виключно
  for (let i = points.length - 1; i > 0; i--) {
    const gapDays = Math.floor((points[i]!.t - points[i - 1]!.t) / MS_PER_DAY);
    if (gapDays < staleAfterDays) continue;
    const gapFactor = layoffFactor(gapDays, staleAfterDays);
    let segmentBest = 0;
    for (let j = i; j < segmentEnd; j++) {
      segmentBest = Math.max(segmentBest, points[j]!.best1rm);
    }
    // Після цієї паузи людина вже повернулась — давніші нас не стосуються.
    if (segmentBest >= RETURN_EXIT_RATIO * peak1rm * gapFactor) break;
    factor = Math.min(factor, gapFactor);
    chainStart = i;
    segmentEnd = i;
  }
  if (chainStart < 0) return null;

  // Вихід: усе підняте від початку ланцюжка досягло порога СУВОРІШОГО зниження.
  let freshBest1rm = 0;
  for (let j = chainStart; j < points.length; j++) {
    freshBest1rm = Math.max(freshBest1rm, points[j]!.best1rm);
  }
  return freshBest1rm >= RETURN_EXIT_RATIO * peak1rm * factor
    ? null
    : { factor, freshBest1rm };
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
  // Незавершене повернення після попередніх пауз (якщо `sessions` передано).
  // Воно діє і після паузи, що вже закінчилась, і ПІД ЧАС нової паузи: інакше
  // друга перерва посеред непройденого повернення скидала б орієнтир до піка.
  const comeback =
    peak1rm > 0
      ? unfinishedComeback(input.sessions, staleAfterDays, peak1rm)
      : null;
  let factor = 1;
  let freshBest1rm = 0;
  let comebackActive = false;
  if (isStale && daysSinceLastSession !== null) {
    factor = layoffFactor(daysSinceLastSession, staleAfterDays);
    if (comeback) {
      factor = Math.min(factor, comeback.factor);
      freshBest1rm = comeback.freshBest1rm;
    }
  } else if (comeback) {
    comebackActive = true;
    factor = comeback.factor;
    freshBest1rm = comeback.freshBest1rm;
  }

  const injuryReturn =
    daysSinceInjuryCleared !== null &&
    daysSinceInjuryCleared <= INJURY_RETURN_WINDOW_DAYS;
  if (injuryReturn) {
    // Беремо СУВОРІШИЙ із двох коефіцієнтів, не добуток: два незалежні
    // приводи для обережності не мають множитись у безглуздо низьке число.
    factor = Math.min(factor, INJURY_RETURN_FACTOR);
  }

  const returnMode = peak1rm > 0 && (isStale || comebackActive || injuryReturn);
  const returnReason: ReturnReason | null = !returnMode
    ? null
    : injuryReturn
      ? "injury"
      : "layoff";

  // Орієнтир = max(свіжий e1RM, знижений пік). У режимі повернення свіжий
  // e1RM за побудовою нижчий за 90% зниженого піка (найсуворішого в ланцюжку),
  // тож `max` лише страхує: орієнтир не може опуститись нижче того, що людина
  // вже підняла після паузи.
  const reference1rm =
    peak1rm > 0 ? Math.max(freshBest1rm, peak1rm * factor) : 0;
  const effectiveFactor = peak1rm > 0 ? reference1rm / peak1rm : 1;

  return {
    peak1rm,
    peakAt,
    daysSinceLastSession,
    daysSinceInjuryCleared,
    isStale,
    reference1rm,
    reductionPct: Math.round((1 - effectiveFactor) * 100),
    returnMode,
    returnReason,
    staleAfterDays,
  };
}

/**
 * Силові сесії вправи з історії (`collectExerciseHistory`): по одній точці на
 * запис вправи, з найкращим e1RM у ньому (0, якщо e1RM порахувати нема з чого).
 * Вхід `sessions` для {@link computeOneRmAging}.
 */
export function collectStrengthSessionPoints(
  history: readonly ExerciseHistoryEntry[],
): OneRmSessionPoint[] {
  const out: OneRmSessionPoint[] = [];
  for (const { workout, item } of history) {
    if (item?.type !== "strength") continue;
    const at = workout?.startedAt;
    if (typeof at !== "string" || at.length === 0) continue;
    let best1rm = 0;
    for (const s of Array.isArray(item.sets) ? item.sets : []) {
      best1rm = Math.max(best1rm, epley1rm(s.weightKg, s.reps));
    }
    // Точка є для КОЖНОЇ силової сесії, навіть коли e1RM = 0 (reps понад
    // E1RM_REP_CAP): `computeExerciseBest.lastStrengthAt` теж рахує її, тож
    // список сесій і давність останньої не мають розходитись.
    out.push({ at, best1rm });
  }
  return out;
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
