/**
 * «Подане»: усі числа, які модель бачила на вході цього ходу (ADR-0097).
 *
 * Число з відповіді вважається не вигаданим, якщо воно стоїть у «поданому»
 * дослівно або виводиться з чисел, які ця ж відповідь уже показала (див.
 * `match.ts`). Тут зібрано лише першу частину.
 *
 * Що входить: динамічний контекст (`augmentedContext` / `clientContext`),
 * результати інструментів ТАК, як їх бачила модель (після маски PII й
 * усічення, без маркера усічення), повідомлення користувача і попередні
 * відповіді асистента. Чого немає: статичного префікса промпта (його числа
 * не дані користувача) і аргументів tool_use (їх пише сама модель).
 */

import { extractNumberTokens } from "./extract.js";

export interface GivenSources {
  /** Динамічний системний контекст: знімок даних, RAG, кореляції. */
  contexts?: readonly string[];
  /** `content` результатів інструментів після маски й усічення. */
  toolResults?: readonly string[];
  userMessages?: readonly string[];
  /** Попередні відповіді асистента з історії діалогу. */
  assistantMessages?: readonly string[];
}

export interface GivenCorpus {
  /** Скільки різних чисел у корпусі. */
  readonly size: number;
  /**
   * Чи є в корпусі число, що відрізняється від `value` не більше ніж на `tol`.
   * Знак не враховується: числа в корпусі читаються без знака.
   */
  has(value: number, tol: number): boolean;
}

/** Корпус без жодного числа: усе, що не виведене з відповіді, буде нез'ясованим. */
export const EMPTY_GIVEN: GivenCorpus = {
  size: 0,
  has: () => false,
};

function lowerBound(sorted: Float64Array, target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as number) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Корпус із готового списку значень (для тестів і для складання з частин). */
export function corpusFromValues(values: readonly number[]): GivenCorpus {
  const sorted = Float64Array.from(
    [...new Set(values.filter((v) => Number.isFinite(v)))].sort(
      (a, b) => a - b,
    ),
  );
  return {
    size: sorted.length,
    has(value, tol) {
      const i = lowerBound(sorted, value - tol);
      return i < sorted.length && (sorted[i] as number) <= value + tol;
    },
  };
}

/**
 * Збирає корпус із джерел. Береться кожне число тексту, з одиницею чи без:
 * у результатах інструментів воно нерідко стоїть голим (`"amount": 12000`),
 * а двозначний запис (`1.240`) вносить обидва прочитання.
 */
export function buildGivenCorpus(sources: GivenSources): GivenCorpus {
  const values: number[] = [];
  const texts = [
    ...(sources.contexts ?? []),
    ...(sources.toolResults ?? []),
    ...(sources.userMessages ?? []),
    ...(sources.assistantMessages ?? []),
  ];
  for (const text of texts) {
    if (!text) continue;
    for (const token of extractNumberTokens(text)) {
      values.push(token.value);
      if (token.alt !== null) values.push(token.alt);
    }
  }
  return corpusFromValues(values);
}
