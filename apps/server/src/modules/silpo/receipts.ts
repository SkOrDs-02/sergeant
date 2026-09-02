import { z } from "zod";
import type { PoolClient } from "pg";
import * as Sentry from "@sentry/node";
import { pool, query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  AppError,
  ExternalServiceError,
  RateLimitError,
} from "../../obs/errors.js";
import { callMcpTool, type McpError, type McpResult } from "./mcpClient.js";
import { resolveBranchContext } from "./branchContext.js";
import { matchAndLink } from "./receiptsMatch.js";
import {
  callWithFreshAccessToken,
  type QueryFn,
  type SilpoAuthedCallErrorKind,
} from "./tokenStore.js";

/**
 * Pulls Silpo order history (offline + online), normalizes it into our own
 * `silpo_receipts` / `silpo_receipt_items` snapshot, and runs the
 * deterministic matcher against the user's Mono transactions. Spec:
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` § Рішення дизайну
 * ("Збагачення, а не створення витрат" / "Unmatched-чеки — першокласний стан").
 *
 * Форми звірені живим спайком §0 (2026-08-18, `serverInfo.version 1.108.0`):
 *
 * - `silpo_get_my_offline_orders` вимагає `branchId`/`deliveryType`/
 *   `timeslot*` (див. `branchContext.ts`); порожні timeslot-и приймаються.
 *   Order: `{filId, filialName, cityName, createdAt, sumReg, sumDiscount,
 *   accruedBalaBonusesSum, receiptUrl, chequeMagicName, rewards, products}`.
 *   `products[]`: `{lagerId, name, unit, quantity, price}` — `price` це ЦІНА
 *   ЗА ОДИНИЦЮ (Σ price×quantity ≈ sumReg, звірено на живих чеках), `unit` —
 *   фасування ("шт", "кг", "870г", "пачка"...). Власного `id` чек НЕ має —
 *   стабільний ідентифікатор деривуємо з токена `receiptUrl`
 *   (`https://receipt.silpo.elkasa.com.ua/<token>`).
 * - `silpo_get_my_online_orders` — всі аргументи опційні. Order: `{orderId,
 *   number, status, createdAt, amount, discount, delivery, address,
 *   products}`; `products[]`: `{id, name, price, quantity, subtotal,
 *   removed}`. `amount` ≠ Σ subtotal (доставка/знижки) — беремо `amount`.
 * - Дати: offline `createdAt` — НАЇВНИЙ Kyiv-local рядок без офсету
 *   (`2026-08-09T20:12:24`); online — ISO з офсетом (`...+00:00`).
 * - Суми — UAH decimal → ×100 у копійки. Баркодів/категорій у чеках немає.
 *
 * Every raw schema stays `.passthrough()`; a receipt/item that doesn't
 * parse is DROPPED with a `logger.warn` (never crashes the sync).
 */

// ──────────────────────── Raw shapes (спайк §0, 2026-08-18) ─────────────────

const RawItemSchema = z
  .object({
    // offline
    lagerId: z.number().optional(),
    name: z.string().optional(),
    unit: z.string().optional(),
    quantity: z.number().optional(),
    price: z.number().optional(), // UAH за одиницю
    // online
    id: z.union([z.string(), z.number()]).optional(),
    subtotal: z.number().optional(), // UAH line total (online)
  })
  .passthrough();
type RawItem = z.infer<typeof RawItemSchema>;

const RawOrderSchema = z
  .object({
    // offline
    filId: z.number().optional(),
    filialName: z.string().optional(),
    createdAt: z.string().optional(),
    sumReg: z.number().optional(), // UAH total
    receiptUrl: z.string().nullable().optional(),
    // online
    orderId: z.string().optional(),
    status: z.string().optional(),
    amount: z.number().optional(), // UAH total
    products: z.array(z.unknown()).optional(),
  })
  .passthrough();
type RawOrder = z.infer<typeof RawOrderSchema>;

/**
 * Envelope: живий сервер віддає `structuredContent` як обʼєкт
 * `{success, summary, orders: [...], meta}` — НЕ голий масив. Елементи
 * лишаються `z.unknown()`: per-order `RawOrderSchema.safeParse` нижче, щоб
 * один кривий чек DROP-ався з `logger.warn`, а не валив увесь sync як
 * `schema_drift` (spec § "Дрейф схеми tools — контрактний пояс").
 */
const RawOrdersEnvelopeSchema = z
  .object({ orders: z.array(z.unknown()).optional() })
  .passthrough();

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

/**
 * Offline `createdAt` — наївний Kyiv-local рядок без офсету (спайк §0).
 * `Date.parse` трактував би його в TZ процесу — на UTC-сервері це зсув
 * на 2–3 год і потенційно інша доба для matcher-а. Парсимо явно як
 * Europe/Kyiv через Intl-офсет на цю мить.
 */
// ponytail: у годину переходу на зимовий час офсет неоднозначний ±1h —
// для day-вікна matcher-а несуттєво.
function kyivNaiveToMs(naive: string): number {
  const utcGuess = Date.parse(`${naive}Z`);
  if (!Number.isFinite(utcGuess)) return NaN;
  const offsetPart = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(utcGuess))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetPart ?? "");
  if (!m) return utcGuess;
  const offsetMs =
    (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
  return utcGuess - offsetMs;
}

/** `https://receipt.silpo.elkasa.com.ua/<token>` → `<token>` (стабільний id чека). */
function receiptIdFromUrl(receiptUrl: string): string | undefined {
  const token = receiptUrl.split("/").filter(Boolean).pop();
  return token && token.length > 0 ? token : undefined;
}

function normalizeRawItem(raw: RawItem): ParsedItem | null {
  const name = raw.name;
  if (!name) return null;
  const priceKop = uahToKop(raw.price);
  if (priceKop === undefined) return null;
  return {
    name,
    qty: raw.quantity ?? null,
    unit: raw.unit ?? null,
    priceKop,
    categorySlug: null, // чеки Сільпо не містять категорій (спайк §0)
    barcode: null, // ані EAN — лише внутрішній lagerId (лишається в raw JSONB)
  };
}

function normalizeRawOrder(
  raw: RawOrder,
  channel: "online" | "offline",
): ParsedReceipt | null {
  const receiptId =
    channel === "online"
      ? raw.orderId
      : firstDefined(
          raw.receiptUrl ? receiptIdFromUrl(raw.receiptUrl) : undefined,
          // Fallback без receiptUrl: детермінований складений ключ.
          raw.filId !== undefined && raw.createdAt !== undefined
            ? `offline_${raw.filId}_${raw.createdAt}`
            : undefined,
        );
  if (!receiptId) {
    logger.warn({ msg: "silpo_receipt_missing_id", channel });
    return null;
  }
  const purchasedAtMs = raw.createdAt
    ? channel === "offline"
      ? kyivNaiveToMs(raw.createdAt)
      : Date.parse(raw.createdAt)
    : NaN;
  if (!Number.isFinite(purchasedAtMs)) {
    logger.warn({ msg: "silpo_receipt_missing_date", channel, receiptId });
    return null;
  }
  const totalKop = uahToKop(channel === "offline" ? raw.sumReg : raw.amount);
  if (totalKop === undefined) {
    logger.warn({ msg: "silpo_receipt_missing_total", channel, receiptId });
    return null;
  }
  const items = (raw.products ?? [])
    .map((p) => {
      const parsed = RawItemSchema.safeParse(p);
      return parsed.success ? normalizeRawItem(parsed.data) : null;
    })
    .filter((i): i is ParsedItem => i !== null);

  return {
    receiptId,
    purchasedAtMs,
    storeId: raw.filId !== undefined ? String(raw.filId) : null,
    paymentHint: null, // способу оплати в жодному з order-tools немає (спайк §0)
    totalKop,
    items,
    raw,
  };
}

// ─────────────────────────────── MCP fetch step ─────────────────────────────

// Ліміти з живих input schemas (спайк §0): offline max 10, online max 100.
const OFFLINE_ORDERS_LIMIT = 10;
const ONLINE_ORDERS_LIMIT = 100;

/**
 * Fetches one order list and parses it **per order**: an MCP-level failure
 * (network/auth/protocol/schema-drift on the envelope) still surfaces as
 * an `McpError`, but a single malformed *element* is dropped +
 * `logger.warn("silpo_raw_order_unparseable")` instead of failing the sync.
 */
async function fetchOrderList(
  accessToken: string,
  toolName: "silpo_get_my_offline_orders" | "silpo_get_my_online_orders",
  args: Record<string, unknown>,
): Promise<McpResult<RawOrder[]>> {
  const result = await callMcpTool({
    accessToken,
    toolName,
    args,
    schema: RawOrdersEnvelopeSchema,
  });
  if (!result.ok) return result;

  const orders: RawOrder[] = [];
  (result.data.orders ?? []).forEach((raw, index) => {
    const parsed = RawOrderSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({
        msg: "silpo_raw_order_unparseable",
        toolName,
        index,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
        })),
      });
      return;
    }
    orders.push(parsed.data);
  });

  return { ok: true, data: orders };
}

interface BothOrderLists {
  offline: RawOrder[];
  online: RawOrder[];
}

/**
 * Offline-tool вимагає контекст філії (спайк §0). Якщо контекст добути не
 * вдалося — offline-канал деградує до порожнього списку з `logger.warn`
 * (best-effort принцип спеки), online синкається завжди.
 */
function makeFetchBothOrderLists(
  userId: string,
): (accessToken: string) => Promise<McpResult<BothOrderLists>> {
  return async (accessToken) => {
    let offline: RawOrder[] = [];
    const ctx = await resolveBranchContext(userId, accessToken);
    if (ctx.ok) {
      const offlineResult = await fetchOrderList(
        accessToken,
        "silpo_get_my_offline_orders",
        {
          branchId: ctx.data.branchId,
          deliveryType: ctx.data.deliveryType,
          timeslotStart: ctx.data.timeslotStart,
          timeslotEnd: ctx.data.timeslotEnd,
          limit: OFFLINE_ORDERS_LIMIT,
        },
      );
      if (!offlineResult.ok) {
        // auth_required має спливти нагору — callWithFreshAccessToken
        // зробить refresh і повторить; решта — деградація каналу.
        if (offlineResult.error.kind === "auth_required") return offlineResult;
        logger.warn({
          msg: "silpo_offline_orders_skipped",
          kind: offlineResult.error.kind,
        });
      } else {
        offline = offlineResult.data;
      }
    } else {
      logger.warn({ msg: "silpo_offline_orders_skipped_no_branch_context" });
    }

    const online = await fetchOrderList(
      accessToken,
      "silpo_get_my_online_orders",
      { limit: ONLINE_ORDERS_LIMIT },
    );
    if (!online.ok) return { ok: false, error: online.error };
    return { ok: true, data: { offline, online: online.data } };
  };
}

// ─────────────────────────────── DB upsert step ─────────────────────────────

/**
 * Runs `fn` inside `BEGIN…COMMIT` on ONE dedicated `pool` client — mirrors
 * `modules/mono/webhook.ts` (raw `pool.connect()` +
 * `client.query("BEGIN"/"COMMIT"/"ROLLBACK")`), NOT a sequence of
 * independent `pool.query()` calls, which may each grab a different
 * physical connection and silently not be transactional at all.
 */
export type SilpoTransactionRunner = <T>(
  fn: (queryFn: QueryFn) => Promise<T>,
) => Promise<T>;

/** Adapts a `PoolClient` to the `QueryFn` shape this module's SQL helpers already use (`meta` is accepted + ignored — `PoolClient.query` has no such concept). */
const clientAsQueryFn: (client: PoolClient) => QueryFn = (client) =>
  (async (text, values) => {
    const sql = typeof text === "string" ? text : text.text;
    return client.query(sql, values);
  }) satisfies QueryFn;

async function defaultWithTransaction<T>(
  fn: (queryFn: QueryFn) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(clientAsQueryFn(client));
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Best-effort — original error matters more than a rollback failure.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Inserts a receipt (+ its items, only when newly inserted — receipts are
 * immutable snapshots once stored). Both statements run inside ONE
 * transaction: before this fix they were independent, so a failed items
 * INSERT left an item-less receipt behind FOREVER (`ON CONFLICT DO
 * NOTHING` on the receipt insert blocks a retried sync from self-healing
 * it). A rolled-back receipt insert means the next sync retries cleanly.
 */
async function upsertReceipt(
  userId: string,
  channel: "online" | "offline",
  receipt: ParsedReceipt,
  withTransaction: SilpoTransactionRunner,
): Promise<{ inserted: boolean; itemsInserted: number }> {
  return withTransaction(async (queryFn) => {
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
  });
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

/**
 * Дедуп-вікно для Sentry-алерту про дрейф схеми. Дрейф — стан, не подія:
 * якщо Сільпо змінили формат, ЖОДЕН наступний виклик не пройде, і без вікна
 * кожен тап «Оновити чеки» кожного користувача став би окремою подією.
 * Одна подія на 15 хв достатня, щоб побачити проблему, і не заливає квоту.
 */
const SCHEMA_DRIFT_ALERT_WINDOW_MS = 15 * 60_000;
let lastSchemaDriftAlertAt = 0;

/** Test-only: скидає вікно дедупу між тестами. */
export function __resetSilpoSchemaDriftAlert(): void {
  lastSchemaDriftAlertAt = 0;
}

function captureSilpoSchemaDrift(message: string): void {
  logger.error({ msg: "silpo_schema_drift", detail: message });
  const now = Date.now();
  if (now - lastSchemaDriftAlertAt < SCHEMA_DRIFT_ALERT_WINDOW_MS) return;
  lastSchemaDriftAlertAt = now;
  try {
    Sentry.captureException(
      new Error(`Silpo MCP schema drift: ${message}`), // NOSONAR — навмисно синтетична помилка як носій алерту
      {
        level: "warning",
        tags: { integration: "silpo", kind: "schema_drift" },
      },
    );
  } catch {
    /* Sentry ніколи не має ламати обробку помилки */
  }
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
      return new RateLimitError("Забагато запитів до Сільпо. Спробуй пізніше", {
        code: "SILPO_RATE_LIMITED",
      });
    case "schema_drift":
      // Єдиний детектор того, що Сільпо мовчки змінили контракт: версіонування
      // в них немає, зламатись може будь-коли (спека § Дрейф схеми tools).
      // `errorHandler` сюди НЕ докричиться до Sentry: він шле лише
      // НЕ-operational 5xx, а це `AppError` (operational) — тож без явного
      // capture дрейф лишався б самим лише warn-рядком у логах, який ніхто
      // не читає. Звідси прямий виклик тут.
      captureSilpoSchemaDrift(error.message);
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
 * receipts that don't already have a `silpo_tx_receipt_links` row.
 *
 * Throws a mapped {@link AppError} (via {@link silpoErrorToAppError}) on
 * connection/upstream failure — explicit user-triggered action, so a clean
 * 4xx/5xx is correct; the "staleness banner, never a crash" principle
 * (spec § Ізоляція збою) governs BACKGROUND degradation, not this button.
 */
export async function pullAndSyncReceipts(
  userId: string,
  deps: { query?: QueryFn; withTransaction?: SilpoTransactionRunner } = {},
): Promise<SilpoSyncResult> {
  const queryFn = deps.query ?? defaultQuery;
  const withTransaction = deps.withTransaction ?? defaultWithTransaction;

  const call = await callWithFreshAccessToken(
    userId,
    makeFetchBothOrderLists(userId),
    { query: queryFn },
  );
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
    const r = await upsertReceipt(userId, "offline", receipt, withTransaction);
    if (r.inserted) receiptsInserted++;
    itemsInserted += r.itemsInserted;
  }
  for (const receipt of onlineParsed) {
    const r = await upsertReceipt(userId, "online", receipt, withTransaction);
    if (r.inserted) receiptsInserted++;
    itemsInserted += r.itemsInserted;
  }

  const { matched, ambiguous, unmatched } = await matchAndLink(userId, queryFn);

  // Персистимо факт УСПІШНОГО завершення: sync без нових чеків теж оновлює
  // «Останнє оновлення» в UI (MAX(created_at) по чеках цього не вміє).
  await queryFn(
    `UPDATE silpo_connection
        SET last_sync_at = NOW(), updated_at = NOW()
      WHERE user_id = $1`,
    [userId],
    { op: "silpo_connection_touch_last_sync" },
  );

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

// Read paths live in `receiptsRead.ts` (Hard Rule #18), re-exported here.
export {
  listReceipts,
  getReceiptDetail,
  unlinkReceiptFromTransaction,
  relinkReceiptToTransaction,
  type ReceiptsPage,
  type ReceiptSummaryRow,
} from "./receiptsRead.js";

// Re-exported for tests exercising internals without a DB.
export const __test__ = {
  normalizeRawOrder,
  normalizeRawItem,
  upsertReceipt,
  defaultWithTransaction,
};
