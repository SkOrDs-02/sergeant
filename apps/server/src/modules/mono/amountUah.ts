/**
 * Гривнева сума операцій не-гривневих рахунків Monobank
 * (`mono_transaction.amount_uah`, міграція 177; спека
 * `docs/work/specs/finyk-fx-nbu.md`).
 *
 * AI-CONTEXT: у Monobank `amount` лежить у валюті РАХУНКУ, `operationAmount`
 * у валюті ОПЕРАЦІЇ (`currencyCode`). Тому:
 * - операція в гривні (`currencyCode === 980`) з валютної картки: гривнева
 *   сума точна, це `operationAmount`, курс не потрібен;
 * - інакше `amount` × курс НБУ валюти РАХУНКУ на київську дату операції.
 *
 * Добирається при читанні (`/api/mono/transactions`), а не на вебхуку:
 * вебхук не має чекати на зовнішній API, а читання й так добирає старі
 * рядки. Курсу немає - `amount_uah` лишається NULL, рядок у підсумки не йде.
 */
import { toKyivISODate } from "@sergeant/shared";
import { query } from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  getNbuRates,
  nbuRateKey,
  type FetchLike,
  type NbuRatePair,
} from "../fx/nbuRate.js";

const UAH = 980;

/**
 * Валюти рахунку з двома знаками після коми (мінорна одиниця = 1/100), для
 * яких `amount × курс` дає копійки. Інші коди (і `0` у stub-рахунку з
 * невідомою валютою) не перераховуються: краще «курс ще не підтягнувся»,
 * ніж не та сума. Monobank відкриває валютні картки в USD, EUR, PLN, GBP.
 */
const TWO_DECIMAL_ACCOUNT_CURRENCIES: ReadonlySet<number> = new Set([
  840, 978, 985, 826, 756, 203,
]);

/** Стеля рядків на одне читання: решта добереться наступним. */
export const AMOUNT_UAH_FILL_LIMIT = 500;

export interface AmountUahInput {
  readonly amount: number;
  readonly operationAmount: number;
  readonly currencyCode: number;
  readonly accountCurrencyCode: number;
}

/** Курсу не треба: операція в гривні з валютної картки. */
export function exactAmountUah(input: AmountUahInput): number | null {
  return input.currencyCode === UAH ? input.operationAmount : null;
}

/** Чи можна перерахувати `amount` цього рахунку за курсом. */
export function convertibleAccountCurrency(code: number): boolean {
  return TWO_DECIMAL_ACCOUNT_CURRENCIES.has(code);
}

/** Гривнева сума в копійках, або `null`, якщо курсу немає. */
export function computeAmountUah(
  input: AmountUahInput,
  uahPerUnit: number | null,
): number | null {
  const exact = exactAmountUah(input);
  if (exact !== null) return exact;
  if (uahPerUnit === null) return null;
  if (!convertibleAccountCurrency(input.accountCurrencyCode)) return null;
  return Math.round(input.amount * uahPerUnit);
}

interface PendingRow {
  mono_tx_id: string;
  time: Date | string;
  amount: string | number;
  operation_amount: string | number;
  currency_code: number;
  account_currency_code: number;
}

/**
 * Дописати `amount_uah` рядкам не-гривневих рахунків, де його ще немає.
 * Не кидає: збій лишає рядки на наступне читання.
 */
export async function fillMissingAmountUah(
  userId: string,
  options: { fetchImpl?: FetchLike; today?: string } = {},
): Promise<void> {
  try {
    const { rows } = await query<PendingRow>(
      `SELECT t.mono_tx_id, t.time, t.amount,
              t.operation_amount, t.currency_code,
              a.currency_code AS account_currency_code
         FROM mono_transaction t
         JOIN mono_account a
           ON a.user_id = t.user_id AND a.mono_account_id = t.mono_account_id
        WHERE t.user_id = $1
          AND t.deleted_at IS NULL
          AND t.amount_uah IS NULL
          AND a.currency_code <> 980
          -- Лише рядки, які можна перерахувати: інакше назавжди
          -- неконвертовані (stub з кодом 0) займали б ліміт першими й
          -- витісняли старіші доларові операції.
          AND (t.currency_code = 980 OR a.currency_code = ANY($3::int[]))
        ORDER BY t.time DESC
        LIMIT $2`,
      [userId, AMOUNT_UAH_FILL_LIMIT, [...TWO_DECIMAL_ACCOUNT_CURRENCIES]],
      { op: "mono_amount_uah_pending" },
    );
    if (rows.length === 0) return;

    const items = rows.map((row) => ({
      row,
      input: {
        amount: Number(row.amount),
        operationAmount: Number(row.operation_amount),
        currencyCode: Number(row.currency_code),
        accountCurrencyCode: Number(row.account_currency_code),
      },
      date: toKyivISODate(new Date(row.time)),
    }));
    const pairs: NbuRatePair[] = items
      .filter(
        ({ input }) =>
          exactAmountUah(input) === null &&
          convertibleAccountCurrency(input.accountCurrencyCode),
      )
      .map(({ input, date }) => ({
        currencyCode: input.accountCurrencyCode,
        date,
      }));
    const rates = await getNbuRates(pairs, options);

    const ids: string[] = [];
    const amounts: number[] = [];
    const pricedAmounts: number[] = [];
    const pricedOperationAmounts: number[] = [];
    for (const { row, input, date } of items) {
      const rate = rates.get(nbuRateKey(input.accountCurrencyCode, date));
      const amountUah = computeAmountUah(input, rate?.uahPerUnit ?? null);
      if (amountUah === null) continue;
      ids.push(row.mono_tx_id);
      amounts.push(amountUah);
      pricedAmounts.push(input.amount);
      pricedOperationAmounts.push(input.operationAmount);
    }
    if (ids.length === 0) return;
    await query(
      `UPDATE mono_transaction t
          SET amount_uah = v.amount_uah
         FROM unnest($2::text[], $3::bigint[], $4::bigint[], $5::bigint[])
              AS v(mono_tx_id, amount_uah, amount, operation_amount)
        WHERE t.user_id = $1
          AND t.mono_tx_id = v.mono_tx_id
          AND t.amount_uah IS NULL
          -- Поки чекали на НБУ, вебхук міг переписати суми: тоді ця
          -- гривнева сума від старих сум, не пишемо її.
          AND t.amount = v.amount
          AND t.operation_amount = v.operation_amount`,
      [userId, ids, amounts, pricedAmounts, pricedOperationAmounts],
      { op: "mono_amount_uah_fill" },
    );
  } catch (err) {
    logger.warn({
      msg: "mono_amount_uah_fill_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
