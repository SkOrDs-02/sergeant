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
 * коефіцієнт за довжину тієї паузи). Без `sessions` поведінка як раніше.
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

/** Одна силова сесія вправи: коли і який найкращий e1RM у ній. */
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
  /** Коефіцієнт, розрахований від довжини паузи, що передувала поверненню. */
  readonly factor: number;
  /** Найкращий e1RM сесій від першої після паузи і далі. */
  readonly freshBest1rm: number;
}

/**
 * Остання завершена пауза (≥ порогу між двома сусідніми сесіями) і те, що
 * людина підняла від першої сесії після неї. Фактор береться від ДОВЖИНИ цієї
 * паузи (від її початку — останньої сесії до неї), а не від давності
 * останньої сесії: та після повернення вже майже нуль.
 */
function latestComeback(
  sessions: readonly OneRmSessionPoint[] | undefined,
  staleAfterDays: number,
): Comeback | null {
  const points = (sessions ?? [])
    .map((s) => ({ t: Date.parse(s.at), best1rm: s.best1rm }))
    .filter(
      (s) =>
        Number.isFinite(s.t) && Number.isFinite(s.best1rm) && s.best1rm > 0,
    )
    .sort((a, b) => a.t - b.t);

  for (let i = points.length - 1; i > 0; i--) {
    const cur = points[i]!;
    const prev = points[i - 1]!;
    const gapDays = Math.floor((cur.t - prev.t) / MS_PER_DAY);
    if (gapDays < staleAfterDays) continue;
    let freshBest1rm = 0;
    for (let j = i; j < points.length; j++) {
      freshBest1rm = Math.max(freshBest1rm, points[j]!.best1rm);
    }
    return { factor: layoffFactor(gapDays, staleAfterDays), freshBest1rm };
  }
  return null;
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
  let freshBest1rm = 0;
  let comebackActive = false;
  if (isStale && daysSinceLastSession !== null) {
    factor = layoffFactor(daysSinceLastSession, staleAfterDays);
  } else if (peak1rm > 0) {
    // Пауза закінчилась (була сесія) — але режим повернення не вимикається,
    // доки свіжий e1RM не дійде до RETURN_EXIT_RATIO зниженого піка.
    const comeback = latestComeback(input.sessions, staleAfterDays);
    if (
      comeback &&
      comeback.freshBest1rm < RETURN_EXIT_RATIO * peak1rm * comeback.factor
    ) {
      comebackActive = true;
      factor = comeback.factor;
      freshBest1rm = comeback.freshBest1rm;
    }
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
  // e1RM за побудовою нижчий за 90% зниженого піка, тож `max` лише страхує
  // від зсуву порога виходу: орієнтир не може опуститись нижче того, що
  // людина вже підняла після паузи.
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
 * запис вправи, з найкращим e1RM у ньому. Вхід `sessions` для
 * {@link computeOneRmAging}.
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
    if (best1rm > 0) out.push({ at, best1rm });
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
