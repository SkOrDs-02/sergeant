/**
 * Pure aggregation helpers for the Finyk Assets page.
 *
 * Mirrors the hand-rolled reductions that
 * `apps/web/src/modules/finyk/pages/Assets.tsx` performs inline. Moving
 * the math here keeps the web + mobile ports bit-for-bit identical and
 * lets us unit-test rollups (networth, total-assets, total-liabilities)
 * without spinning up React.
 *
 * Everything is deterministic, DOM-free, and safe for `useMemo` /
 * server-side use.
 */

import { calcDebtRemaining, calcReceivableRemaining } from "../debtEngine.js";
import { getMonoTotals, type MonoAccount } from "../../lib/accounts.js";
import { CURRENCY_SYMBOL } from "../../constants.js";
import type { Transaction } from "../types.js";
import type {
  AssetsDebt,
  AssetsReceivable,
  AssetsSummary,
  AssetsSummaryInput,
  ManualAsset,
} from "./types.js";

/**
 * Sum UAH-denominated manual assets. Non-UAH entries are ignored —
 * Assets (and Overview) treat the FX portfolio as out-of-scope for
 * networth until a live FX rate is wired up. Non-UAH assets are a paid
 * feature (`multi-currency` gate in `AssetsForm.tsx`), so callers that
 * surface this total to the user must also surface the excluded count —
 * see `nonUahManualAssetCount` in `useOverviewData.ts` and the Overview
 * banner in `Overview.tsx`.
 */
export function sumManualAssetsUAH(
  manualAssets: readonly ManualAsset[] | null | undefined,
): number {
  if (!manualAssets) return 0;
  return manualAssets
    .filter((a) => a.currency === "UAH")
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);
}

/**
 * Sum the "remaining" (still-owed) amount across a list of debts. Each
 * debt's own remaining amount is clamped to `≥ 0` inside
 * {@link calcDebtRemaining}.
 */
export function sumDebtsRemaining(
  debts: readonly AssetsDebt[] | null | undefined,
  transactions: readonly Transaction[] = [],
): number {
  if (!debts) return 0;
  return debts.reduce(
    (sum, d) => sum + calcDebtRemaining(d, transactions as Transaction[]),
    0,
  );
}

/**
 * Sum the "remaining" amount owed to the user across receivables. Same
 * clamp semantics as {@link sumDebtsRemaining}.
 */
export function sumReceivablesRemaining(
  receivables: readonly AssetsReceivable[] | null | undefined,
  transactions: readonly Transaction[] = [],
): number {
  if (!receivables) return 0;
  return receivables.reduce(
    (sum, r) => sum + calcReceivableRemaining(r, transactions as Transaction[]),
    0,
  );
}

/**
 * Hide-list-aware filter for Mono accounts. Mirrors
 * `accounts.filter((a) => !hiddenAccounts.includes(a.id))` used on web
 * but accepts both `undefined` ids and read-only inputs.
 */
export function filterVisibleAccounts(
  accounts: readonly MonoAccount[],
  hiddenAccounts: readonly string[] = [],
): MonoAccount[] {
  const hidden = new Set(hiddenAccounts);
  return accounts.filter((a) => !(a.id !== undefined && hidden.has(a.id)));
}

/**
 * Map an ISO-4217 numeric currency code to its symbol. Defaults to `₴`
 * so unknown / missing codes render as the local currency — same
 * behaviour as `apps/web/src/modules/finyk/pages/Assets.tsx`.
 */
export function getAccountCurrencySymbol(
  currencyCode: number | null | undefined,
): string {
  if (currencyCode == null) return "₴";
  return CURRENCY_SYMBOL[currencyCode] ?? "₴";
}

/**
 * Map an ISO-4217 alpha code (manual-asset `currency` field) to its
 * symbol. Unknown codes round-trip back as the input so the UI can
 * still display them without crashing.
 */
export function getManualAssetCurrencySymbol(currency: string): string {
  if (currency === "UAH") return "₴";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return currency;
}

/**
 * Compute the complete Assets-page rollup in a single pass. Consumers
 * (mobile `AssetsPage`, web `Assets.tsx`) can spread the result straight
 * into the networth header without re-running any of the individual
 * sub-selectors.
 */
export function computeAssetsSummary(input: AssetsSummaryInput): AssetsSummary {
  const {
    accounts,
    hiddenAccounts = [],
    manualAssets,
    manualDebts,
    receivables,
    transactions,
  } = input;

  const { balance: monoBalance, debt: monoDebt } = getMonoTotals(
    accounts,
    // getMonoTotals takes a mutable `string[]` — readonly → string[] is
    // safe because `getMonoTotals` only reads the array.
    hiddenAccounts as string[],
  );

  const manualAssetTotal = sumManualAssetsUAH(manualAssets);
  const manualDebtTotal = sumDebtsRemaining(manualDebts, transactions);
  const receivableTotal = sumReceivablesRemaining(receivables, transactions);

  const totalAssets = monoBalance + manualAssetTotal + receivableTotal;
  const totalLiabilities = monoDebt + manualDebtTotal;
  const networth = totalAssets - totalLiabilities;

  return {
    monoBalance,
    monoDebt,
    manualAssetTotal,
    manualDebtTotal,
    receivableTotal,
    totalAssets,
    totalLiabilities,
    networth,
  };
}
