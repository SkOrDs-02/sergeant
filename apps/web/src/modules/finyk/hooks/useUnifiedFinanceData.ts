import { useMemo, useCallback } from "react";
import { dedupeAndSortTransactions } from "@sergeant/finyk-domain/domain/transactions";
import type { useMonobank } from "./useMonobank";
import type { usePrivatbank } from "./usePrivatbank";

type MonoLike = ReturnType<typeof useMonobank>;
type PrivatLike = ReturnType<typeof usePrivatbank>;

interface UseUnifiedFinanceDataArgs {
  mono: MonoLike;
  privat: PrivatLike;
}

export function useUnifiedFinanceData({
  mono,
  privat,
}: UseUnifiedFinanceDataArgs) {
  const mergedRefresh = useCallback(async () => {
    const tasks = [mono.refresh()];
    if (privat.connected) tasks.push(privat.refresh());
    await Promise.allSettled(tasks);
  }, [mono, privat]);

  const mergedMono = useMemo(() => {
    const privatTxs = privat.transactions || [];
    const monoTxs = mono.realTx || [];
    const combined = dedupeAndSortTransactions([...monoTxs, ...privatTxs]);
    const privatTotal = (privat.accounts || [])
      .filter((a) => a.currency === "UAH" || a.currency === "980")
      .reduce((s, a) => s + (a.balance || 0) / 100, 0);

    const monoAccounts = (mono.accounts || []).map((a) => ({
      ...a,
      _source: "monobank" as const,
    }));
    const privatAccounts = (privat.accounts || []).map((a) => ({
      ...a,
      _source: "privatbank" as const,
    }));
    const allAccounts = [...monoAccounts, ...privatAccounts];

    const hasPrivatError = !!privat.error;
    const privatSyncBad =
      privat.syncState?.status === "error" ||
      privat.syncState?.status === "partial";
    const combinedError =
      mono.error && hasPrivatError
        ? `${mono.error}; ПриватБанк: ${privat.error}`
        : mono.error || (hasPrivatError ? `ПриватБанк: ${privat.error}` : "");
    const combinedSyncStatus =
      mono.syncState?.status === "error" || (privatSyncBad && !privat.loadingTx)
        ? "error"
        : mono.syncState?.status === "partial" || privatSyncBad
          ? "partial"
          : mono.syncState?.status === "loading" || privat.loadingTx
            ? "loading"
            : mono.syncState?.status;
    const combinedSyncState = {
      ...mono.syncState,
      status: combinedSyncStatus,
      lastError: combinedError,
    };

    const monoWithBalance = mono as MonoLike & { totalBalance?: number };
    return {
      ...mono,
      refresh: mergedRefresh,
      realTx: combined,
      transactions: combined,
      accounts: allAccounts,
      totalBalance: (monoWithBalance.totalBalance || 0) + privatTotal,
      privatTotal,
      error: combinedError,
      syncState: combinedSyncState,
      loadingTx: mono.loadingTx || privat.loadingTx,
      lastUpdated:
        !mono.lastUpdated && privat.lastUpdated
          ? privat.lastUpdated
          : !privat.lastUpdated && mono.lastUpdated
            ? mono.lastUpdated
            : mono.lastUpdated && privat.lastUpdated
              ? new Date(
                  Math.max(
                    new Date(mono.lastUpdated).getTime(),
                    new Date(privat.lastUpdated).getTime(),
                  ),
                )
              : mono.lastUpdated || privat.lastUpdated || null,
    };
  }, [mono, privat, mergedRefresh]);

  return { mergedMono, mergedRefresh };
}
