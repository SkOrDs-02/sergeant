import { z } from "zod";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { ValidationError } from "../../obs/errors.js";
import { callMcpTool, type McpResult } from "./mcpClient.js";
import { callWithFreshAccessToken, type QueryFn } from "./tokenStore.js";
import { resolveBranchContext } from "./branchContext.js";
import { silpoErrorToAppError } from "./receipts.js";
import {
  BatchEnvelopeSchema,
  CartRefSchema,
  RawCartCatalogHitSchema,
  decodeLagerId,
  normalizeCartDetail,
  normalizeCartMatch,
  type CartMatch,
  type NormalizedCart,
  type RawBatchQuery,
  type SelectionRef,
} from "./cartNormalize.js";

/**
 * "Зібрати кошик у Сільпо зі списку покупок" (Track G — spec
 * `docs/90-work/planning/specs/silpo-mcp-integration.md`). Three entry
 * points: `previewCart` (search only, no write), `applyCart` (confirm-
 * before-write — adds EXACTLY the passed `{lagerId, quantity}` pairs, never
 * more), `getCart` (read current state). All three THROW a mapped
 * `AppError` (via `silpoErrorToAppError`, reused from `receipts.ts`) on any
 * connection/upstream failure — same convention as `pullAndSyncReceipts`:
 * this is an explicit user-triggered action, so a clean 4xx/5xx is correct,
 * not a swallowed staleness banner (that principle governs BACKGROUND
 * degradation like `foodSource.ts`, not a button the user just pressed).
 */

// ────────────────────────── Preview (search, no write) ──────────────────────

export interface CartPreviewInput {
  name: string;
  quantity?: number | undefined;
}

export interface CartPreviewResult {
  query: string;
  matches: CartMatch[];
  unmatched: boolean;
}

/** `silpo_find_products_batch` caps `products` at 30 per call — chunk larger shopping lists (route allows up to 100 items). */
const BATCH_CHUNK_SIZE = 30;
/** Top candidate + up to 2 alternatives, per spec. */
const MATCHES_PER_QUERY = 3;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function makeFetchPreviewQueries(
  userId: string,
  names: string[],
): (accessToken: string) => Promise<McpResult<RawBatchQuery[]>> {
  return async (accessToken) => {
    const ctx = await resolveBranchContext(userId, accessToken);
    if (!ctx.ok) return ctx;

    // Чанки йдуть паралельно, не послідовно: список на 100 позицій — це 4
    // виклики по 30, і послідовно вони складались у чотири RTT підряд перед
    // тим, як людина побачить превʼю. Порядок результатів зберігає
    // `Promise.all`, а `buildPreviewResults` усе одно матчить за текстом
    // запиту, не за індексом. Стеля паралелізму — сам розмір списку (роут
    // ріже його на 100 позиціях = максимум 4 одночасні виклики), тож
    // окремий семафор тут був би зайвою деталлю.
    const batches = await Promise.all(
      chunk(names, BATCH_CHUNK_SIZE).map((group) =>
        callMcpTool({
          accessToken,
          toolName: "silpo_find_products_batch",
          args: {
            branchId: ctx.data.branchId,
            deliveryType: ctx.data.deliveryType,
            timeslotStart: ctx.data.timeslotStart,
            timeslotEnd: ctx.data.timeslotEnd,
            products: group,
            limit: MATCHES_PER_QUERY,
          },
          schema: BatchEnvelopeSchema,
        }),
      ),
    );

    const allQueries: RawBatchQuery[] = [];
    for (const batch of batches) {
      // Перша ж невдача — загальна: превʼю з дірою гірше за чесну помилку,
      // бо людина підтверджує запис у кошик саме за цим списком.
      if (!batch.ok) return batch;
      allQueries.push(...(batch.data.queries ?? []));
    }
    return { ok: true, data: allQueries };
  };
}

/**
 * Matches request items back to raw `queries[]` entries by exact `query`
 * text (each raw entry consumed at most once) rather than by array index —
 * a provider-side reorder or a duplicate shopping-list line must never
 * silently swap results across two different lines. A line with no
 * corresponding raw entry (schema drift / dropped by Silpo) degrades to
 * `unmatched: true`, never a crash.
 */
export function buildPreviewResults(
  items: CartPreviewInput[],
  rawQueries: RawBatchQuery[],
): CartPreviewResult[] {
  const remaining = [...rawQueries];
  return items.map((item) => {
    const trimmedName = item.name.trim();
    const idx = remaining.findIndex((q) => q.query === trimmedName);
    const found = idx >= 0 ? remaining.splice(idx, 1)[0] : undefined;
    if (!found) {
      logger.warn({
        msg: "silpo_cart_preview_query_missing",
        query: trimmedName,
      });
      return { query: trimmedName, matches: [], unmatched: true };
    }

    const matches: CartMatch[] = [];
    for (const raw of found.products ?? []) {
      const parsed = RawCartCatalogHitSchema.safeParse(raw);
      if (!parsed.success) continue;
      const match = normalizeCartMatch(parsed.data);
      if (match) matches.push(match);
      if (matches.length >= MATCHES_PER_QUERY) break;
    }

    return { query: trimmedName, matches, unmatched: matches.length === 0 };
  });
}

/** `POST /api/silpo/cart/preview` orchestration — search only, never writes. */
export async function previewCart(
  userId: string,
  items: CartPreviewInput[],
  deps: { query?: QueryFn } = {},
): Promise<CartPreviewResult[]> {
  const names = items.map((i) => i.name.trim());
  const call = await callWithFreshAccessToken(
    userId,
    makeFetchPreviewQueries(userId, names),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return buildPreviewResults(items, call.data);
}

// ───────────────────────────── Cart read (shared) ────────────────────────────

async function fetchNormalizedCart(
  accessToken: string,
  shoppingCartId: string,
): Promise<McpResult<NormalizedCart>> {
  const detail = await callMcpTool({
    accessToken,
    toolName: "silpo_get_shopping_cart_by_id",
    args: { shoppingCartId },
    // Permissive on purpose: `normalizeCartDetail` does the real (degrading,
    // never-throwing) parsing below — `callMcpTool` would otherwise reject
    // the whole call on the FIRST unrecognized field.
    schema: z.unknown(),
  });
  if (!detail.ok) return detail;

  const normalized = normalizeCartDetail(detail.data);
  if (!normalized) {
    logger.warn({ msg: "silpo_cart_detail_unparseable" });
    return {
      ok: false,
      error: {
        kind: "schema_drift",
        message: "Не вдалося розібрати відповідь кошика Сільпо",
      },
    };
  }
  if (normalized.itemsDropped > 0) {
    logger.warn({
      msg: "silpo_cart_items_dropped",
      count: normalized.itemsDropped,
    });
  }
  return { ok: true, data: normalized.cart };
}

/** `GET /api/silpo/cart`. An account with no cart yet (no prior search/order) degrades to an empty cart, not an error. */
export async function getCart(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<NormalizedCart> {
  const call = await callWithFreshAccessToken(
    userId,
    async (accessToken) => {
      const cartRef = await callMcpTool({
        accessToken,
        toolName: "silpo_get_my_shopping_cart",
        args: {},
        schema: CartRefSchema,
      });
      if (!cartRef.ok) return cartRef;
      const shoppingCartId = cartRef.data.shoppingCartId;
      if (!shoppingCartId) {
        const empty: NormalizedCart = { items: [], totalKop: 0, cartUrl: null };
        return { ok: true, data: empty };
      }
      return fetchNormalizedCart(accessToken, shoppingCartId);
    },
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return call.data;
}

// ──────────────────────── Apply (confirm-before-write) ───────────────────────

export interface CartSelectionInput {
  lagerId: string;
  quantity: number;
}

function makeApplySelections(
  decoded: Array<{ ref: SelectionRef; quantity: number }>,
): (accessToken: string) => Promise<McpResult<NormalizedCart>> {
  return async (accessToken) => {
    const cartRef = await callMcpTool({
      accessToken,
      toolName: "silpo_get_my_shopping_cart",
      args: {},
      schema: CartRefSchema,
    });
    if (!cartRef.ok) return cartRef;
    const shoppingCartId = cartRef.data.shoppingCartId;
    if (!shoppingCartId) {
      return {
        ok: false,
        error: {
          kind: "schema_drift",
          message: "Silpo MCP не повернув ідентифікатор кошика",
        },
      };
    }

    // `addQuantity: false` — REPLACE, not accumulate: confirm-before-write
    // means exactly these positions land in the cart, nothing on top of
    // whatever was already there.
    const addResult = await callMcpTool({
      accessToken,
      toolName: "silpo_add_or_update_cart_products",
      args: {
        shoppingCartId,
        products: decoded.map(({ ref, quantity }) => ({
          productId: ref.productId,
          companyId: ref.companyId,
          branchId: ref.branchId,
          quantity,
          addQuantity: false,
        })),
      },
      schema: z.unknown(),
    });
    if (!addResult.ok) return addResult;

    // Tool contract mandates verifying via `silpo_get_shopping_cart_by_id`
    // immediately after a write (see `tools-list.json` description) — this
    // ALSO gives us the post-write state the route needs to return.
    return fetchNormalizedCart(accessToken, shoppingCartId);
  };
}

/**
 * `POST /api/silpo/cart/apply`. Decodes every `lagerId` BEFORE touching the
 * network — a malformed/tampered token is a client input error (400
 * `VALIDATION`), not an upstream failure, so it never goes through the
 * `McpError` → 502/503 mapping.
 */
export async function applyCart(
  userId: string,
  selections: CartSelectionInput[],
  deps: { query?: QueryFn } = {},
): Promise<NormalizedCart> {
  const decoded = selections.map((sel) => {
    const ref = decodeLagerId(sel.lagerId);
    if (!ref) {
      throw new ValidationError("Некоректний ідентифікатор товару Сільпо", {
        cause: { lagerId: sel.lagerId },
      });
    }
    return { ref, quantity: sel.quantity };
  });

  const call = await callWithFreshAccessToken(
    userId,
    makeApplySelections(decoded),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return call.data;
}

/**
 * `POST /api/silpo/cart/clear` — спорожнити зовнішній кошик.
 *
 * Навіщо, якщо є апка Сільпо: `applyCart` пише REPLACE-ом рівно вибрані
 * позиції, тож помилковий список лишається в кошику цілком. Один тап тут
 * дешевший, ніж вручну знімати десяток позицій у чужому інтерфейсі.
 *
 * ponytail: тільки повне очищення, БЕЗ per-item `silpo_remove_cart_products`
 * і `silpo_update_shopping_cart`. Поштучне редагування дублює апку Сільпо,
 * куди людина йде одразу після `apply` (checkout усе одно там) — а наш
 * степер живе на прев'ю ДО запису. Зʼявиться сценарій «зняти одну позицію,
 * не виходячи з Sergeant» — саме тоді й додавай, tool у MCP є.
 *
 * Порожній кошик — не помилка: акаунт без жодного пошуку/замовлення не має
 * `shoppingCartId` взагалі, і «очистити нічого» це успіх, той самий degrade,
 * що в `getCart`.
 */
export async function clearCart(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<NormalizedCart> {
  const empty: NormalizedCart = { items: [], totalKop: 0, cartUrl: null };

  const call = await callWithFreshAccessToken(
    userId,
    async (accessToken) => {
      const cartRef = await callMcpTool({
        accessToken,
        toolName: "silpo_get_my_shopping_cart",
        args: {},
        schema: CartRefSchema,
      });
      if (!cartRef.ok) return cartRef;
      const shoppingCartId = cartRef.data.shoppingCartId;
      if (!shoppingCartId) return { ok: true as const, data: empty };

      const cleared = await callMcpTool({
        accessToken,
        toolName: "silpo_clear_shopping_cart",
        args: { shoppingCartId },
        schema: z.unknown(),
      });
      if (!cleared.ok) return cleared;

      // Той самий post-write verify, що й в `applyCart`: контракт tool-а
      // вимагає перечитати кошик після запису, і це ж дає стан для роута.
      return fetchNormalizedCart(accessToken, shoppingCartId);
    },
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return call.data;
}
