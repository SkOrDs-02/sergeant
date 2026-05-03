import { useQuery } from "@tanstack/react-query";
import { type MonoTransactionDto } from "@shared/api";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { authAwareRetry } from "@shared/lib/api/queryClient";
import { fetchAllMonoTransactions } from "./monoTransactionsLoader";

const STALE_TIME = 30_000;
const GC_TIME = 5 * 60_000;

export interface UseMonoTransactionsResult {
  transactions: MonoTransactionDto[];
  isFetching: boolean;
  isLoading: boolean;
  error: unknown;
}

/**
 * DB-backed hook for reading Monobank transactions via the new
 * `/api/mono/transactions` endpoint (Track B).
 *
 * This is the webhook-era replacement for `useMonoStatements` which
 * calls Monobank API directly. The legacy hook remains intact behind
 * the feature flag — this hook is off by default until Track C cutover.
 */
export function useMonoTransactions(
  rangeFrom?: string,
  rangeTo?: string,
  accountId?: string,
  { enabled = true }: { enabled?: boolean } = {},
): UseMonoTransactionsResult {
  const { data, isFetching, isLoading, error } = useQuery({
    queryKey: finykKeys.monoTransactionsDb(rangeFrom, rangeTo, accountId),
    queryFn: ({ signal }) =>
      fetchAllMonoTransactions(
        { from: rangeFrom, to: rangeTo, accountId },
        { signal },
      ),
    enabled,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    refetchOnWindowFocus: true,
    retry: authAwareRetry(2),
    retryDelay: (attempt: number) => 1000 * (attempt + 1),
  });

  return {
    transactions: data ?? [],
    isFetching,
    isLoading,
    error: error ?? null,
  };
}
