/**
 * Shared types for the Finyk Analytics screen (mobile port).
 *
 * Mirrors the shape `apps/web/src/modules/finyk/pages/Analytics.tsx`
 * receives via its `mono` + `storage` adapters. Mobile skips the
 * `fetchMonth` / per-month history cache the web page keeps for
 * live Monobank statements — the MMKV-backed tx slice will land in
 * a follow-up PR and will feed the same selectors this page runs.
 *
 * Everything that isn't yet wired on mobile is optional so the
 * `useFinykAnalyticsData` stub can return an empty payload and the
 * screen renders its zero-state branches without runtime errors.
 */
import type {
  Category,
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain";

export interface FinykAnalyticsData {
  /** All transactions known to the app (signed minor units in `amount`). */
  realTx: readonly Transaction[];
  /** True while the parent storage layer is still hydrating. */
  loadingTx: boolean;
  /** Tx ids hidden from analytics (manual exclusions). */
  excludedTxIds: ReadonlySet<string>;
  /** User-overridden category assignment per tx id. */
  txCategories: TxCategoriesMap;
  /** Splits (multi-category) for tx ids. */
  txSplits: TxSplitsMap;
  /** Custom categories the user created. */
  customCategories: readonly Category[];
}
