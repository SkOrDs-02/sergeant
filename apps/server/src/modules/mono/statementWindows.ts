/**
 * Вікна виписки Monobank для бекфілу історії.
 *
 * Один запит `/personal/statement/{account}/{from}/{to}` покриває щонайбільше
 * 31 добу + 1 годину, тож «три місяці історії» (OD-26 Ф-3 (а), рішення
 * founder-а 2026-11-18) це три запити по 31 дню на рахунок. Обидва шляхи
 * бекфілу (підключення в `historyFetch.ts` і ручна кнопка в `backfill.ts`)
 * беруть вікна звідси, щоб глибина не розійшлась.
 *
 * AI-CONTEXT: вікна йдуть від найновішого до найстарішого, і викликачі
 * зупиняють рахунок на першій помилці. Так перерване оновлення лишає
 * суцільне покриття від «зараз» назад, без дірки посередині, а повторний
 * запуск дотягує решту (дублів немає: upsert за `mono_tx_id`).
 */

/** Максимальне вікно одного запиту виписки, секунди (31 доба). */
export const MONO_STATEMENT_WINDOW_SEC = 31 * 24 * 60 * 60;

/** Скільки вікон тягнемо на рахунок: три місяці, § 11.1 Ф-3 (а). */
export const MONO_HISTORY_WINDOWS = 3;

export interface StatementWindow {
  /** Unix-секунди, включно. */
  from: number;
  /** Unix-секунди, включно. */
  to: number;
}

/**
 * Суцільні вікна без перекриття, найновіше першим: `[now − 31д, now]`,
 * далі кожне наступне закінчується за секунду до початку попереднього.
 */
export function monoHistoryWindows(
  nowSec: number,
  count: number = MONO_HISTORY_WINDOWS,
): StatementWindow[] {
  const out: StatementWindow[] = [];
  let to = nowSec;
  for (let i = 0; i < count; i++) {
    const from = to - MONO_STATEMENT_WINDOW_SEC;
    out.push({ from, to });
    to = from - 1;
  }
  return out;
}

/** Monobank віддає до 500 операцій за запит; повна сторінка = гортаємо далі. */
export const MONO_STATEMENT_PAGE_SIZE = 500;

/**
 * `to` наступної сторінки того самого вікна або `null`, коли гортати нема
 * куди. Межа включна (`to = найстаріша мить сторінки`), а не `найстаріша − 1`:
 * інакше операції з тією самою секундою, що не влізли в 500, губились
 * (аудит 2026-10-01, `data-65`). Повтор операцій на межі прибирає дедуп за
 * id у викликача і upsert за `mono_tx_id`. `null` також тоді, коли сторінка
 * не просунулась (усі 500 в одну секунду з `pageTo`): інакше цикл стояв би.
 */
export function nextStatementPageTo(
  times: readonly number[],
  pageTo: number,
  windowFrom: number,
): number | null {
  if (times.length < MONO_STATEMENT_PAGE_SIZE) return null;
  let oldest = Number.POSITIVE_INFINITY;
  for (const t of times) if (Number.isFinite(t) && t < oldest) oldest = t;
  if (!Number.isFinite(oldest)) return null;
  if (oldest >= pageTo || oldest < windowFrom) return null;
  return oldest;
}
