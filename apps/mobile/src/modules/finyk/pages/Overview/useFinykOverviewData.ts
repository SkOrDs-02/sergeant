/**
 * Stub data hook for the Finyk Overview screen.
 *
 * Phase 4 PR #3 (this PR) lands the Overview UI itself. The
 * MMKV-backed storage hook (`useFinykStorage`) and the Monobank / Privat
 * hooks (`useMonobank`, `usePrivatbank`) are tracked in subsequent
 * Finyk PRs — once they land, this hook is the single swap-point that
 * turns Overview into a fully live surface.
 *
 * Until then the hook returns an empty, schema-valid payload so the
 * Overview component renders its zero-state branches (empty networth
 * history, no transactions, no budgets) without runtime errors. The
 * return type is the exhaustive `FinykOverviewData` contract so the
 * TypeScript compiler keeps new Overview-side consumers honest.
 */
import { useMemo } from "react";

import type { FinykOverviewData } from "./types";

export function useFinykOverviewData(): FinykOverviewData {
  return useMemo(
    () => ({
      realTx: [],
      loadingTx: false,
      clientInfo: null,
      accounts: [],
      transactions: [],
      privatTotal: 0,

      budgets: [],
      subscriptions: [],
      manualDebts: [],
      receivables: [],
      hiddenAccounts: [],
      excludedTxIds: new Set<string>(),
      monthlyPlan: { income: 0, expense: 0, savings: 0 },
      networthHistory: [],
      txCategories: {},
      txSplits: {},
      manualAssets: [],
      customCategories: [],
      manualExpenses: [],

      frequentCategories: [],
      frequentMerchants: [],

      showBalance: true,
    }),
    [],
  );
}
