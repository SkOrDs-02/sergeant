/**
 * Last validated: 2026-07-31
 * Status: Active
 *
 * Kyiv-month clamp for Finyk transaction lists.
 *
 * AI-DANGER: every "цього місяця" aggregate on Огляд / Планування must run
 * through this. The Finyk selectors (`calcFinykSpendingTotal`,
 * `getMonthlySummary`, `calcCategorySpent`) carry **no** implicit month
 * window — they aggregate exactly what you hand them.
 *
 * AI-CONTEXT: the input lists are not month-scoped either. The read overlay in
 * `useMonobankWebhook` substitutes the full SQLite mirror (every transaction
 * ever synced — `refreshFinykMonoMirrorState` has no time bound) whenever the
 * current-month network slice comes back empty, which is precisely the state
 * on the first day of a new month. Several call sites assumed an implicit
 * window that never existed and reported all-time totals under a monthly
 * label: on 1 серпня 2026 Огляд showed «Витрати 128 842 ₴» for серпень and an
 * insight card claimed «Продукти: використано 521% ліміту», while the Операції
 * tab — which clamps, see `useTransactionFilters.monthBankTxs` — was correctly
 * empty (founder report 2026-07-31).
 *
 * Anchored on Kyiv day keys rather than host-local `Date` getters, so the
 * month boundary is identical on any device timezone (domain time invariant).
 */
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";

/** Minimal shape the clamp reads. Matches `Transaction` and manual rows. */
interface TxLike {
  /** Unix seconds (a few legacy mirror rows carry milliseconds). */
  time?: number | undefined;
  /** "YYYY-MM-DD" fallback carried by older manual entries. */
  date?: string | undefined;
}

/**
 * Epoch-ms for a transaction, or `null` when it carries no usable timestamp.
 * Callers must exclude a `null` row rather than treat it as epoch 0 — an
 * undated row belongs to no month.
 */
export function txEpochMs(tx: TxLike | null | undefined): number | null {
  if (!tx) return null;
  const raw = Number(tx.time);
  if (Number.isFinite(raw) && raw > 0) {
    // 10-digit threshold disambiguates seconds from milliseconds.
    return raw > 10_000_000_000 ? raw : raw * 1000;
  }
  if (typeof tx.date === "string" && tx.date) {
    const parsed = new Date(tx.date).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** `"YYYY-MM"` for the current Kyiv civil month. */
export function currentKyivMonthPrefix(at?: number | Date): string {
  const { year, month } = getKyivDateParts(at);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Keep only the rows whose Kyiv calendar day falls inside `monthPrefix`
 * (`"YYYY-MM"`). Rows without a usable timestamp are dropped.
 */
export function filterToKyivMonth<T extends TxLike>(
  transactions: readonly T[] | null | undefined,
  monthPrefix: string,
): T[] {
  const list = Array.isArray(transactions) ? transactions : [];
  return list.filter((tx) => {
    const ms = txEpochMs(tx);
    return ms != null && getKyivDayKey(ms).startsWith(monthPrefix);
  });
}
