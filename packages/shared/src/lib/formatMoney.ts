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
 *    Ukrainian-language UI (NBSP between groups, comma decimal).
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
  try {
    return value.toLocaleString("uk-UA", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
  } catch {
    // Older runtimes without full Intl support — fall back to a plain
    // `toFixed`, accepting the loss of thousand separators.
    return value.toFixed(max);
  }
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
