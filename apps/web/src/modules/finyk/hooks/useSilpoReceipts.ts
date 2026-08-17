/**
 * Last validated: 2026-08-17
 * Status: Active — walking-skeleton experiment (Silpo MCP integration,
 * track A). See `docs/90-work/planning/specs/silpo-mcp-integration.md`.
 */
import { useQuery } from "@tanstack/react-query";
import {
  isApiError,
  silpoApi,
  type SilpoReceiptDetailDto,
  type SilpoReceiptsListParams,
  type SilpoReceiptsPage,
} from "@shared/api";
import { authAwareRetry } from "@shared/lib/api/queryClient";
import { silpoKeys } from "@shared/lib/api/queryKeys";

const STALE_TIME = 30_000;

/**
 * `GET /api/silpo/receipts` — cursor-paginated list. `enabled` defaults to
 * `true`; pass `false` while the sync-state isn't `"connected"` yet (no
 * point querying receipts for a disconnected/disabled integration).
 */
export function useSilpoReceipts(
  params?: SilpoReceiptsListParams,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const query = useQuery<SilpoReceiptsPage>({
    queryKey: silpoKeys.receipts(params),
    queryFn: ({ signal }) => silpoApi.receipts(params, { signal }),
    enabled,
    staleTime: STALE_TIME,
    retry: authAwareRetry(2),
  });
  return {
    data: query.data ?? null,
    receipts: query.data?.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? null,
  };
}

/**
 * `GET /api/silpo/receipts/:id` — summary + line items for one receipt.
 * 404 (`NOT_FOUND`) is a legitimate outcome (receipt was wiped, or a stale
 * `receiptId` reference) — surfaced as `notFound: true` rather than an
 * error banner, since the caller (receipt section in transaction details)
 * degrades to "no receipt" either way.
 */
export function useSilpoReceiptDetail(receiptId: string | null | undefined) {
  const query = useQuery<SilpoReceiptDetailDto>({
    queryKey: silpoKeys.receiptDetail(receiptId ?? ""),
    queryFn: ({ signal }) =>
      silpoApi.receiptDetail(receiptId as string, { signal }),
    enabled: Boolean(receiptId),
    staleTime: STALE_TIME,
    retry: (failureCount, error) =>
      !(isApiError(error) && error.status === 404) && failureCount < 2,
  });
  const notFound = isApiError(query.error) && query.error.status === 404;
  return {
    data: notFound ? null : (query.data ?? null),
    isLoading: query.isLoading,
    notFound,
  };
}

/**
 * Finds the receipt (if any) linked to a given mono transaction, and loads
 * its line items. Two-step lookup because `SilpoReceiptSummaryDto.
 * transactionId` lives only on the list endpoint — there's no
 * `GET /api/silpo/receipts?transactionId=` filter in this experiment's
 * REST surface (see spec § Поверхня змін), so the summary page is fetched
 * once (cached under `silpoKeys.receipts({ limit: 100 })`, shared across
 * every open transaction sheet) and matched client-side.
 */
export function useSilpoReceiptForTransaction(
  transactionId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const list = useSilpoReceipts({ limit: 100 }, { enabled });
  const summary =
    list.receipts.find((r) => r.transactionId === transactionId) ?? null;
  const detail = useSilpoReceiptDetail(
    enabled ? (summary?.receiptId ?? null) : null,
  );
  return {
    summary,
    detail: detail.data,
    isLoading:
      enabled && (list.isLoading || (Boolean(summary) && detail.isLoading)),
  };
}
