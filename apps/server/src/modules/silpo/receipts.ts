import { z } from "zod";
// Субшлях замість кореневого барела: барел тягне categories.ts →
// @sergeant/design-tokens, якого нема в server-бандлі (esbuild у
// Dockerfile.api резолвить УСІ імпорти барела ще до tree-shaking).
import {
  matchReceiptsToTransactions,
  type MonoTxForReceiptMatching,
  type ReceiptForMatching,
} from "@sergeant/finyk-domain/domain/receiptMatching";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  AppError,
  ExternalServiceError,
  RateLimitError,
} from "../../obs/errors.js";
import { callMcpTool, type McpError, type McpResult } from "./mcpClient.js";
import {
  callWithFreshAccessToken,
  type QueryFn,
  type SilpoAuthedCallErrorKind,
} from "./tokenStore.js";
import {
  normalizeSilpoReceiptDetail,
  normalizeSilpoReceiptSummary,
  type NormalizedSilpoReceiptDetail,
  type NormalizedSilpoReceiptSummary,
} from "../../lib/normalizers/silpo.js";

/**
 * Pulls Silpo order history (offline + online), normalizes it into our own
 * `silpo_receipts` / `silpo_receipt_items` snapshot, and runs the
 * deterministic matcher against the user's Mono transactions. Spec:
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` § Рішення дизайну
 * ("Збагачення, а не створення витрат" / "Unmatched-чеки — першокласний
 * стан").
 *
 * PROVISIONAL parsing (spike §0 not run): field names below
 * (`total`/`totalKop`/`amount`, `purchasedAt`/`createdAt`/`date`, …) are
 * best guesses at the real `silpo_get_my_*_orders` tool output. Every raw
 * schema is `.passthrough()`; a receipt/item that doesn't parse is
 * DROPPED with a `logger.warn` (never crashes the sync), so a wrong guess
 * degrades to "fewer receipts than expected" rather than a broken sync
 * button. Re-derive these once the spike captures real payloads.
 */

// ─────────────────────────── Provisional raw shapes ─────────────────────────

const RawItemSchema = z
  .object({
    name: z.string().optional(),
    title: z.string().optional(),
    qty: z.number().optional(),
    quantity: z.number().optional(),
    unit: z.string().optional(),
    price: z.number().optional(), // UAH, provisional — ×100 → kop
    priceKop: z.number().optional(),
    amount: z.number().optional(), // UAH line total, provisional
    categorySlug: z.string().optional(),
    category: z.string().optional(),
    barcode: z.string().optional(),
  })
  .passthrough();
type RawItem = z.infer<typeof RawItemSchema>;

const RawOrderSchema = z
  .object({
    id: z.string().optional(),
    orderId: z.string().optional(),
    receiptId: z.string().optional(),
    purchasedAt: z.string().optional(),
    createdAt: z.string().optional(),
    date: z.string().optional(),
    storeId: z.string().optional(),
    store: z.string().optional(),
    paymentHint: z.string().optional(),
    paymentMethod: z.string().optional(),
    total: z.number().optional(), // UAH, provisional — ×100 → kop
    totalKop: z.number().optional(),
    amount: z.number().optional(), // UAH, provisional fallback
    items: z.array(RawItemSchema).optional(),
  })
  .passthrough();
type RawOrder = z.infer<typeof RawOrderSchema>;

const RawOrdersListSchema = z.array(RawOrderSchema);

// ─────────────────────────── Normalization (provisional) ────────────────────

interface ParsedItem {
  name: string;
  qty: number | null;
  unit: string | null;
  priceKop: number;
  categorySlug: string | null;
  barcode: string | null;
}

interface ParsedReceipt {
  receiptId: string;
  purchasedAtMs: number;
  storeId: string | null;
  paymentHint: string | null;
  totalKop: number;
  items: ParsedItem[];
  raw: unknown;
}

function firstDefined<T>(
  ...values: Array<T | undefined | null>
): T | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function uahToKop(uah: number | undefined): number | undefined {
  return uah === undefined ? undefined : Math.round(uah * 100);
}

function normalizeRawItem(raw: RawItem): ParsedItem | null {
  const name = firstDefined(raw.name, raw.title);
  if (!name) return null;
  const priceKop = firstDefined(
    raw.priceKop,
    uahToKop(raw.price),
    uahToKop(raw.amount),
  );
  if (priceKop === undefined) return null;
  return {
    name,
    qty: firstDefined(raw.qty, raw.quantity) ?? null,
    unit: raw.unit ?? null,
    priceKop,
    categorySlug: firstDefined(raw.categorySlug, raw.category) ?? null,
    barcode: raw.barcode ?? null,
  };
}

function normalizeRawOrder(
  raw: RawOrder,
  channel: "online" | "offline",
): ParsedReceipt | null {
  const receiptId = firstDefined(raw.id, raw.orderId, raw.receiptId);
  if (!receiptId) {
    logger.warn({ msg: "silpo_receipt_missing_id", channel });
    return null;
  }
  const purchasedRaw = firstDefined(raw.purchasedAt, raw.createdAt, raw.date);
  const purchasedAtMs = purchasedRaw ? Date.parse(purchasedRaw) : NaN;
  if (!Number.isFinite(purchasedAtMs)) {
    logger.warn({ msg: "silpo_receipt_missing_date", channel, receiptId });
    return null;
  }
  const totalKop = firstDefined(
    raw.totalKop,
    uahToKop(raw.total),
    uahToKop(raw.amount),
  );
  if (totalKop === undefined) {
    logger.warn({ msg: "silpo_receipt_missing_total", channel, receiptId });
    return null;
  }
  const items = (raw.items ?? [])
    .map(normalizeRawItem)
    .filter((i): i is ParsedItem => i !== null);

  return {
    receiptId,
    purchasedAtMs,
    storeId: firstDefined(raw.storeId, raw.store) ?? null,
    paymentHint: firstDefined(raw.paymentHint, raw.paymentMethod) ?? null,
    totalKop,
    items,
    raw,
  };
}

// ─────────────────────────────── MCP fetch step ─────────────────────────────

async function fetchOrderList(
  accessToken: string,
  toolName: "silpo_get_my_offline_orders" | "silpo_get_my_online_orders",
): Promise<McpResult<RawOrder[]>> {
  return callMcpTool({
    accessToken,
    toolName,
    args: {},
    schema: RawOrdersListSchema,
  });
}

interface BothOrderLists {
  offline: RawOrder[];
  online: RawOrder[];
}

async function fetchBothOrderLists(
  accessToken: string,
): Promise<McpResult<BothOrderLists>> {
  const offline = await fetchOrderList(
    accessToken,
    "silpo_get_my_offline_orders",
  );
  if (!offline.ok) return { ok: false, error: offline.error };
  const online = await fetchOrderList(
    accessToken,
    "silpo_get_my_online_orders",
  );
  if (!online.ok) return { ok: false, error: online.error };
  return { ok: true, data: { offline: offline.data, online: online.data } };
}

// ─────────────────────────────── DB upsert step ─────────────────────────────

/** Inserts a receipt (+ its items, only when the receipt itself was newly inserted — receipts are treated as immutable snapshots once stored). Returns whether it was newly inserted and how many items were inserted. */
async function upsertReceipt(
  userId: string,
  channel: "online" | "offline",
  receipt: ParsedReceipt,
  queryFn: QueryFn,
): Promise<{ inserted: boolean; itemsInserted: number }> {
  const res = await queryFn(
    `INSERT INTO silpo_receipts
       (user_id, receipt_id, purchased_at, store_id, channel, payment_hint, total_kop, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, receipt_id) DO NOTHING`,
    [
      userId,
      receipt.receiptId,
      new Date(receipt.purchasedAtMs),
      receipt.storeId,
      channel,
      receipt.paymentHint,
      receipt.totalKop,
      JSON.stringify(receipt.raw),
    ],
    { op: "silpo_receipt_upsert" },
  );
  const inserted = (res.rowCount ?? 0) > 0;
  if (!inserted || receipt.items.length === 0) {
    return { inserted, itemsInserted: 0 };
  }

  // Multi-row VALUES insert — receipt.items.length is bounded by a single
  // Silpo order (tens, not thousands), so one round-trip is fine.
  const values: unknown[] = [];
  const rows: string[] = [];
  let i = 1;
  for (const item of receipt.items) {
    rows.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    );
    values.push(
      userId,
      receipt.receiptId,
      item.name,
      item.qty,
      item.unit,
      item.priceKop,
      item.categorySlug,
      item.barcode,
    );
  }
  await queryFn(
    `INSERT INTO silpo_receipt_items
       (user_id, receipt_id, name, qty, unit, price_kop, category_slug, barcode)
     VALUES ${rows.join(", ")}`,
    values,
    { op: "silpo_receipt_items_insert" },
  );
  return { inserted, itemsInserted: receipt.items.length };
}

// ─────────────────────────────── Matcher step ───────────────────────────────

type MonoTxCandidateRow = {
  id: string;
  amountKop: number;
  timeSeconds: number;
  mcc: number | null;
  description: string | null;
  receiptId: string | null;
};

async function loadUnresolvedReceipts(
  userId: string,
  queryFn: QueryFn,
): Promise<ReceiptForMatching[]> {
  const { rows } = await queryFn<{
    receipt_id: string;
    total_kop: number;
    purchased_at: Date | string;
  }>(
    `SELECT r.receipt_id, r.total_kop, r.purchased_at
       FROM silpo_receipts r
       WHERE r.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM finyk_tx_receipt_links l
            WHERE l.user_id = r.user_id AND l.receipt_id = r.receipt_id
         )`,
    [userId],
    { op: "silpo_unresolved_receipts_select" },
  );
  return rows.map((r) => ({
    receiptId: r.receipt_id,
    totalKop: Number(r.total_kop),
    purchasedAtMs: new Date(r.purchased_at).getTime(),
  }));
}

async function loadCandidateTransactions(
  userId: string,
  windowStartMs: number,
  windowEndMs: number,
  queryFn: QueryFn,
): Promise<MonoTxForReceiptMatching[]> {
  const { rows } = await queryFn<MonoTxCandidateRow>(
    `SELECT t.mono_tx_id AS "id",
            t.amount AS "amountKop",
            EXTRACT(EPOCH FROM t.time)::bigint AS "timeSeconds",
            t.mcc,
            t.description,
            t.receipt_id AS "receiptId"
       FROM mono_transaction t
      WHERE t.user_id = $1
        AND t.amount < 0
        AND t.time >= $2
        AND t.time <= $3
        AND NOT EXISTS (
          SELECT 1 FROM finyk_tx_receipt_links l
           WHERE l.user_id = t.user_id AND l.transaction_id = t.mono_tx_id
        )`,
    [userId, new Date(windowStartMs), new Date(windowEndMs)],
    { op: "silpo_candidate_transactions_select" },
  );
  return rows.map((r) => ({
    id: r.id,
    amountKop: Number(r.amountKop),
    timeSeconds: Number(r.timeSeconds),
    mcc: r.mcc,
    description: r.description,
    receiptId: r.receiptId,
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function matchAndLink(
  userId: string,
  queryFn: QueryFn,
): Promise<{ matched: number; ambiguous: number; unmatched: number }> {
  const receipts = await loadUnresolvedReceipts(userId, queryFn);
  if (receipts.length === 0) return { matched: 0, ambiguous: 0, unmatched: 0 };

  const purchasedTimes = receipts.map((r) => r.purchasedAtMs);
  const windowStartMs = Math.min(...purchasedTimes) - DAY_MS;
  const windowEndMs = Math.max(...purchasedTimes) + DAY_MS;
  const transactions = await loadCandidateTransactions(
    userId,
    windowStartMs,
    windowEndMs,
    queryFn,
  );

  const result = matchReceiptsToTransactions(receipts, transactions);

  for (const m of result.matches) {
    await queryFn(
      `INSERT INTO finyk_tx_receipt_links (user_id, transaction_id, receipt_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, transaction_id) DO NOTHING`,
      [userId, m.transactionId, m.receiptId],
      { op: "silpo_tx_receipt_link_insert" },
    );
  }

  return {
    matched: result.matches.length,
    ambiguous: result.ambiguousReceiptIds.length,
    unmatched: result.unmatchedReceiptIds.length,
  };
}

// ────────────────────────────────── Orchestration ────────────────────────────

export interface SilpoSyncResult {
  status: "connected" | "reauth_required";
  offlinePulled: number;
  onlinePulled: number;
  receiptsInserted: number;
  itemsInserted: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
}

/** Maps a token/MCP-layer error to the HTTP-facing `AppError` the route should throw. */
export function silpoErrorToAppError(
  error: McpError | { kind: SilpoAuthedCallErrorKind; message: string },
): AppError {
  switch (error.kind) {
    case "not_connected":
      return new AppError("Сільпо не підключено", {
        status: 409,
        code: "SILPO_NOT_CONNECTED",
      });
    case "reauth_required":
    case "auth_required":
      return new AppError("Потрібне повторне підключення Сільпо", {
        status: 409,
        code: "SILPO_REAUTH_REQUIRED",
      });
    case "config_missing":
      return new AppError("Сільпо-інтеграція не налаштована на сервері", {
        status: 503,
        code: "SILPO_CONFIG_MISSING",
      });
    case "rate_limited":
      return new RateLimitError(
        "Забагато запитів до Сільпо, спробуйте пізніше",
        {
          code: "SILPO_RATE_LIMITED",
        },
      );
    case "schema_drift":
      return new ExternalServiceError(
        "Сільпо змінили формат відповіді — оновлення тимчасово недоступне",
        { code: "SILPO_SCHEMA_DRIFT" },
      );
    case "protocol_error":
    case "upstream_unavailable":
    default:
      return new ExternalServiceError("Сільпо тимчасово недоступний", {
        code: "SILPO_UPSTREAM_ERROR",
      });
  }
}

/**
 * `POST /api/silpo/sync` ("Оновити чеки") entry point. Pulls both order
 * lists, upserts new receipts/items (existing ones are immutable — never
 * re-fetched/re-written), then runs the deterministic matcher over
 * receipts that don't already have a `finyk_tx_receipt_links` row.
 *
 * Throws a mapped {@link AppError} (via {@link silpoErrorToAppError}) on
 * connection/upstream failure — this is an explicit user-triggered action,
 * so a clean 4xx/5xx to the click is correct; the "staleness banner,
 * never a crash" principle (spec § Ізоляція збою) governs BACKGROUND
 * degradation, not this synchronous button.
 */
export async function pullAndSyncReceipts(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoSyncResult> {
  const queryFn = deps.query ?? defaultQuery;

  const call = await callWithFreshAccessToken(userId, fetchBothOrderLists, {
    query: queryFn,
  });
  if (!call.ok) throw silpoErrorToAppError(call.error);

  const offlineParsed = call.data.offline
    .map((raw) => normalizeRawOrder(raw, "offline"))
    .filter((r): r is ParsedReceipt => r !== null);
  const onlineParsed = call.data.online
    .map((raw) => normalizeRawOrder(raw, "online"))
    .filter((r): r is ParsedReceipt => r !== null);

  let receiptsInserted = 0;
  let itemsInserted = 0;
  for (const receipt of offlineParsed) {
    const r = await upsertReceipt(userId, "offline", receipt, queryFn);
    if (r.inserted) receiptsInserted++;
    itemsInserted += r.itemsInserted;
  }
  for (const receipt of onlineParsed) {
    const r = await upsertReceipt(userId, "online", receipt, queryFn);
    if (r.inserted) receiptsInserted++;
    itemsInserted += r.itemsInserted;
  }

  const { matched, ambiguous, unmatched } = await matchAndLink(userId, queryFn);

  logger.info({
    msg: "silpo.sync.completed",
    offlinePulled: call.data.offline.length,
    onlinePulled: call.data.online.length,
    receiptsInserted,
    itemsInserted,
    matched,
    ambiguous,
    unmatched,
  });

  return {
    status: "connected",
    offlinePulled: call.data.offline.length,
    onlinePulled: call.data.online.length,
    receiptsInserted,
    itemsInserted,
    matched,
    ambiguous,
    unmatched,
  };
}

// ───────────────────────────────── Read paths ────────────────────────────────

export interface ReceiptsPage {
  data: NormalizedSilpoReceiptSummary[];
  nextCursor: string | null;
}

type ReceiptSummaryRow = {
  receiptId: string;
  purchasedAt: Date | string;
  storeId: string | null;
  channel: "online" | "offline";
  paymentHint: string | null;
  totalKop: unknown;
  transactionId: string | null;
};

/** `GET /api/silpo/receipts` — cursor-paginated, newest first. */
export async function listReceipts(
  userId: string,
  opts: { limit: number; cursor?: string | undefined },
  queryFn: QueryFn = defaultQuery,
): Promise<ReceiptsPage> {
  const conditions = ["r.user_id = $1"];
  const params: unknown[] = [userId];
  let paramIdx = 2;

  if (opts.cursor) {
    const lastColon = opts.cursor.lastIndexOf(":");
    if (lastColon <= 0) {
      throw new AppError("Invalid cursor format", {
        status: 400,
        code: "VALIDATION",
      });
    }
    const cursorPurchasedAt = opts.cursor.slice(0, lastColon);
    const cursorReceiptId = opts.cursor.slice(lastColon + 1);
    conditions.push(
      `(r.purchased_at < $${paramIdx} OR (r.purchased_at = $${paramIdx} AND r.receipt_id < $${paramIdx + 1}))`,
    );
    params.push(cursorPurchasedAt, cursorReceiptId);
    paramIdx += 2;
  }

  params.push(opts.limit + 1);
  const { rows } = await queryFn<ReceiptSummaryRow>(
    `SELECT r.receipt_id AS "receiptId",
            r.purchased_at AS "purchasedAt",
            r.store_id AS "storeId",
            r.channel,
            r.payment_hint AS "paymentHint",
            r.total_kop AS "totalKop",
            l.transaction_id AS "transactionId"
       FROM silpo_receipts r
       LEFT JOIN finyk_tx_receipt_links l
              ON l.user_id = r.user_id AND l.receipt_id = r.receipt_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY r.purchased_at DESC, r.receipt_id DESC
      LIMIT $${paramIdx}`,
    params,
    { op: "silpo_receipts_list" },
  );

  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  const data = items.map((r) => normalizeSilpoReceiptSummary(r));
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? `${normalizeSilpoReceiptSummary(last).purchasedAt}:${last.receiptId}`
      : null;

  return { data, nextCursor };
}

/** `GET /api/silpo/receipts/:id` — summary + line items, or `null` when not found / not owned by `userId`. */
export async function getReceiptDetail(
  userId: string,
  receiptId: string,
  queryFn: QueryFn = defaultQuery,
): Promise<NormalizedSilpoReceiptDetail | null> {
  const { rows: receiptRows } = await queryFn<ReceiptSummaryRow>(
    `SELECT r.receipt_id AS "receiptId",
            r.purchased_at AS "purchasedAt",
            r.store_id AS "storeId",
            r.channel,
            r.payment_hint AS "paymentHint",
            r.total_kop AS "totalKop",
            l.transaction_id AS "transactionId"
       FROM silpo_receipts r
       LEFT JOIN finyk_tx_receipt_links l
              ON l.user_id = r.user_id AND l.receipt_id = r.receipt_id
      WHERE r.user_id = $1 AND r.receipt_id = $2`,
    [userId, receiptId],
    { op: "silpo_receipt_detail_select" },
  );
  const receiptRow = receiptRows[0];
  if (!receiptRow) return null;

  const { rows: itemRows } = await queryFn<{
    id: unknown;
    name: string;
    qty: unknown;
    unit: string | null;
    priceKop: unknown;
    categorySlug: string | null;
    barcode: string | null;
  }>(
    `SELECT id, name, qty, unit, price_kop AS "priceKop",
            category_slug AS "categorySlug", barcode
       FROM silpo_receipt_items
      WHERE user_id = $1 AND receipt_id = $2
      ORDER BY id ASC`,
    [userId, receiptId],
    { op: "silpo_receipt_items_select" },
  );

  return normalizeSilpoReceiptDetail(receiptRow, itemRows);
}

// Re-exported for tests that want to exercise normalization without a DB.
export const __test__ = { normalizeRawOrder, normalizeRawItem };
