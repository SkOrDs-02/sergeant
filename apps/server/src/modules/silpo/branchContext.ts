import { z } from "zod";
import { logger } from "../../obs/logger.js";
import { callMcpTool, type McpResult } from "./mcpClient.js";

/**
 * Контекст філії для Silpo-tools. Спайк §0 (2026-08-18) показав, що
 * `silpo_get_my_offline_orders`, `silpo_find_products_batch` і
 * `silpo_get_product_details` ВИМАГАЮТЬ `branchId`/`deliveryType`/
 * `timeslotStart`/`timeslotEnd` у аргументах (input schema `required`).
 * Живий прогін підтвердив: порожні рядки timeslot-ів сервер приймає, а
 * контекст впливає лише на enrichment наявності (`catalogProduct`), не на
 * сам список чеків.
 *
 * Джерело контексту — ланцюг `silpo_get_my_shopping_cart` →
 * `silpo_get_shopping_cart_by_id` (`cart.deliveryType` +
 * `cart.shipments[0].branchId`); fallback для користувача без кошика —
 * перша філія з `silpo_list_branches` + `SelfPickup`.
 */

export interface SilpoBranchContext {
  branchId: string;
  deliveryType: string;
  timeslotStart: string;
  timeslotEnd: string;
}

const CartRefSchema = z
  .object({ shoppingCartId: z.string().optional() })
  .passthrough();

const CartByIdSchema = z
  .object({
    cart: z
      .object({
        deliveryType: z.string().optional(),
        shipments: z
          .array(z.object({ branchId: z.string().optional() }).passthrough())
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const BranchesSchema = z
  .object({
    branches: z
      .array(z.object({ branchId: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

// ponytail: in-memory TTL cache, per-instance — контекст квазістатичний
// (кошик/філія юзера), а без кешу кожен food-search платив би +4 HTTP.
const CONTEXT_TTL_MS = 15 * 60 * 1000;

/**
 * Стеля на кількість користувачів у кеші.
 *
 * AI-DANGER: TTL не звільняє пам'ять сам по собі — протермінований запис
 * лежить у `Map`, доки той самий `userId` не прийде знову. Sweep-у немає,
 * тож без стелі це монотонне зростання з кожним новим користувачем Сільпо.
 * Дефект той самий, що в `lib/counterpartyNames.ts`, лише легший: запис тут
 * маленький (одна філія), а TTL утричі довший.
 *
 * Витіснення — найстаріший за порядком вставки, як у
 * `modules/nutrition/barcode.ts`.
 */
const CONTEXT_MAX_SIZE = 500;

const cache = new Map<string, { ctx: SilpoBranchContext; expiresAt: number }>();

/** Test-only: clear the per-user context cache between unit tests. */
export function __silpoBranchContextTestHooks(): {
  clearCache(): void;
  cacheSize(): number;
} {
  return {
    clearCache(): void {
      cache.clear();
    },
    cacheSize(): number {
      return cache.size;
    },
  };
}

/** Покласти запис і дотримати стелю (див. `CONTEXT_MAX_SIZE`). */
function cacheSet(userId: string, ctx: SilpoBranchContext): void {
  // Знімаємо наявний ключ перед вставкою, щоб оновлення переїхало в кінець
  // черги вставки, а не витіснялось першим як «найстаріше».
  if (cache.has(userId)) cache.delete(userId);
  cache.set(userId, { ctx, expiresAt: Date.now() + CONTEXT_TTL_MS });
  while (cache.size > CONTEXT_MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function fetchFromCart(
  accessToken: string,
  signal?: AbortSignal,
): Promise<SilpoBranchContext | null> {
  const cartRef = await callMcpTool({
    accessToken,
    toolName: "silpo_get_my_shopping_cart",
    args: {},
    schema: CartRefSchema,
    signal,
  });
  if (!cartRef.ok || !cartRef.data.shoppingCartId) return null;

  const cart = await callMcpTool({
    accessToken,
    toolName: "silpo_get_shopping_cart_by_id",
    args: { shoppingCartId: cartRef.data.shoppingCartId },
    schema: CartByIdSchema,
    signal,
  });
  if (!cart.ok) return null;

  const branchId = cart.data.cart?.shipments?.find((s) => s.branchId)?.branchId;
  const deliveryType = cart.data.cart?.deliveryType;
  if (!branchId || !deliveryType) return null;
  return { branchId, deliveryType, timeslotStart: "", timeslotEnd: "" };
}

async function fetchFromBranches(
  accessToken: string,
  signal?: AbortSignal,
): Promise<SilpoBranchContext | null> {
  const branches = await callMcpTool({
    accessToken,
    toolName: "silpo_list_branches",
    args: { limit: 1, hasPickup: true },
    schema: BranchesSchema,
    signal,
  });
  if (!branches.ok) return null;
  const branchId = branches.data.branches?.find((b) => b.branchId)?.branchId;
  if (!branchId) return null;
  return {
    branchId,
    deliveryType: "SelfPickup",
    timeslotStart: "",
    timeslotEnd: "",
  };
}

/**
 * Резолвить контекст філії для користувача (кошик → fallback філія),
 * кешуючи на {@link CONTEXT_TTL_MS}. Повертає `McpResult` — помилка означає,
 * що ЖОДЕН шлях не дав контексту; каллери деградують (skip offline-чеків /
 * skip Silpo-джерела пошуку), ніколи не крашаться.
 */
export async function resolveBranchContext(
  userId: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<McpResult<SilpoBranchContext>> {
  const cached = cache.get(userId);
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return { ok: true, data: cached.ctx };
    }
    // Протермінований запис знімаємо одразу — інакше він тримає місце під
    // стелею, поки цей користувач не повернеться (а може й не повернутись).
    cache.delete(userId);
  }

  const ctx =
    (await fetchFromCart(accessToken, signal)) ??
    (signal?.aborted ? null : await fetchFromBranches(accessToken, signal));
  if (!ctx) {
    logger.warn({ msg: "silpo_branch_context_unavailable" });
    return {
      ok: false,
      error: {
        kind: "schema_drift",
        message:
          "Не вдалося визначити контекст філії Сільпо (кошик і список філій недоступні)",
      },
    };
  }

  cacheSet(userId, ctx);
  return { ok: true, data: ctx };
}
