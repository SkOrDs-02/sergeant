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

import { extractNumberTokens, tokenKind } from "./extract.js";
import type { NumberKind } from "./normalize.js";

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
   *
   * З `kind` збігаються лише числа того самого виду або голі числа (у JSON
   * інструментів одиниць немає): «2 000 грн» не пояснюється «2000 ккал».
   */
  has(value: number, tol: number, kind?: NumberKind | null): boolean;
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

function sortedUnique(values: readonly number[]): Float64Array {
  return Float64Array.from(
    [...new Set(values.filter((v) => Number.isFinite(v)))].sort(
      (a, b) => a - b,
    ),
  );
}

function hasNear(sorted: Float64Array, value: number, tol: number): boolean {
  const i = lowerBound(sorted, value - tol);
  return i < sorted.length && (sorted[i] as number) <= value + tol;
}

/**
 * Корпус із готового списку значень (для тестів і для складання з частин).
 * `values` голі числа, `byKind` числа з одиницею за видом.
 */
export function corpusFromValues(
  values: readonly number[],
  byKind: Partial<Record<NumberKind, readonly number[]>> = {},
): GivenCorpus {
  const bare = sortedUnique(values);
  const kinds = new Map<NumberKind, Float64Array>();
  const all = new Set(bare);
  for (const [kind, list] of Object.entries(byKind)) {
    const sorted = sortedUnique(list ?? []);
    kinds.set(kind as NumberKind, sorted);
    for (const v of sorted) all.add(v);
  }
  return {
    size: all.size,
    has(value, tol, kind) {
      if (hasNear(bare, value, tol)) return true;
      if (kind) {
        const sorted = kinds.get(kind);
        return sorted !== undefined && hasNear(sorted, value, tol);
      }
      for (const sorted of kinds.values()) {
        if (hasNear(sorted, value, tol)) return true;
      }
      return false;
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
  const byKind: Record<NumberKind, number[]> = {
    money: [],
    mass: [],
    energy: [],
  };
  const texts = [
    ...(sources.contexts ?? []),
    ...(sources.toolResults ?? []),
    ...(sources.userMessages ?? []),
    ...(sources.assistantMessages ?? []),
  ];
  for (const text of texts) {
    if (!text) continue;
    for (const token of extractNumberTokens(text)) {
      const kind = tokenKind(token);
      const target = kind ? byKind[kind] : values;
      target.push(token.value);
      if (token.alt !== null) target.push(token.alt);
    }
  }
  return corpusFromValues(values, byKind);
}
