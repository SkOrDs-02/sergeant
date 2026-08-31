import { useMemo, useCallback } from "react";
import { dedupeAndSortTransactions } from "@sergeant/finyk-domain/domain/transactions";
import { getMonoTotals } from "@sergeant/finyk-domain/lib/accounts";
import { CURRENCY } from "@sergeant/finyk-domain/constants";
import type { useMonobank } from "./useMonobank";
import type { usePrivatbank } from "./usePrivatbank";

type MonoLike = ReturnType<typeof useMonobank>;
type PrivatLike = ReturnType<typeof usePrivatbank>;

interface UseUnifiedFinanceDataArgs {
  mono: MonoLike;
  privat: PrivatLike;
  /**
   * Рахунки, вимкнені тумблером «Враховувати картку» (`finyk_hidden`).
   *
   * AI-CONTEXT: єдина точка, де виключення застосовується до транзакцій.
   * Баланси вже фільтруються всередині `getMonoTotals`/`filterVisibleAccounts`,
   * але транзакції розходяться звідси у Огляд, Аналітику, Транзакції,
   * Бюджети та quick-stats Хабу — тому фільтр стоїть тут, а не в кожному
   * споживачі окремо.
   */
  hiddenAccountIds?: readonly string[] | undefined;
}

export function useUnifiedFinanceData({
  mono,
  privat,
  hiddenAccountIds,
}: UseUnifiedFinanceDataArgs) {
  const mergedRefresh = useCallback(async () => {
    const tasks = [mono.refresh()];
    if (privat.connected) tasks.push(privat.refresh());
    await Promise.allSettled(tasks);
  }, [mono, privat]);

  const mergedMono = useMemo(() => {
    const privatTxs = privat.transactions || [];
    const monoTxs = mono.realTx || [];
    const hidden = new Set(hiddenAccountIds ?? []);
    const merged = dedupeAndSortTransactions([...monoTxs, ...privatTxs]);
    const combined =
      hidden.size === 0
        ? merged
        : merged.filter((t) => {
            const accountId = t._accountId ?? t.accountId;
            return typeof accountId !== "string" || !hidden.has(accountId);
          });
    const monoAccounts = (mono.accounts || []).map((a) => ({
      ...a,
      _source: "monobank" as const,
    }));
    // PrivatBank's account shape carries `currency` as a string ("UAH"),
    // not `currencyCode`: map it onto the ISO-4217 numeric code so the
    // account can go through the same `getMonoTotals` UAH-only-balance /
    // creditLimit→debt rules as Monobank accounts (§1.3 finding: a bare
    // `balance/100` sum here ignored the hidden-account toggle and paid no
    // attention to overdrafts/credit limits).
    const privatAccounts = (privat.accounts || []).map((a) => ({
      ...a,
      _source: "privatbank" as const,
      currencyCode:
        a.currency === "UAH" || a.currency === "980"
          ? (CURRENCY.UAH as number)
          : undefined,
    }));
    const allAccounts = [...monoAccounts, ...privatAccounts];
    const { balance: privatTotal, debt: privatDebt } = getMonoTotals(
      privatAccounts,
      hiddenAccountIds ?? [],
    );

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
      privatDebt,
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
  }, [mono, privat, mergedRefresh, hiddenAccountIds]);

  return { mergedMono, mergedRefresh };
}
