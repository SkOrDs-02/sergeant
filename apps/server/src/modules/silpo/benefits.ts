import { z } from "zod";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { callMcpTool } from "./mcpClient.js";
import { callWithFreshAccessToken, type QueryFn } from "./tokenStore.js";
import { silpoErrorToAppError } from "./receipts.js";

/**
 * Read-only шар над шістьма "loyalty" тулами Сільпо — жодна з них не
 * потребує обовʼязкових аргументів (крім `silpo_get_coupon_details`, що
 * бере `businessCouponId` із результату `silpo_get_my_coupons`), тож усі
 * ідуть повз `resolveBranchContext`: саме там сьогодні тихо деградує
 * `cart.ts`/`foodSource.ts` (`silpo_offline_orders_skipped_no_branch_context`
 * — відсутній контекст філії, коли branch/timeslot визначити не вдається).
 * Ці шість тул того ризику не мають узагалі.
 *
 * Продуктова мета (недоотримані знижки — задача власника): у нас лежать
 * ЧЕКИ (`receipts.ts`), і зіставлення купленого з невикористаними
 * купонами/акціями міг би зробити лише той, хто бачить обидва боки. Цей
 * модуль дає ЛИШЕ читання — саму логіку зіставлення свідомо не чіпаємо
 * (продуктове рішення власника, поза скоупом читацького шару). Аналіз
 * структурних полів для матчингу — у звіті задачі; короткий висновок: ані
 * купон, ані акція не несуть ідентифікатора товару/категорії, лише вільний
 * текст, тож детерміноване зіставлення з позицією чека з наявних полів
 * неможливе.
 *
 * **Тримаємо схеми толерантними навмисно.** Фікстура `tools-list.json`
 * знята 18 серпня і вже раз розійшлася з живим сервером (спека §
 * "Дрейф схеми tools" — Сільпо мовчки знизили `limit` зі 100 до 50).
 * Розбираємо лише ті поля, які реально використовуємо, і списки — ПОЕЛЕМЕНТНО
 * (патерн `fetchOrderList` у `receipts.ts`): один битий елемент не валить
 * увесь список, лише випадає з нього з попередженням у лог (форма, не
 * вміст — Hard Rule #21).
 *
 * **Hard Rule #21 тут особливо гострий.** Купони, бонуси й сертифікати —
 * фінансові дані; сертифікат несе `barcode`/`pincode` — фактично платіжний
 * інструмент. У логи цього модуля йдуть лише лічильники, коди помилок і
 * форма відповіді — НІКОЛИ номінали, штрихкоди, пінкоди чи тексти купонів.
 */

// ─────────────────────────────── Loyalty info ──────────────────────────────

const LoyaltyCardSchema = z
  .object({
    barcode: z.string(),
    typeName: z.string().nullable().optional(),
    memberId: z.number().nullable().optional(),
  })
  .passthrough();

const LoyaltyBalanceAccountSchema = z
  .object({
    type: z.string(),
    amount: z.number(),
  })
  .passthrough();

const LoyaltyBalanceSchema = z
  .object({
    total: z.number(),
    currency: z.string().nullable().optional(),
    accounts: z.array(LoyaltyBalanceAccountSchema).optional(),
  })
  .passthrough();

const LoyaltyInfoPayloadSchema = z
  .object({
    loyalty: z
      .object({
        card: LoyaltyCardSchema.nullable().optional(),
        balance: LoyaltyBalanceSchema.nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export interface SilpoLoyaltyAccount {
  type: string;
  amount: number;
}

export interface SilpoLoyaltyInfo {
  cardBarcode: string | null;
  cardTypeName: string | null;
  balanceTotal: number | null;
  balanceCurrency: string | null;
  balanceAccounts: SilpoLoyaltyAccount[];
}

function normalizeLoyaltyInfo(
  payload: z.infer<typeof LoyaltyInfoPayloadSchema>,
): SilpoLoyaltyInfo {
  const card = payload.loyalty.card ?? null;
  const balance = payload.loyalty.balance ?? null;
  return {
    cardBarcode: card?.barcode ?? null,
    cardTypeName: card?.typeName ?? null,
    balanceTotal: balance?.total ?? null,
    balanceCurrency: balance?.currency ?? null,
    balanceAccounts: (balance?.accounts ?? []).map((a) => ({
      type: a.type,
      amount: a.amount,
    })),
  };
}

/** `silpo_get_loyalty_info` — `{}`, баланс бонусів + картка лояльності. */
export async function getLoyaltyInfo(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoLoyaltyInfo> {
  const call = await callWithFreshAccessToken(
    userId,
    (accessToken) =>
      callMcpTool({
        accessToken,
        toolName: "silpo_get_loyalty_info",
        args: {},
        schema: LoyaltyInfoPayloadSchema,
      }),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return normalizeLoyaltyInfo(call.data);
}

// ─────────────────────────── Shared list-envelope helper ───────────────────

/**
 * Розбирає елементи списку поелементно: битий елемент випадає з
 * попередженням (лише лічильник + індекс + код помилки zod — НІКОЛИ
 * вміст), решта лишається.
 */
function parseListElements<T>(
  toolName: string,
  rawItems: unknown[],
  itemSchema: z.ZodType<T>,
): T[] {
  const items: T[] = [];
  rawItems.forEach((raw, index) => {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn({
        msg: "silpo_benefits_item_unparseable",
        tool: toolName,
        index,
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          code: i.code,
        })),
      });
      return;
    }
    items.push(parsed.data);
  });
  return items;
}

// ────────────────────────────────── Coupons ─────────────────────────────────

const CouponElementSchema = z
  .object({
    id: z.number(),
    active: z.boolean(),
    useWay: z.string().nullable().optional(),
    beginDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    limitText: z.string().nullable().optional(),
    warningText: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
  })
  .passthrough();

export type SilpoCoupon = z.infer<typeof CouponElementSchema>;

const CouponsEnvelopeSchema = z
  .object({ coupons: z.array(z.unknown()).optional() })
  .passthrough();

/** `silpo_get_my_coupons` — `{}`, доступні купони. */
export async function getMyCoupons(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoCoupon[]> {
  const call = await callWithFreshAccessToken(
    userId,
    (accessToken) =>
      callMcpTool({
        accessToken,
        toolName: "silpo_get_my_coupons",
        args: {},
        schema: CouponsEnvelopeSchema,
      }),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return parseListElements(
    "silpo_get_my_coupons",
    call.data.coupons ?? [],
    CouponElementSchema,
  );
}

const CouponDetailPayloadSchema = z
  .object({
    coupon: z
      .object({
        id: z.number(),
        active: z.boolean(),
        state: z.string().nullable().optional(),
        useWay: z.string().nullable().optional(),
        beginDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        usedCount: z.number().nullable().optional(),
        description: z.string().nullable().optional(),
        limitText: z.string().nullable().optional(),
        warningText: z.string().nullable().optional(),
        rewardText: z.string().nullable().optional(),
        rewardValue: z.number().nullable().optional(),
        image: z.string().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type SilpoCouponDetail = z.infer<
  typeof CouponDetailPayloadSchema
>["coupon"];

/**
 * `silpo_get_coupon_details` — єдина з шести тул з обовʼязковим аргументом
 * (`businessCouponId`, взятим з елемента `silpo_get_my_coupons`).
 */
export async function getCouponDetails(
  userId: string,
  businessCouponId: number,
  deps: { query?: QueryFn } = {},
): Promise<SilpoCouponDetail> {
  const call = await callWithFreshAccessToken(
    userId,
    (accessToken) =>
      callMcpTool({
        accessToken,
        toolName: "silpo_get_coupon_details",
        args: { businessCouponId },
        schema: CouponDetailPayloadSchema,
      }),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return call.data.coupon;
}

// ────────────────────────────────── Promos ──────────────────────────────────

const PromoElementSchema = z
  .object({
    promoId: z.number(),
    selected: z.boolean(),
    beginDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    rewardText: z.string().nullable().optional(),
    rewardValue: z.number().nullable().optional(),
    limitText: z.string().nullable().optional(),
    warningText: z.string().nullable().optional(),
    addressListText: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
  })
  .passthrough();

export type SilpoPromo = z.infer<typeof PromoElementSchema>;

const PromosMetaSchema = z
  .object({
    total: z.number().optional(),
    minSelect: z.number().optional(),
    maxSelect: z.number().optional(),
  })
  .passthrough();

const PromosEnvelopeSchema = z
  .object({
    promos: z.array(z.unknown()).optional(),
    meta: PromosMetaSchema.optional(),
  })
  .passthrough();

export interface SilpoPromosResult {
  promos: SilpoPromo[];
  meta: {
    total: number | null;
    minSelect: number | null;
    maxSelect: number | null;
  };
}

/** `silpo_get_my_promos` — `{}`, персональні акції, які можна активувати. */
export async function getMyPromos(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoPromosResult> {
  const call = await callWithFreshAccessToken(
    userId,
    (accessToken) =>
      callMcpTool({
        accessToken,
        toolName: "silpo_get_my_promos",
        args: {},
        schema: PromosEnvelopeSchema,
      }),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  const promos = parseListElements(
    "silpo_get_my_promos",
    call.data.promos ?? [],
    PromoElementSchema,
  );
  const meta = call.data.meta;
  return {
    promos,
    meta: {
      total: meta?.total ?? null,
      minSelect: meta?.minSelect ?? null,
      maxSelect: meta?.maxSelect ?? null,
    },
  };
}

// ─────────────────────────────── Promo codes ────────────────────────────────

const PromoCodeElementSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    title: z.string().nullable().optional(),
    active: z.boolean(),
  })
  .passthrough();

export type SilpoPromoCode = z.infer<typeof PromoCodeElementSchema>;

const PromoCodesEnvelopeSchema = z
  .object({ promoCodes: z.array(z.unknown()).optional() })
  .passthrough();

/** `silpo_get_promo_codes` — `{}`, промокоди. */
export async function getPromoCodes(
  userId: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoPromoCode[]> {
  const call = await callWithFreshAccessToken(
    userId,
    (accessToken) =>
      callMcpTool({
        accessToken,
        toolName: "silpo_get_promo_codes",
        args: {},
        schema: PromoCodesEnvelopeSchema,
      }),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return parseListElements(
    "silpo_get_promo_codes",
    call.data.promoCodes ?? [],
    PromoCodeElementSchema,
  );
}

// ─────────────────────────────── Certificates ───────────────────────────────

const CertificateElementSchema = z
  .object({
    id: z.number(),
    createdAt: z.string(),
    totalPrice: z.number(),
    barcode: z.string(),
    pincode: z.union([z.string(), z.number()]).nullable().optional(),
    expireDate: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
  })
  .passthrough();

export type SilpoCertificate = z.infer<typeof CertificateElementSchema>;

const CertificatesEnvelopeSchema = z
  .object({ certificates: z.array(z.unknown()).optional() })
  .passthrough();

export interface GetMyCertificatesOptions {
  /** 1..100 (фікстура: `default 50`). */
  limit?: number;
  /** ≥ 0. */
  offset?: number;
}

/**
 * `silpo_get_my_certificates` — сертифікати з номіналом і строком дії.
 * `barcode`/`pincode` — фактично платіжний інструмент (Hard Rule #21):
 * значення повертаються викликачу, але НІКОЛИ не логуються цим модулем.
 */
export async function getMyCertificates(
  userId: string,
  opts: GetMyCertificatesOptions = {},
  deps: { query?: QueryFn } = {},
): Promise<SilpoCertificate[]> {
  const args: { limit?: number; offset?: number } = {};
  if (opts.limit !== undefined) args.limit = opts.limit;
  if (opts.offset !== undefined) args.offset = opts.offset;

  const call = await callWithFreshAccessToken(
    userId,
    (accessToken) =>
      callMcpTool({
        accessToken,
        toolName: "silpo_get_my_certificates",
        args,
        schema: CertificatesEnvelopeSchema,
      }),
    { query: deps.query ?? defaultQuery },
  );
  if (!call.ok) throw silpoErrorToAppError(call.error);
  return parseListElements(
    "silpo_get_my_certificates",
    call.data.certificates ?? [],
    CertificateElementSchema,
  );
}
