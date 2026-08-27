/**
 * Centralized hryvnia / generic-currency formatter.
 *
 * Single source of truth for ₴ amounts across the web app and shared
 * package — replaces the previous patchwork of `toFixed(0) + " ₴"`,
 * `value.toLocaleString("uk-UA")`, ad-hoc `Intl.NumberFormat` calls,
 * and bespoke "грн" suffixes that produced visibly different sums in
 * neighbouring surfaces (TxRow vs BentoCard vs HubSearch).
 *
 * Conventions:
 *  - Locale is `uk-UA` so thousand separators match the rest of the
 *    Ukrainian-language UI (NBSP between groups, comma decimal). The
 *    separator is normalised to U+00A0 by `formatNumberUk` — Intl's own
 *    U+202F is too narrow to read at our type sizes.
 *  - The currency symbol is appended with a regular space (`"1 250 ₴"`)
 *    — this matches the TxRow/HubSearch convention and is the format
 *    `Intl.NumberFormat("uk-UA", { style: "currency" })` produces too.
 *  - Fraction digits default to `0` (whole hryvnia) — most surfaces
 *    show round amounts. Pass `{ minFractionDigits: 2 }` for the
 *    split-editor / debt subtitle where kopecks matter.
 *  - Inputs are assumed to be in *hryvnia* (not kopecks). Helpers that
 *    work in kopecks should divide by 100 before calling this. The
 *    `formatMoneyFromKopecks` helper does that and rounds away tiny
 *    floating-point drift introduced by the division.
 *
 * `fmtAmt` in `@sergeant/finyk-domain` is a parallel formatter that
 * handles the transaction-row case (with leading "+" sign, no space
 * before the symbol, currency-code dispatch). It is intentionally left
 * alone here so existing transaction visuals don't shift; new sites
 * should prefer `formatMoney` for non-transaction sums.
 */

import { formatNumberUk } from "./formatNumber";

export interface FormatMoneyOptions {
  /**
   * Currency symbol appended after the formatted number with a single
   * space. Defaults to `"₴"`.
   */
  symbol?: string;
  /**
   * If `true`, positive non-zero amounts are prefixed with `"+"`.
   * Negative amounts always render with the locale's minus sign — the
   * caller does not need to pass an absolute value.
   */
  signed?: boolean;
  /**
   * Minimum fraction digits passed to `toLocaleString`. Defaults to
   * `0`. When set without `maxFractionDigits`, the maximum is bumped
   * to match so `1250` always renders as `"1 250,00"` (not
   * `"1 250,00…"`).
   */
  minFractionDigits?: number;
  /**
   * Maximum fraction digits passed to `toLocaleString`. Defaults to
   * the value of `minFractionDigits` (or `0` if neither is set).
   */
  maxFractionDigits?: number;
}

function formatNumberUkUA(value: number, min: number, max: number): string {
  // Роздільник розрядів приходить із `formatNumberUk` — один на весь
  // продукт (U+00A0, не вузький U+202F від Intl). Деталі — у `formatNumber.ts`.
  return formatNumberUk(value, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/**
 * Format a hryvnia amount. See module-level docstring for conventions.
 */
export function formatMoney(
  amount: number,
  opts: FormatMoneyOptions = {},
): string {
  const {
    symbol = "₴",
    signed = false,
    minFractionDigits = 0,
    maxFractionDigits = minFractionDigits,
  } = opts;
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = formatNumberUkUA(
    safe,
    minFractionDigits,
    maxFractionDigits,
  );
  const sign = signed && safe > 0 ? "+" : "";
  return `${sign}${formatted} ${symbol}`;
}

/**
 * Convenience wrapper for kopecks-denominated amounts (Finyk stores
 * transaction sums in kopecks). Performs the `/100` and clamps tiny
 * floating-point residue (`1.0000000002 → 1`) before formatting.
 */
export function formatMoneyFromKopecks(
  amountInKopecks: number,
  opts: FormatMoneyOptions = {},
): string {
  const safe = Number.isFinite(amountInKopecks) ? amountInKopecks : 0;
  // Round to the nearest kopeck before division so 199 / 100 stays at
  // 1.99 (not 1.99000000…2) regardless of upstream arithmetic noise.
  const hryvnia = Math.round(safe) / 100;
  return formatMoney(hryvnia, opts);
}

// ─── Типографічний розклад суми (анти-слоп П4) ───────────────────────────────

/** Справжній мінус U+2212, а не дефіс: він однакової ширини з цифрами. */
export const MINUS_SIGN = "−";

/**
 * Вузький нерозривний пробіл U+202F — між сумою і символом валюти.
 * Escape-послідовністю, а не літералом: невидимий символ у коді ловить
 * `no-irregular-whitespace` і читається як випадковість.
 */
export const NARROW_NBSP = "\u202F";

/**
 * Сума, розкладена на частини, які можна набрати РІЗНИМ кеглем.
 *
 * Гривні домінують; знак, копійки й символ валюти — окремі тири.
 */
export interface MoneyParts {
  /** `""`, `"+"` або `MINUS_SIGN`. */
  sign: string;
  /** Цілі гривні з розрядами: `"1 250"`. */
  integer: string;
  /** Копійки БЕЗ роздільника: `"50"`. Порожньо, якщо їх не показуємо. */
  fraction: string;
  /** Роздільник дробової частини локалі (`","` для uk-UA). */
  decimalSeparator: string;
  /** Символ валюти. */
  symbol: string;
}

/**
 * Розкласти суму на типографічні частини.
 *
 * AI-CONTEXT: розбирається САМЕ рядок із `formatMoney`, а не число
 * незалежним кодом. Інакше компонент і текстовий формат розійшлись би в
 * групуванні розрядів чи в округленні, і та сама сума виглядала б по-різному
 * в картці та в тексті поруч. Один формат — одне джерело.
 *
 * Знак нормалізується до U+2212: дефіс у більшості шрифтів вужчий за цифру,
 * тож у стовпчику сум рядки з мінусом «зʼїжджають» відносно рядків без нього.
 * Це рівно та дрібниця, з якої складається типографіка чисел (анти-слоп П4).
 */
export function splitMoneyParts(
  amount: number,
  opts: FormatMoneyOptions = {},
): MoneyParts {
  const { symbol = "₴", signed = false } = opts;
  const minFractionDigits = opts.minFractionDigits ?? 0;
  const maxFractionDigits = opts.maxFractionDigits ?? minFractionDigits;

  const safe = Number.isFinite(amount) ? amount : 0;
  const body = formatNumberUkUA(
    Math.abs(safe),
    minFractionDigits,
    maxFractionDigits,
  );

  // Роздільник — перший не-цифровий і не-пробільний символ праворуч наліво.
  // Беремо з форматованого рядка, а не з константи: локаль може змінитись,
  // і хардкод «,» тихо перетворив би копійки на частину цілого.
  const sep = /\d([.,])\d+$/.exec(body)?.[1] ?? "";
  const cut = sep === "" ? -1 : body.lastIndexOf(sep);
  const integer = cut === -1 ? body : body.slice(0, cut);
  const fraction = cut === -1 ? "" : body.slice(cut + 1);

  const sign = safe < 0 ? MINUS_SIGN : signed && safe > 0 ? "+" : "";

  return { sign, integer, fraction, decimalSeparator: sep, symbol };
}
