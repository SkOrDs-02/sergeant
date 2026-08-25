/**
 * Last validated: 2026-08-17
 * Status: Active — walking-skeleton experiment (Silpo MCP integration,
 * track A). See `docs/90-work/planning/specs/silpo-mcp-integration.md`.
 */
import { useQuery } from "@tanstack/react-query";
import { isApiError, silpoApi, type SilpoSyncState } from "@shared/api";
import { silpoKeys } from "@shared/lib/api/queryKeys";

const STALE_TIME = 30_000;

/** Server-verified states (`SilpoSyncState["status"]`) plus a client-only
 *  `"disabled"` synthetic state derived from the 503 `SILPO_DISABLED` kill
 *  switch — the server never emits it as a real status, so it can't live in
 *  the shared zod schema (Hard Rule #3 triplet). */
export type SilpoIntegrationStatus =
  SilpoSyncState["status"] | "disabled" | "unknown";

export interface UseSilpoSyncStateResult {
  data: SilpoSyncState | null;
  /** `"disabled"` when `SILPO_ENABLED=false` server-side (503
   *  `SILPO_DISABLED`) — the UI renders a quiet "не увімкнена" card instead
   *  of surfacing this as a broken connection. `"unknown"` covers any other
   *  query error (network/5xx) where we genuinely don't know the state. */
  status: SilpoIntegrationStatus;
  isLoading: boolean;
  isFetching: boolean;
  /** True only for errors that are NOT the expected `SILPO_DISABLED` case —
   *  a real failure the retry-button copy should react to. */
  isError: boolean;
  refetch: () => void;
}

function isSilpoDisabledError(error: unknown): boolean {
  if (!isApiError(error) || error.status !== 503) return false;
  const body = error.body;
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { code?: unknown }).code === "SILPO_DISABLED"
  );
}

/**
 * `GET /api/silpo/sync-state` — feeds the Settings integration card
 * (disconnected / connected / reauth_required) and gates the "Чек" section
 * in `BankTransactionDetailsSheet`.
 *
 * `enabled` lets callers defer the fetch until their section scrolls into
 * view (mirrors `FinykWebhookServiceSection`'s `inView` gate).
 */
export function useSilpoSyncState({
  enabled = true,
}: { enabled?: boolean } = {}): UseSilpoSyncStateResult {
  const query = useQuery<SilpoSyncState>({
    queryKey: silpoKeys.syncState,
    queryFn: ({ signal }) => silpoApi.syncState({ signal }),
    enabled,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
    // 503 SILPO_DISABLED is a steady-state "feature off" answer, not a
    // transient failure — retrying it just burns requests against the
    // kill switch. Other errors (network/5xx) still get the default
    // queryClient-level retry from `createAppQueryClient()`.
    retry: (failureCount, error) =>
      !isSilpoDisabledError(error) && failureCount < 2,
  });

  // `SILPO_DISABLED` must win over a stale cached `data` — a refetch that
  // lands on the kill switch (feature turned off after the cache already
  // had a "connected" answer) has to flip the card to the quiet disabled
  // state, not keep showing the last-known-good connection.
  const status: SilpoIntegrationStatus = isSilpoDisabledError(query.error)
    ? "disabled"
    : query.data
      ? query.data.status
      : query.isError
        ? "unknown"
        : "unknown";

  return {
    data: query.data ?? null,
    status,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError && status === "unknown",
    refetch: () => void query.refetch(),
  };
}
