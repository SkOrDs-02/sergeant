/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Детекція «дані Mono не оновлювались N днів» — контракт довіри §6.3
 * канону finyk: «продукт має помітити й сказати».
 *
 * AI-CONTEXT: тут навмисно НЕ діагностується причина. Канон §6.3 фіксує
 * ключову асиметрію: **тиша webhook-а ззовні ідентична тиші користувача** —
 * «витрат не було» і «звʼязок обірвався» виглядають однаково, бо
 * `last_event_at` рухає лише подія від банку. Розрізнити їх наявними
 * даними неможливо. Тому функція відповідає рівно на те питання, на яке
 * має відповідь: **скільки днів немає оновлень**. Формулювати це як
 * «звʼязок обірвався» було б вигадкою, а мовчати — тією самою тихою
 * брехнею про фінансову картину, проти якої написаний §6.3.
 *
 * Поріг — 7 днів (рішення founder-а 2026-07-25). Тиждень без жодної
 * транзакції майже завжди означає проблему, а не ощадливість; 3 дні
 * давали б хибні тривоги, 14 — дві тижні мовчазно застарілих цифр.
 */

/** Поріг тиші, після якого показуємо staleness. Рішення founder-а. */
export const MONO_STALENESS_THRESHOLD_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface MonoStalenessInput {
  /**
   * `lastEventAt` із `GET /api/mono/sync-state` (ISO-8601) — момент
   * останньої події від банку. `null`, якщо подій не було жодної.
   */
  readonly lastEventAt: string | null | undefined;
  /**
   * Чи вважається зʼєднання активним (`status === 'active'` і webhook
   * зареєстрований). Для неактивного зʼєднання staleness не рахуємо:
   * там уже своя, точніша розповідь («відключено», «токен невалідний»),
   * і дублювати її розмитим «дані застаріли» — гірше, ніж мовчати.
   */
  readonly webhookActive: boolean;
  /** Поточний час. Передається явно, щоб функція лишалась чистою. */
  readonly now: Date;
  /** Перевизначення порога — лише для тестів. */
  readonly thresholdDays?: number;
}

export interface MonoStalenessResult {
  /** `true`, коли банк мовчить довше за поріг. */
  readonly stale: boolean;
  /**
   * Скільки повних днів немає оновлень. `null`, коли рахувати нема від
   * чого (немає активного зʼєднання, немає жодної події, або дата
   * непарситься).
   */
  readonly days: number | null;
}

const NOT_STALE: MonoStalenessResult = { stale: false, days: null };

/**
 * Скільки повних днів минуло з останньої події банку і чи перетнуло це
 * поріг тиші.
 *
 * Не діагностує причину — див. докстрінг модуля.
 *
 * Повертає `{ stale: false, days: null }`, коли зʼєднання неактивне,
 * подій ще не було, або `lastEventAt` непарситься. Майбутній
 * `lastEventAt` (розбіжність годинників пристрою і сервера) дає 0 днів,
 * а не відʼємне число — клемп навмисний, інакше UI показав би «-2 дні».
 */
export function evaluateMonoStaleness(
  input: MonoStalenessInput,
): MonoStalenessResult {
  const { lastEventAt, webhookActive, now } = input;
  const thresholdDays = input.thresholdDays ?? MONO_STALENESS_THRESHOLD_DAYS;

  if (!webhookActive) return NOT_STALE;
  if (!lastEventAt) return NOT_STALE;

  const last = new Date(lastEventAt);
  const lastMs = last.getTime();
  if (Number.isNaN(lastMs)) return NOT_STALE;

  const nowMs = now.getTime();
  if (Number.isNaN(nowMs)) return NOT_STALE;

  const days = Math.max(0, Math.floor((nowMs - lastMs) / MS_PER_DAY));

  return { stale: days >= thresholdDays, days };
}
