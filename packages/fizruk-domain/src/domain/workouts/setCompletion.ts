/**
 * Єдине визначення «підхід зараховано» для всього Фізрука (веб і мобілка).
 *
 * AI-CONTEXT: до 2026-11-18 у модулі жили два різні читання. Лічильник сесії
 * (`isSetDone` у вебі) рахував лише повторення, а `computeWorkoutSetCount`,
 * `loadPointsForItem` і через них `isFullWorkout` — «вага > 0 або повторення
 * > 0». Старт програми сіє по рядку `{вага, 0}` на вправу, тож завершене
 * програмне тренування без жодного виконаного підходу давало N «підходів» у
 * підсумку й телеметрії, навантаження у відновленні і ставало «повноцінним»
 * для стріку. Тепер усі читають цей предикат.
 *
 * Правило: підхід виконано, коли є повторення. Вага може бути 0 (вправи з
 * власною вагою). Рядок лише з вагою — підготовлений, але не виконаний.
 *
 * Виняток один і походить із даних, а не з вибору: утримання й переноски з
 * вагою, імпортовані зі Strong, не мають повторень за природою, а їхній час
 * лежить на вправі (`item.durationSec`, `strongImport.ts`). Для силової
 * вправи з часом на ній підхід із вагою зараховано. У сесії вебу такого
 * поєднання не буває: перемикання типу на силову обнуляє `durationSec`.
 * Вправи типу `time` / `distance` підходів не мають і цим предикатом не
 * читаються: їхнє навантаження йде з тривалості й дистанції.
 */

export interface CompletableSet {
  readonly weightKg?: unknown;
  readonly reps?: unknown;
}

export interface SetCompletionItemContext {
  readonly type?: string | null | undefined;
  readonly durationSec?: unknown;
}

function positive(n: unknown): boolean {
  const x = Number(n);
  return Number.isFinite(x) && x > 0;
}

export function isSetCompleted(
  set: CompletableSet | null | undefined,
  item?: SetCompletionItemContext | null,
): boolean {
  if (!set) return false;
  if (positive(set.reps)) return true;
  return positive(item?.durationSec) && positive(set.weightKg);
}
