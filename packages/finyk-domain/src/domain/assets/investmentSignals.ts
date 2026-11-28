/**
 * Чи схожа банківська операція на рух у відкладення (спека
 * `docs/work/specs/finyk-investment-suggestions.md`): основа карток «Схоже на
 * купівлю ОВДП», «Схоже на відкриття депозиту» і «Дохід з …» для операцій,
 * яких ще ніхто не привʼязував до активу.
 *
 * AI-CONTEXT: кожна фраза взята з реальної виписки Monobank власника
 * (2026-11-26). Нову фразу додавай лише разом із тестом на справжній рядок
 * виписки. Повернення з активу фразою не впізнається навмисно: у виписці
 * його фраз немає, а «Повне погашення …» і «Погашення наступного платежу»
 * там означають погашення кредиту.
 */

/** Напрямок, у який операція рухає гроші активу. */
export type InvestmentDirection = "contribution" | "income";

/** Тип активу, на який указує сигнал. */
export type InvestmentKind = "ovdp" | "deposit";

export interface InvestmentSignal {
  direction: InvestmentDirection;
  kind: InvestmentKind;
}

export interface InvestmentSignalTx {
  description?: string | null | undefined;
  mcc?: number | string | null | undefined;
  /** Знак визначає напрямок: списання відʼємне, надходження додатне. */
  amount?: number | null | undefined;
}

/** Брокери й дилери цінних паперів (ISO 18245): «Дія | Військові облігації». */
const BROKER_MCC = 6211;

const CONTRIBUTION_PHRASES: ReadonlyArray<[RegExp, InvestmentKind]> = [
  [/купівля\s+облігацій/iu, "ovdp"],
  [/відкриття\s+депозиту/iu, "deposit"],
];

const INCOME_PHRASES: ReadonlyArray<[RegExp, InvestmentKind]> = [
  [/процент\s+від\s+облігацій/iu, "ovdp"],
];

/** «Скасування. Купівля облігацій» обробляє `refundMatching.ts`, не активи. */
const CANCELLATION_RE = /^\s*скасування\b/iu;

export function investmentSignalOf(
  tx: InvestmentSignalTx,
): InvestmentSignal | null {
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const description = String(tx.description ?? "");
  if (CANCELLATION_RE.test(description)) return null;

  if (amount < 0) {
    for (const [re, kind] of CONTRIBUTION_PHRASES) {
      if (re.test(description)) return { direction: "contribution", kind };
    }
    if (Number(tx.mcc) === BROKER_MCC) {
      return { direction: "contribution", kind: "ovdp" };
    }
    return null;
  }

  for (const [re, kind] of INCOME_PHRASES) {
    if (re.test(description)) return { direction: "income", kind };
  }
  return null;
}
