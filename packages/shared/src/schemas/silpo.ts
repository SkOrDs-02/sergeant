import { z } from "zod";

/**
 * Silpo MCP integration — canonical response/query shapes (Hard Rule #3
 * SSOT). Server (`apps/server/src/routes/silpo.ts`) parses every response
 * through these schemas before `res.json()`; `@sergeant/api-client` derives
 * its wire types from the same `z.infer<>` (added in the api-client-agent
 * follow-up stage of this squad run).
 *
 * Spec: `docs/90-work/planning/specs/silpo-mcp-integration.md`. This is the
 * **walking-skeleton experiment** (§ Експеримент, 2026-08-17) — the live
 * MCP endpoint has not been exercised yet (spike §0 pending), so the DTOs
 * below describe our OWN normalized storage shape (`silpo_receipts` /
 * `silpo_receipt_items`, migration 121), not the raw MCP tool payload. That
 * boundary is intentional: whatever the real `silpo_get_my_*_orders` field
 * names turn out to be, this contract does not change — only the
 * (provisional) parsing in `modules/silpo/receipts.ts` does.
 */

/**
 * Connection lifecycle as surfaced to the client. `disconnected` is
 * synthetic (no `silpo_connection` row) — the DB `status` CHECK only knows
 * `connected` | `reauth_required` (migration 121); the third state exists
 * only at the API boundary, mirroring `MonoConnectionStatusSchema`'s
 * `disconnected` member.
 */
export const SilpoConnectionStatusSchema = z.enum([
  "disconnected",
  "connected",
  "reauth_required",
]);
export type SilpoConnectionStatus = z.infer<typeof SilpoConnectionStatusSchema>;

/**
 * Response of `GET /api/silpo/sync-state`. Drives the Settings integration
 * card (connect / connected / "reauth needed" banner) — mirrors
 * `MonoSyncStateSchema`'s role for the Monobank card.
 */
export const SilpoSyncStateSchema = z.object({
  status: SilpoConnectionStatusSchema,
  /** `silpo_connection.access_token_expires_at`, ISO-8601 or null. */
  accessTokenExpiresAt: z.string().nullable(),
  /**
   * `MAX(silpo_receipts.created_at)` for the user — best-effort "last
   * synced" signal since `silpo_connection` has no dedicated timestamp
   * column (no webhooks in this integration, sync is on-demand/polling —
   * see spec § Ізоляція збою). `null` when nothing has been pulled yet.
   */
  lastSyncAt: z.string().nullable(),
  receiptsCount: z.number().int().nonnegative(),
});
export type SilpoSyncState = z.infer<typeof SilpoSyncStateSchema>;

/**
 * Response of `POST /api/silpo/disconnect`. Mono-pattern: deletes only
 * `silpo_connection` — receipts/items/links survive (spec § Рішення
 * дизайну, "Disconnect — mono-патерн + окрема wipe-дія").
 */
export const SilpoDisconnectResponseSchema = z.object({ ok: z.literal(true) });
export type SilpoDisconnectResponse = z.infer<
  typeof SilpoDisconnectResponseSchema
>;

/**
 * Response of `POST /api/silpo/wipe`. Full erasure of Silpo-sourced data
 * (`silpo_receipts` cascade → items + `finyk_tx_receipt_links`); user-
 * confirmed `finyk_tx_splits` / pantry-events are NEVER touched here.
 */
export const SilpoWipeResponseSchema = z.object({
  ok: z.literal(true),
  deletedReceipts: z.number().int().nonnegative(),
});
export type SilpoWipeResponse = z.infer<typeof SilpoWipeResponseSchema>;

/**
 * Response of `POST /api/silpo/sync` ("Оновити чеки"). Counts are
 * diagnostic (UI toast / debugging), not authoritative state — the client
 * should re-fetch `GET /api/silpo/receipts` after a sync. `status` reports
 * the connection status AFTER the sync attempt, so a lazy-refresh failure
 * that flipped the row to `reauth_required` mid-sync is visible without a
 * second round-trip.
 */
export const SilpoSyncResultSchema = z.object({
  status: SilpoConnectionStatusSchema,
  offlinePulled: z.number().int().nonnegative(),
  onlinePulled: z.number().int().nonnegative(),
  receiptsInserted: z.number().int().nonnegative(),
  itemsInserted: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  ambiguous: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
});
export type SilpoSyncResult = z.infer<typeof SilpoSyncResultSchema>;

/**
 * Row from `silpo_receipt_items` after normalization. `id` (BIGSERIAL) and
 * `priceKop` (BIGINT) are coerced `bigint`→`number` by
 * `lib/normalizers/silpo.ts` (Hard Rule #1).
 */
export const SilpoReceiptItemDtoSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  priceKop: z.number().int(),
  categorySlug: z.string().nullable(),
  barcode: z.string().nullable(),
});
export type SilpoReceiptItemDto = z.infer<typeof SilpoReceiptItemDtoSchema>;

export const SilpoReceiptChannelSchema = z.enum(["online", "offline"]);
export type SilpoReceiptChannel = z.infer<typeof SilpoReceiptChannelSchema>;

/**
 * Summary row from `GET /api/silpo/receipts` (list) — one entry per
 * `silpo_receipts` row, no line items. `transactionId` is the linked
 * `mono_transaction.mono_tx_id` from `finyk_tx_receipt_links` when the
 * deterministic matcher (`@sergeant/finyk-domain` `matchReceiptsToTransactions`)
 * attached one; `null` means "Чек без транзакції" — a first-class state
 * (spec § Рішення дизайну), never an error.
 */
export const SilpoReceiptSummaryDtoSchema = z.object({
  receiptId: z.string().min(1),
  purchasedAt: z.string().min(1),
  storeId: z.string().nullable(),
  channel: SilpoReceiptChannelSchema,
  paymentHint: z.string().nullable(),
  totalKop: z.number().int(),
  transactionId: z.string().nullable(),
});
export type SilpoReceiptSummaryDto = z.infer<
  typeof SilpoReceiptSummaryDtoSchema
>;

/** Response of `GET /api/silpo/receipts/:id` — summary + line items. */
export const SilpoReceiptDetailDtoSchema = SilpoReceiptSummaryDtoSchema.extend({
  items: z.array(SilpoReceiptItemDtoSchema),
});
export type SilpoReceiptDetailDto = z.infer<typeof SilpoReceiptDetailDtoSchema>;

/**
 * Cursor-paginated response of `GET /api/silpo/receipts`. Same shape as
 * `MonoTransactionsPageSchema` — server orders by `(purchasedAt DESC,
 * receiptId DESC)` and returns up to `limit` (default 50, max 200) rows;
 * `nextCursor` is `"<purchasedAtIso>:<receiptId>"`, non-null while more
 * rows exist.
 */
export const SilpoReceiptsPageSchema = z.object({
  data: z.array(SilpoReceiptSummaryDtoSchema),
  nextCursor: z.string().nullable(),
});
export type SilpoReceiptsPage = z.infer<typeof SilpoReceiptsPageSchema>;

/** Query params for `GET /api/silpo/receipts`. */
export const SilpoReceiptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(3).optional(),
});
export type SilpoReceiptsQuery = z.infer<typeof SilpoReceiptsQuerySchema>;
