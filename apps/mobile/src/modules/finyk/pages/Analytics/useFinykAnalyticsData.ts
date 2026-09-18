/**
 * Stub data hook for the Finyk Analytics screen (mobile).
 *
 * Follows the same pattern as `useFinykOverviewData`: returns an
 * empty, schema-valid {@link FinykAnalyticsData} payload so the
 * screen renders its zero-state branches without crashing until
 * the MMKV-backed tx slice + Monobank hook land on mobile.
 */
import { useMemo } from "react";

import type { FinykAnalyticsData } from "./types";

export function useFinykAnalyticsData(): FinykAnalyticsData {
  return useMemo(
    () => ({
      realTx: [],
      loadingTx: false,
      excludedTxIds: new Set<string>(),
      txCategories: {},
      txSplits: {},
      customCategories: [],
    }),
    [],
  );
}
