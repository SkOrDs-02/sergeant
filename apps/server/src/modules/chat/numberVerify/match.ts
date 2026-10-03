/**
 * Звірка чисел відповіді з «поданим» (ADR-0097).
 *
 * Число з відповіді «пояснене», якщо:
 *   1. воно стоїть у поданому дослівно (з урахуванням формату й похибки), або
 *   2. воно виводиться ТІЛЬКИ з чисел, які ця ж відповідь уже показала:
 *      сума 2-6 операндів або різниця (знакова комбінація до 6 операндів),
 *      причому виведене раніше число саме може бути операндом пізніших
 *      («ланцюжок за порядком у тексті»: 18 090, далі 32 000 - 18 090).
 * Усе інше - розбіжність.
 *
 * Чому операнди беруться лише з відповіді, а не з усього поданого: комбінацій
 * із 60 чисел контексту завжди вистачить на будь-яке число, і звірка
 * перетворилась би на «вигадане теж знайдеться». Відповідь же показує
 * кілька чисел, і сума з них, названа тут же, перевіряється людиною на око.
 *
 * Межі, які варто знати (зафіксовані в каноні): дії, відмінні від суми й
 * різниці (відсоток, середнє, ділення), не виводяться; слівні частки
 * («третина») не читаються; пропуск складової суми («3490 неврахованих»)
 * цей механізм не бачить, бо не вигадане число, а непомічена відсутність.
 */

import { type NumberToken, extractNumberTokens, tokenKind } from "./extract.js";
import type { NumberKind } from "./normalize.js";
import { type GivenCorpus } from "./givenCorpus.js";

/** Скільки операндів максимум у виведеній комбінації. */
export const MAX_DERIVATION_OPERANDS = 6;
/** Скільки різних операндів розглядається для одного числа. */
export const MAX_POOL_SIZE = 12;
/** Скільки нез'ясованих чисел намагаємось вивести; решта - розбіжність. */
export const MAX_DERIVATION_TARGETS = 40;

export type Explained = "given" | "derived" | "none";

export interface VerifiedToken {
  token: NumberToken;
  kind: NumberKind;
  explained: Explained;
}

export type VerifyOutcome = "ok" | "mismatch" | "no_scoped";

export interface VerifyResult {
  outcome: VerifyOutcome;
  /** Перевірювані числа відповіді в порядку появи. */
  scoped: VerifiedToken[];
  /** Скільки чисел поза скоупом (відсотки, лічильники, малі суми, дати...). */
  unscopedCount: number;
  /** Підмножина `scoped`, де `explained === "none"`. */
  unexplained: VerifiedToken[];
}

function literalHit(token: NumberToken, given: GivenCorpus): boolean {
  if (given.has(token.value, token.tol)) return true;
  if (token.alt !== null && given.has(token.alt, token.tol)) return true;
  // «1 500 г» у відповіді проти «1,5 кг» у поданому: та сама вага, інша одиниця.
  return token.unit === "g" && given.has(token.value / 1000, token.tol / 1000);
}

/**
 * Чи є комбінація з 2-6 операндів (перший зі знаком `+`, решта `±`), модуль
 * суми якої збігається з метою в межах похибки. Модуль, бо знак у відповіді
 * відкинуто: «перевитрата 6 200» це 28 000 - 34 200.
 */
export function isDerivable(
  target: number,
  tol: number,
  operands: readonly number[],
): boolean {
  const n = operands.length;
  const walk = (from: number, count: number, sum: number): boolean => {
    for (let i = from; i < n; i++) {
      const v = operands[i] as number;
      const signs = count === 0 ? [1] : [1, -1];
      for (const sign of signs) {
        const next = sum + sign * v;
        const size = count + 1;
        if (size >= 2 && Math.abs(Math.abs(next) - target) <= tol) return true;
        if (size < MAX_DERIVATION_OPERANDS && walk(i + 1, size, next)) {
          return true;
        }
      }
    }
    return false;
  };
  return walk(0, 0, 0);
}

interface PoolEntry {
  /** Позиція токена в тексті відповіді - для вибору найближчих. */
  index: number;
  value: number;
}

/**
 * Операнд-кандидат: число з одиницею (будь-якого розміру) або голе число від
 * 100, яке дослівно є в поданому. Відсотки операндами не бувають.
 */
function isOperandCandidate(token: NumberToken): boolean {
  if (token.percent) return false;
  return token.unit !== null || token.value >= 100;
}

/** Різні за значенням операнди, найближчі до цілі за позицією в тексті. */
function pickPool(
  entries: readonly PoolEntry[],
  targetIndex: number,
): number[] {
  const byDistance = [...entries].sort(
    (a, b) =>
      Math.abs(a.index - targetIndex) - Math.abs(b.index - targetIndex) ||
      a.index - b.index,
  );
  const seen = new Set<string>();
  const out: number[] = [];
  for (const entry of byDistance) {
    const key = entry.value.toFixed(6);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.value);
    if (out.length >= MAX_POOL_SIZE) break;
  }
  return out;
}

/**
 * Звіряє числа відповіді з поданим.
 *
 * Чиста функція: те саме на вході дає той самий результат. Операнди різних
 * значень, а не різних входжень: повторене в тексті число (`960`, потім ще
 * раз `960`) не перетворюється на «два по 960».
 */
export function verifyNumbers(
  answer: string,
  given: GivenCorpus,
): VerifyResult {
  const tokens = extractNumberTokens(answer);
  const literalOperands: PoolEntry[] = [];
  tokens.forEach((token, index) => {
    if (isOperandCandidate(token) && literalHit(token, given)) {
      literalOperands.push({ index, value: token.value });
    }
  });

  const derivedOperands: PoolEntry[] = [];
  const scoped: VerifiedToken[] = [];
  let derivationBudget = MAX_DERIVATION_TARGETS;

  tokens.forEach((token, index) => {
    if (!token.scoped) return;
    const kind = tokenKind(token);
    if (kind === null) return;

    let explained: Explained = "none";
    if (literalHit(token, given)) {
      explained = "given";
    } else if (
      derivedOperands.some((d) => Math.abs(d.value - token.value) <= token.tol)
    ) {
      // Повтор уже виведеного числа («залишається 13 910», далі ще раз те саме).
      explained = "derived";
    } else if (derivationBudget > 0) {
      derivationBudget -= 1;
      const pool = pickPool([...literalOperands, ...derivedOperands], index);
      if (isDerivable(token.value, token.tol, pool)) explained = "derived";
    }
    if (explained === "derived") {
      derivedOperands.push({ index, value: token.value });
    }
    scoped.push({ token, kind, explained });
  });

  const unexplained = scoped.filter((s) => s.explained === "none");
  let outcome: VerifyOutcome = "ok";
  if (scoped.length === 0) outcome = "no_scoped";
  else if (unexplained.length > 0) outcome = "mismatch";

  return {
    outcome,
    scoped,
    unscopedCount: tokens.length - scoped.length,
    unexplained,
  };
}
