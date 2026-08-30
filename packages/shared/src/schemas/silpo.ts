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
 * Response of `DELETE /api/silpo/receipts/link/:transactionId` — знімає
 * хибний звʼязок «транзакція ↔ чек», який поставив детермінований matcher,
 * і памʼятає цю пару як відхилену (міграція 125), щоб найближчий sync її
 * не відновив. Сам чек НЕ видаляється: він лишається в списку «Чеки без
 * транзакції» і може бути привʼязаний до іншої транзакції.
 */
export const SilpoUnlinkResponseSchema = z.object({
  ok: z.literal(true),
  /**
   * Чек, який щойно відчепили. Віддається саме для «Повернути»: без нього
   * клієнт мусив би перечитати транзакцію, з якої чек уже зник, тобто
   * скасувати дію було б нічим.
   */
  receiptId: z.string().min(1),
});
export type SilpoUnlinkResponse = z.infer<typeof SilpoUnlinkResponseSchema>;

/**
 * Body of `POST /api/silpo/receipts/link/:transactionId` — «Повернути»
 * після «Це не той чек». Знімає запис із `silpo_tx_receipt_link_rejections`
 * і ставить пару назад, тож наступний sync її вже не обійде.
 *
 * Ендпоїнт свідомо приймає БУДЬ-ЯКИЙ чек користувача, не лише щойно
 * відчеплений: це той самий примітив, на якому пізніше стане ручне
 * привʼязування чека до транзакції.
 */
export const SilpoRelinkRequestSchema = z.object({
  receiptId: z.string().min(1),
});
export type SilpoRelinkRequest = z.infer<typeof SilpoRelinkRequestSchema>;

export const SilpoRelinkResponseSchema = z.object({ ok: z.literal(true) });
export type SilpoRelinkResponse = z.infer<typeof SilpoRelinkResponseSchema>;

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

/**
 * Query params for `GET /api/silpo/receipts`.
 *
 * `transactionId` — точковий пошук «який чек привʼязаний до ЦІЄЇ
 * mono-транзакції». Без нього картка транзакції мусила б тягнути сторінку
 * чеків і шукати збіг у клієнті — і мовчки не знаходила б нічого, щойно
 * потрібний чек виїде за межі першої сторінки (людина з довгою історією
 * покупок). Фільтр звужує вибірку на боці БД по `silpo_tx_receipt_links`.
 */
export const SilpoReceiptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(3).optional(),
  transactionId: z.string().min(1).optional(),
});
export type SilpoReceiptsQuery = z.infer<typeof SilpoReceiptsQuerySchema>;

// ─────────────────────────── Cart (Track G — MCP write path) ────────────────

/**
 * `POST /api/silpo/cart/preview` request — one entry per shopping-list line.
 * `name` is trimmed server-side (a whitespace-only name is rejected, not
 * silently dropped, so the client sees exactly which line failed). Personal
 * `quantity` hint is optional and NOT sent to Silpo at preview time — it only
 * round-trips for the client's own UI bookkeeping (spec: preview never
 * writes, so there is nothing here for Silpo to quantify yet).
 */
export const SilpoCartPreviewItemSchema = z.object({
  name: z.string().trim().min(1),
  quantity: z.number().positive().optional(),
});
export const SilpoCartPreviewRequestSchema = z.object({
  items: z.array(SilpoCartPreviewItemSchema).min(1).max(100),
});
export type SilpoCartPreviewRequest = z.infer<
  typeof SilpoCartPreviewRequestSchema
>;

/**
 * One catalog candidate for a shopping-list line. `lagerId` is an OPAQUE
 * selection token minted by the server (base64url JSON of `{productId,
 * companyId, branchId}` — the triplet `silpo_add_or_update_cart_products`
 * requires) — clients MUST treat it as a black box and echo it back
 * unmodified in `SilpoCartApplyRequestSchema`, never parse or construct one.
 * `priceKop` is the UAH catalog price × 100 (Hard Rule #1 — money as
 * `number` minor units). `unit` is derived from `displayRatio`'s suffix
 * (falls back to `"кг"`/`"шт"` from the `weighted` flag when `displayRatio`
 * is absent) — see `lib/normalizers` (server) for the exact derivation.
 */
export const SilpoCartMatchDtoSchema = z.object({
  lagerId: z.string().min(1),
  name: z.string().min(1),
  priceKop: z.number().int().nonnegative(),
  /**
   * Ціна до акції, копійки; `null` — акції немає. Сервер заповнює лише
   * коли вона СТРОГО більша за `priceKop` (`normalizeCartMatch`), тож
   * клієнту не треба перевіряти це вдруге — достатньо `!= null`.
   */
  oldPriceKop: z.number().int().nonnegative().nullable(),
  /**
   * `false` — товару немає у філії. Клієнт показує позицію, але не
   * відмічає її: покласти в кошик відсутнє можна, і тоді людина дізнається
   * про це вже в застосунку Сільпо.
   */
  available: z.boolean(),
  unit: z.string().min(1),
  displayRatio: z.string().nullable(),
});
export type SilpoCartMatchDto = z.infer<typeof SilpoCartMatchDtoSchema>;

/**
 * Response of `POST /api/silpo/cart/preview` — one entry per REQUEST item,
 * in request order (matched back to the raw Silpo `queries[]` entry by exact
 * `query` text, not by array index, since a same-named duplicate line or a
 * provider-side reorder must not silently swap results across two different
 * shopping-list lines). `matches` holds the top candidate plus up to 2
 * alternatives; `unmatched: true` means zero usable candidates (either Silpo
 * found nothing, or every hit was missing a field the cart-write path needs
 * — see `normalizeCartMatch`).
 */
export const SilpoCartPreviewQueryDtoSchema = z.object({
  query: z.string(),
  matches: z.array(SilpoCartMatchDtoSchema),
  unmatched: z.boolean(),
});
export type SilpoCartPreviewQueryDto = z.infer<
  typeof SilpoCartPreviewQueryDtoSchema
>;

export const SilpoCartPreviewResponseSchema = z.object({
  results: z.array(SilpoCartPreviewQueryDtoSchema),
});
export type SilpoCartPreviewResponse = z.infer<
  typeof SilpoCartPreviewResponseSchema
>;

/**
 * `POST /api/silpo/cart/apply` request. This is the confirm-before-write
 * step (spec § "Confirm-before-write") — the server adds EXACTLY these
 * `{lagerId, quantity}` pairs to the cart via `addQuantity: false` (replace,
 * not accumulate) and nothing else; it never re-derives quantities or adds
 * extra items on its own.
 */
export const SilpoCartSelectionSchema = z.object({
  lagerId: z.string().min(1),
  quantity: z.number().positive(),
});
export const SilpoCartApplyRequestSchema = z.object({
  selections: z.array(SilpoCartSelectionSchema).min(1).max(100),
});
export type SilpoCartApplyRequest = z.infer<typeof SilpoCartApplyRequestSchema>;

/** One cart line as returned by `GET /api/silpo/cart` / `POST …/cart/apply`. */
export const SilpoCartItemDtoSchema = z.object({
  name: z.string().min(1),
  quantity: z.number(),
  priceKop: z.number().int().nonnegative(),
  subtotalKop: z.number().int().nonnegative(),
});
export type SilpoCartItemDto = z.infer<typeof SilpoCartItemDtoSchema>;

/**
 * Response of `GET /api/silpo/cart` AND `POST /api/silpo/cart/apply` (same
 * shape — apply returns the post-write cart state, mirroring
 * `silpo_add_or_update_cart_products`'s own "verify immediately after
 * writing" contract). `totalKop` is `cart.calculation.totalAfterDiscounts`
 * (the amount the user actually pays) × 100, falling back to `.total` when
 * discounts are absent, or `null` when Silpo's response has neither
 * (schema-drift degrade, never a thrown error). `cartUrl` is
 * `checkoutWebLink` from the tool response, or `null` for an empty/erroring
 * cart (Silpo only emits it for a non-empty, error-free cart).
 */
export const SilpoCartDtoSchema = z.object({
  items: z.array(SilpoCartItemDtoSchema),
  totalKop: z.number().int().nonnegative().nullable(),
  cartUrl: z.string().nullable(),
});
export type SilpoCartDto = z.infer<typeof SilpoCartDtoSchema>;
