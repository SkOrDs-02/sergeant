import { z } from "zod";

/**
 * Pure (no I/O, no logger) parsing/normalization for the "build a Silpo cart
 * from a shopping list" flow (spec `docs/90-work/planning/specs/
 * silpo-mcp-integration.md` § Track G). Split out of `cart.ts` per Hard Rule
 * #18 (module-size discipline) — everything here is a plain function, unit
 * tested directly without mocking `mcpClient`/`db`.
 *
 * Every raw schema stays `.passthrough()` per `mcpClient.ts`'s contract-belt
 * convention (spec § "Дрейф схеми tools"): a hit/line that doesn't parse is
 * DROPPED by the caller, never thrown.
 */

// ─────────────────────────── Opaque cart-selection token ────────────────────

/**
 * `silpo_add_or_update_cart_products` requires `{productId, companyId,
 * branchId, quantity}` per line — but `SilpoCartMatchDtoSchema` (Hard Rule
 * #3, `@sergeant/shared`) only exposes a single `lagerId` string per match,
 * so the client can echo a selection back on `/cart/apply` without the
 * server keeping any preview-session state. `lagerId` is that triplet,
 * base64url-encoded as JSON — an OPAQUE token from the client's point of
 * view (never parsed/constructed client-side, only echoed).
 */
export interface SelectionRef {
  productId: string;
  companyId: string;
  branchId: string;
}

export function encodeLagerId(ref: SelectionRef): string {
  return Buffer.from(JSON.stringify(ref), "utf8").toString("base64url");
}

/** Returns `null` (never throws) for a malformed/tampered/foreign token — the caller maps that to a 400, not a crash. */
export function decodeLagerId(token: string): SelectionRef | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    );
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>)["productId"] === "string" &&
      typeof (parsed as Record<string, unknown>)["companyId"] === "string" &&
      typeof (parsed as Record<string, unknown>)["branchId"] === "string"
    ) {
      return parsed as SelectionRef;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────── Shared helpers ──────────────────────────────

/** Same UAH→kopiykas convention as `receipts.ts::uahToKop` (reimplemented locally to keep this module import-free of `receipts.ts`). */
function uahToKop(uah: number): number {
  return Math.round(uah * 100);
}

/**
 * `"500г"` → `"г"`, `"10 шт"` → `"шт"`, `"1,5л"` → `"л"`. Falls back to
 * `"кг"`/`"шт"` from the catalog `weighted` flag when `displayRatio` is
 * absent or unparseable — mirrors `foodSource.ts::parseDisplayRatio`'s
 * regex, reimplemented locally (that helper isn't exported for reuse).
 */
export function deriveUnit(
  displayRatio: string | null | undefined,
  weighted: boolean | undefined,
): string {
  if (displayRatio) {
    const m = /^([\d.,]+)\s*(.+)$/.exec(displayRatio.trim());
    const unit = m?.[2]?.trim();
    if (unit) return unit;
  }
  return weighted ? "кг" : "шт";
}

// ──────────────────── Raw shapes — silpo_find_products_batch ────────────────

/** `queries[].products[]` hit (спайк §0 shape, see `tools-list.json`). */
export const RawCartCatalogHitSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    price: z.number().optional(), // UAH
    /**
     * Ціна ДО акції, UAH. Приходить у тому самому хіті
     * `silpo_find_products_batch`, який ми вже робимо для прев'ю — тобто
     * знижка не коштує жодного додаткового MCP-виклику.
     */
    oldPrice: z.number().nullable().optional(),
    /**
     * Наявність у філії. Теж приходить у хіті пошуку, і теж досі
     * викидалась — через що в кошик можна було покласти те, чого немає,
     * і дізнатись про це вже в застосунку Сільпо.
     */
    available: z.boolean().optional(),
    stock: z.number().optional(),
    companyId: z.string().nullable().optional(),
    branchId: z.string().nullable().optional(),
    weighted: z.boolean().optional(),
    displayRatio: z.string().nullable().optional(),
  })
  .passthrough();
export type RawCartCatalogHit = z.infer<typeof RawCartCatalogHitSchema>;

export const BatchEnvelopeSchema = z
  .object({
    queries: z
      .array(
        z
          .object({
            query: z.string().optional(),
            totalFound: z.number().optional(),
            products: z.array(z.unknown()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type RawBatchQuery = NonNullable<
  z.infer<typeof BatchEnvelopeSchema>["queries"]
>[number];

/**
 * Мінімальна знижка, яку варто показувати: 1%. Нижче цього клієнтське
 * `Math.round(...)` дає «−0%», тобто значок, який нічого не повідомляє,
 * але виглядає як акція.
 */
const MIN_PROMO_FRACTION = 0.01;

function isNotablePromo(
  oldPrice: number | null | undefined,
  price: number,
): oldPrice is number {
  if (oldPrice == null || oldPrice <= price) return false;
  // price === 0 (промо-подарунок) — знижка 100%, показуємо.
  if (price <= 0) return true;
  return (oldPrice - price) / oldPrice >= MIN_PROMO_FRACTION;
}

export interface CartMatch {
  lagerId: string;
  name: string;
  priceKop: number;
  /**
   * Ціна до акції в копійках, або `null` коли акції немає.
   *
   * Заповнюється лише коли знижка ПОМІТНА — щонайменше
   * {@link MIN_PROMO_FRACTION}. Спершу тут стояло просто «строго більша за
   * поточну», і цього виявилось замало: різниця в десять копійок на сотні
   * гривень проходила гейт, а `Math.round` у клієнті перетворював її на
   * «−0%». Сільпо шле і рівний `oldPrice` (технічний слід перецінки), і
   * такі копійчані хвости, тож поріг має жити тут — один раз, а не в
   * кожного споживача DTO.
   */
  oldPriceKop: number | null;
  /**
   * `false` — товару немає у філії. Позиція лишається у видачі (людина має
   * бачити, що продукт існує, просто закінчився), але прев'ю не відмічає
   * її за замовчуванням.
   *
   * Дефолт `true`: поле опційне, і мовчазна відсутність не мусить читатись
   * як «немає в наявності» — це зробило б увесь список сірим на першому ж
   * дрейфі схеми.
   */
  available: boolean;
  unit: string;
  displayRatio: string | null;
}

/**
 * Normalizes one catalog hit into a client-facing match. Returns `null`
 * (dropped, never thrown) when any field the CART-WRITE path needs
 * (`id`/`companyId`/`branchId` → the `lagerId` triplet, `name`, `price`) is
 * missing — a hit usable only for display but not for `/cart/apply` is worse
 * than no hit (it would 400 later with no way for the user to know why).
 */
export function normalizeCartMatch(raw: RawCartCatalogHit): CartMatch | null {
  if (
    !raw.id ||
    !raw.name ||
    raw.price === undefined ||
    !raw.companyId ||
    !raw.branchId
  ) {
    return null;
  }
  return {
    lagerId: encodeLagerId({
      productId: raw.id,
      companyId: raw.companyId,
      branchId: raw.branchId,
    }),
    name: raw.name,
    priceKop: uahToKop(raw.price),
    oldPriceKop: isNotablePromo(raw.oldPrice, raw.price)
      ? uahToKop(raw.oldPrice)
      : null,
    // `stock: 0` — теж «немає», навіть коли прапорець мовчить.
    available: raw.available !== false && raw.stock !== 0,
    unit: deriveUnit(raw.displayRatio, raw.weighted),
    displayRatio: raw.displayRatio ?? null,
  };
}

// ──────────────────── Raw shapes — cart read (get_my_shopping_cart) ─────────

export const CartRefSchema = z
  .object({ shoppingCartId: z.string().optional() })
  .passthrough();

// ───────────────── Raw shapes — get_shopping_cart_by_id (`cart`) ────────────

const RawCartProductLineSchema = z
  .object({
    name: z.string().optional(),
    price: z.number().optional(), // UAH, unit price
    quantity: z.number().optional(),
    subtotal: z.number().optional(), // UAH, line total
  })
  .passthrough();

const RawCartCalculationSchema = z
  .object({
    total: z.number().optional(), // UAH, before discounts
    totalAfterDiscounts: z.number().optional(), // UAH, what the user pays
  })
  .passthrough();

const RawCartSchema = z
  .object({
    shipments: z
      .array(
        z.object({ products: z.array(z.unknown()).optional() }).passthrough(),
      )
      .optional(),
    calculation: RawCartCalculationSchema.optional(),
  })
  .passthrough();

export const CartDetailEnvelopeSchema = z
  .object({
    cart: z.unknown().optional(),
    checkoutWebLink: z.string().optional(),
  })
  .passthrough();

export interface CartItem {
  name: string;
  quantity: number;
  priceKop: number;
  subtotalKop: number;
}

export interface NormalizedCart {
  items: CartItem[];
  totalKop: number | null;
  cartUrl: string | null;
}

export interface CartDetailNormalizeResult {
  cart: NormalizedCart;
  /** Count of `shipments[].products[]` lines dropped for missing fields — the caller logs this, never throws on it. */
  itemsDropped: number;
}

/**
 * Normalizes the FULL `{success, cart, checkoutWebLink}` envelope returned
 * by `silpo_get_shopping_cart_by_id`. Returns `null` only when the envelope
 * itself (or its `cart` object) is unparseable — a genuine schema-drift the
 * caller must surface as a degraded (never crashing) error. Individual line
 * items that don't parse are dropped and counted in `itemsDropped` instead.
 */
export function normalizeCartDetail(
  raw: unknown,
): CartDetailNormalizeResult | null {
  const envelope = CartDetailEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return null;

  const cartParsed = RawCartSchema.safeParse(envelope.data.cart);
  if (!cartParsed.success) return null;

  const rawLines = (cartParsed.data.shipments ?? []).flatMap(
    (s) => s.products ?? [],
  );

  let itemsDropped = 0;
  const items: CartItem[] = [];
  for (const rawLine of rawLines) {
    const parsed = RawCartProductLineSchema.safeParse(rawLine);
    if (!parsed.success) {
      itemsDropped++;
      continue;
    }
    const { name, price, quantity, subtotal } = parsed.data;
    if (!name || price === undefined || quantity === undefined) {
      itemsDropped++;
      continue;
    }
    items.push({
      name,
      quantity,
      priceKop: uahToKop(price),
      subtotalKop: uahToKop(subtotal ?? price * quantity),
    });
  }

  const calc = cartParsed.data.calculation;
  const totalUah = calc?.totalAfterDiscounts ?? calc?.total;

  return {
    cart: {
      items,
      totalKop: totalUah !== undefined ? uahToKop(totalUah) : null,
      cartUrl: envelope.data.checkoutWebLink ?? null,
    },
    itemsDropped,
  };
}
