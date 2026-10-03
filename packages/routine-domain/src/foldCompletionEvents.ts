/**
 * Згортка append-only журналу відміток у поточний стан.
 *
 * W1-ROUTINE-APPEND, СТАДІЯ 1. **Споживачів у цій стадії НЕМАЄ — так і має
 * бути.** `sqliteReader` далі будує `completions` зі старого шляху
 * (`routine_entries`), а parity-порівняння fold ↔ completions вмикається аж
 * у стадіях 2-3. Модуль існує зараз, щоб правило згортки було зафіксоване
 * тестами ДО того, як від нього щось залежатиме.
 *
 * Правило згортки для кожної пари `(habitId, dateKey)`:
 *
 *   1. виграє подія з найбільшим `occurredAt`;
 *   2. tie-break за `id` (лексикографічно більший виграє) — детермінований
 *      результат навіть коли два пристрої записали ту саму мілісекунду;
 *   3. переможець зі `state === 'done'` дає членство у множині відміток,
 *      `'undone'` — прибирає.
 *
 * Наслідок: цикл toggle → untoggle → toggle згортається у «відмічено», і
 * при цьому НІЧОГО не втрачається — усі три події лишаються в журналі.
 * Саме цього не вміє поточна мутована множина (audit E-1).
 */

import type { CompletionEvent, FoldedCompletions } from "./types.js";

interface Winner {
  readonly occurredAt: string;
  readonly id: string;
  readonly state: CompletionEvent["state"];
}

/** `true`, якщо `candidate` перемагає поточного переможця. */
function beats(candidate: CompletionEvent, current: Winner): boolean {
  if (candidate.occurredAt !== current.occurredAt) {
    return candidate.occurredAt > current.occurredAt;
  }
  return candidate.id > current.id;
}

/**
 * Роздільник композитного ключа мапи. NUL — той самий прийом, що й у
 * `sqliteWriter/diff.ts`: він не може зустрітись усередині `habitId` чи
 * `dateKey`, тож розбір ключа назад однозначний.
 */
const KEY_SEPARATOR = "\u0000";

/**
 * Згорнути журнал у `habitId → відсортовані dateKey`.
 *
 * Форма результату збігається з `RoutineState.completions`, тож у стадії 3
 * її можна підставити замість парсингу id-рядків `routine_entries` без
 * змін у жодному читачі.
 *
 * Порядок подій на вході НЕ має значення — згортка комутативна за
 * побудовою (перемагає максимум за `(occurredAt, id)`).
 */
export function foldCompletionEvents(
  events: readonly CompletionEvent[],
): FoldedCompletions {
  const winners = new Map<string, Winner>();

  for (const event of events) {
    if (!event.habitId || !event.dateKey) continue;
    const key = `${event.habitId}${KEY_SEPARATOR}${event.dateKey}`;
    const current = winners.get(key);
    if (current && !beats(event, current)) continue;
    winners.set(key, {
      occurredAt: event.occurredAt,
      id: event.id,
      state: event.state,
    });
  }

  const out: FoldedCompletions = {};
  for (const [key, winner] of winners) {
    if (winner.state !== "done") continue;
    const idx = key.indexOf(KEY_SEPARATOR);
    const habitId = key.slice(0, idx);
    const dateKey = key.slice(idx + 1);
    const bucket = out[habitId];
    if (bucket) bucket.push(dateKey);
    else out[habitId] = [dateKey];
  }
  for (const dateKeys of Object.values(out)) dateKeys.sort();
  return out;
}
