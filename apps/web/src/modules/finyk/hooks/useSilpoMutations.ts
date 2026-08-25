/**
 * Last validated: 2026-08-17
 * Status: Active — walking-skeleton experiment (Silpo MCP integration,
 * track A). See `docs/90-work/planning/specs/silpo-mcp-integration.md`.
 *
 * `sync` / `disconnect` / `wipe` mutations for the Settings integration
 * card. Mirrors the Mono webhook pattern in `FinykWebhookServiceSection`:
 * `disconnect` only tears down `silpo_connection` (receipts survive),
 * `wipe` is the separate, explicitly-confirmed destructive action.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  silpoApi,
  type SilpoDisconnectResponse,
  type SilpoSyncResult,
  type SilpoUnlinkResponse,
  type SilpoWipeResponse,
} from "@shared/api";
import { finykKeys, hubKeys, silpoKeys } from "@shared/lib/api/queryKeys";

export function useSilpoSync() {
  const queryClient = useQueryClient();
  return useMutation<SilpoSyncResult, unknown, void>({
    mutationFn: () => silpoApi.sync(),
    onSuccess: () => {
      // `SilpoSyncResult` carries per-stage counts, not the full
      // `SilpoSyncState` shape (`receiptsCount`/`accessTokenExpiresAt`) —
      // simplest correct move is invalidating so the next read comes
      // straight from the server instead of a hand-assembled partial.
      void queryClient.invalidateQueries({ queryKey: silpoKeys.syncState });
      void queryClient.invalidateQueries({ queryKey: silpoKeys.all });
      // New receipts can flip `finyk_tx_receipt_links` for transactions
      // already in the mono cache — the "Чек" section in
      // `BankTransactionDetailsSheet` reads `silpoKeys.receipts(...)`
      // directly, but the mono transaction list/hub preview may also want
      // a refresh once matching finished.
      void queryClient.invalidateQueries({ queryKey: finykKeys.mono });
      void queryClient.invalidateQueries({
        queryKey: hubKeys.preview("finyk"),
      });
    },
  });
}

export function useSilpoDisconnect() {
  const queryClient = useQueryClient();
  return useMutation<SilpoDisconnectResponse, unknown, void>({
    mutationFn: () => silpoApi.disconnect(),
    onSuccess: () => {
      // Mono-pattern (`disconnectWebhook` in `FinykWebhookServiceSection`):
      // drop the sync-state cache entirely rather than invalidate — the
      // next read must not show a stale "connected" row while refetching.
      queryClient.removeQueries({ queryKey: silpoKeys.syncState });
      // Receipts themselves are untouched by disconnect (spec § Рішення
      // дизайну) — no need to clear `silpoKeys.receipts`/`receiptDetail`.
    },
  });
}

export function useSilpoWipe() {
  const queryClient = useQueryClient();
  return useMutation<SilpoWipeResponse, unknown, void>({
    mutationFn: () => silpoApi.wipe(),
    onSuccess: () => {
      // Wipe deletes receipts/items/links — every cached page and detail
      // under the `silpo` prefix is now wrong; the sync-state's
      // `receiptsCount` also drops to 0.
      void queryClient.invalidateQueries({ queryKey: silpoKeys.all });
    },
  });
}

/**
 * «Це не той чек» — знімає хибну пару «транзакція ↔ чек», яку поставив
 * детермінований matcher (збіг суми у вікні ±1 доба). Пара запамʼятовується
 * на сервері як відхилена, тож найближчий sync її не відновить.
 *
 * Інвалідовуємо весь `silpoKeys.all`, а не лише сторінку цієї транзакції:
 * чек повертається в «Чеки без транзакції» на картці налаштувань, а та
 * читає інший ключ.
 */
export function useSilpoUnlinkReceipt() {
  const queryClient = useQueryClient();
  return useMutation<SilpoUnlinkResponse, unknown, string>({
    mutationFn: (transactionId: string) =>
      silpoApi.unlinkReceipt(transactionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: silpoKeys.all });
    },
  });
}
