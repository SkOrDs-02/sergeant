import { z } from "zod";
import { env } from "../../env/env.js";
import { query as defaultQuery } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { callMcpTool, type McpResult } from "./mcpClient.js";
import { callWithFreshAccessToken, type QueryFn } from "./tokenStore.js";
import {
  resolveBranchContext,
  type SilpoBranchContext,
} from "./branchContext.js";

/**
 * Silpo as the FOURTH source in the food-search / barcode cascades (spec
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` § Рішення дизайну,
 * "Продуктові дані — четверте джерело каскаду"). Narrowed per spec §0's open
 * question ("Відкрите питання авторизаційного контексту"): there is no
 * service-level Silpo credential, only per-user OAuth tokens obtained via
 * `/api/silpo/connect`. Proxying product lookups through one user's token on
 * behalf of a DIFFERENT (unconnected) user would be legally dubious (offer/
 * ToS gate) and technically fragile, so this source activates ONLY for the
 * requesting user's OWN linked account — never as a shared/service fallback.
 *
 * `apps/server/src/routes/food-search.ts` and `apps/server/src/routes/
 * barcode.ts` are SESSION-LESS endpoints (open to anonymous callers,
 * PERF-007 typeahead). This module never requires a session — callers pass
 * whatever `userId` they resolved best-effort (or `null`/`undefined`), and
 * every entry point degrades to "contribute nothing" when there's no user,
 * no connection, `SILPO_ENABLED=false`, or any MCP-layer failure. Silpo is a
 * bonus source, never an authoritative one — its failure must NEVER surface
 * as a cascade-level error (unlike OFF/USDA/UPCitemdb `upstreamThrew`).
 *
 * Форми звірені живим спайком §0 (2026-08-18):
 *
 * - `silpo_find_products_batch` вимагає контекст філії (`branchContext.ts`),
 *   параметр зветься `products` (масив запитів), відповідь —
 *   `{queries: [{query, totalFound, products: [...]}]}`. Хіти каталогу НЕ
 *   містять КБЖВ — лише `{id, name, slug, price, displayRatio,
 *   externalProductId, ...}`.
 * - КБЖВ живе ТІЛЬКИ в `silpo_get_product_details` → `product.attributes`
 *   з українськими ключами: `"Білки (г)": 2.9`, `"Жири (г)"`,
 *   `"Вуглеводи (г)"` (numbers) і `"Енергетична цінність (кКал/кДЖ)":
 *   "119/492"` (рядок — kcal до слеша). Тому пошук — двофазний: batch →
 *   details для топ-{@link SEARCH_DETAILS_LIMIT} хітів.
 * - EAN/штрихкода немає НІДЕ (ні в чеках, ні в каталозі, ні в details;
 *   `silpo_get_product_details` приймає лише `slug`) — barcode-каскад через
 *   Сільпо неможливий, `lookupSilpoBarcode` чесно повертає `null`.
 *
 * Every raw schema is `.passthrough()`; a product that doesn't parse is
 * DROPPED with a `logger.warn`, mirroring `receipts.ts`'s per-order
 * parsing. A search hit with zero macros is filtered out (see
 * `toSearchProduct`), matching the OFF/USDA `hasSomeMacro` convention.
 *
 * Metrics: `callMcpTool` → `mcpRpcCall` already calls
 * `recordExternalHttp("silpo", outcome, ms)` for every real HTTP attempt
 * (`apps/server/src/modules/silpo/mcpClient.ts`). Do NOT call
 * `recordExternalHttp` again here — that would double-count the same
 * `upstream="silpo"` series. The cheap DB guard below (`hasSilpoConnection`)
 * intentionally makes ZERO external calls for the common case (no
 * connection), so no external-http metric is expected there either.
 */

// ─────────────────────────── Cheap connection guard ─────────────────────────

/**
 * `SELECT 1 … LIMIT 1` — no decrypt, no MCP round-trip. Runs on every
 * food-search/barcode request from a user with `userId` set, so it MUST stay
 * cheap: food-search alone allows 40 req/min per caller (PERF-007). The full
 * `callWithFreshAccessToken` path (decrypt + `initialize` + `tools/call`)
 * only runs once this guard confirms a `connected` row exists.
 */
export async function hasSilpoConnection(
  userId: string,
  queryFn: QueryFn = defaultQuery,
): Promise<boolean> {
  const { rows } = await queryFn(
    `SELECT 1 FROM silpo_connection WHERE user_id = $1 AND status = 'connected' LIMIT 1`,
    [userId],
    { op: "silpo_food_source_connection_probe" },
  );
  return rows.length > 0;
}

/**
 * Combines the `SILPO_ENABLED` kill switch + "has a user at all" + the cheap
 * connection guard. Exported so route handlers can make a SINGLE guard call
 * to decide both "should I fan the Silpo source into the cascade" and
 * "should this specific response skip the shared public cache" (a
 * Silpo-augmented response is per-user and must never be served from a
 * CDN/browser cache to a different, unconnected caller).
 */
export async function isSilpoConnectedUser(
  userId: string | null | undefined,
  deps: { query?: QueryFn } = {},
): Promise<boolean> {
  if (!env.SILPO_ENABLED || !userId) return false;
  try {
    return await hasSilpoConnection(userId, deps.query ?? defaultQuery);
  } catch (err) {
    logger.warn({
      msg: "silpo_food_source_connection_probe_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ──────────────────────── Raw shapes (спайк §0, 2026-08-18) ─────────────────

/** Хіт `silpo_find_products_batch` → `queries[].products[]` — без КБЖВ. */
const RawCatalogHitSchema = z
  .object({
    name: z.string().optional(),
    slug: z.string().optional(),
    displayRatio: z.string().nullable().optional(), // "500г", "10 шт", "1,5л"
  })
  .passthrough();
type RawCatalogHit = z.infer<typeof RawCatalogHitSchema>;

const BatchEnvelopeSchema = z
  .object({
    queries: z
      .array(
        z.object({ products: z.array(z.unknown()).optional() }).passthrough(),
      )
      .optional(),
  })
  .passthrough();

/** `silpo_get_product_details` → `product` — КБЖВ в `attributes`. */
const RawProductDetailsSchema = z
  .object({
    name: z.string().optional(),
    displayRatio: z.string().nullable().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const DetailsEnvelopeSchema = z
  .object({ product: z.unknown().optional() })
  .passthrough();

// ─────────────── Attributes → macros (українські ключі, спайк §0) ───────────

function attrNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function findAttr(
  attributes: Record<string, unknown>,
  prefix: string,
): unknown {
  const key = Object.keys(attributes).find((k) => k.startsWith(prefix));
  return key === undefined ? undefined : attributes[key];
}

/** `"Енергетична цінність (кКал/кДЖ)": "119/492"` → 119. */
function parseKcal(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const firstPart = v.split("/")[0] ?? "";
  return attrNumber(firstPart);
}

/** `"500г"` / `"10 шт"` / `"1,5л"` → `{amount, unit}`. */
function parseDisplayRatio(
  displayRatio: string | null | undefined,
): { amount: number; unit: string } | null {
  if (!displayRatio) return null;
  const m = /^([\d.,]+)\s*(.*)$/.exec(displayRatio.trim());
  if (!m || !m[1]) return null;
  const amount = Number.parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  return { amount, unit: (m[2] ?? "").trim() };
}

// ─────────────────────────── Normalization (provisional) ────────────────────

const MASS_GRAM_UNITS = new Set(["г", "g", "гр", "грам", "грами", "грамів"]);
const MASS_KG_UNITS = new Set(["кг", "kg"]);

/**
 * `weight` можна трактувати як грами ЛИШЕ для масових юнітів. Silpo-каталог
 * повертає й обʼємні/штучні юніти ("мл", "л", "шт") — для них щільність
 * невідома, і пропустити `weight` у `servingGrams`/`defaultGrams` означало б
 * хибну масу порції в усіх макро-розрахунках (900 «мл» ≠ 900 г). Тому:
 * г-подібні юніти — як є; кг/kg — ×1000; відсутній юніт — оптимістично
 * трактуємо число як грами (найчастіший кейс фасованих продуктів); будь-який
 * інший юніт — `null`. Сирий `servingUnit` при цьому зберігається окремо для
 * дисплейного `servingSize`.
 */
function toServingGrams(
  weight: number | undefined,
  unit: string | undefined,
): number | null {
  if (weight === undefined || !Number.isFinite(weight)) return null;
  if (unit === undefined) return weight;
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  if (u === "" || MASS_GRAM_UNITS.has(u)) return weight;
  if (MASS_KG_UNITS.has(u)) return weight * 1000;
  return null;
}

/**
 * Порожня картка Сільпо виглядає як заповнена: атрибути присутні, але
 * нульові. Звірено на живому каталозі (2026-08-27): «Кускус з курячими
 * котлетками та лінивими огірками» (той самий товар, що в чеку тестерки)
 * віддає `0/2` ккал, білки `0.1`, жири `0`, вуглеводи `0`, тоді як піца,
 * борщ і чизкейк тієї ж категорії мають нормальні 238/53/356 ккал. Сама
 * лише наявність атрибутів (`hasMacro`) таку картку пропускає, і в
 * щоденник їде страва на 330 г з нулем калорій — тихо зіпсований денний
 * баланс, який людина побачить аж у підсумку і не звʼяже з цим товаром.
 *
 * ponytail: один поріг замість моделі «повноти картки». Нижче 5 ккал/100 г
 * легітимні лише вода/чай/спеції, яких у пошуку СТРАВИ не шукають (питна
 * вода має власний лічильник, `waterGoalMl`). Зʼявиться реальний
 * 0-калорійний продукт, який треба логувати — рахуй ненульові атрибути,
 * а не піднімай поріг.
 */
const MIN_SEARCH_KCAL_100G = 5;

/**
 * Atwater 4/9/4 — калорійність, коли Сільпо дав БЖВ, але не саме поле
 * енергетичної цінності. Той самий прийом, що `repairKcal` у
 * `scripts/seed-product-catalog.mjs`; без нього гейт нижче викидав би
 * картку, у якої КБЖВ насправді є.
 */
function atwaterKcal(
  protein: number | undefined,
  fat: number | undefined,
  carbs: number | undefined,
): number | null {
  if (protein === undefined && fat === undefined && carbs === undefined) {
    return null;
  }
  return 4 * (protein ?? 0) + 9 * (fat ?? 0) + 4 * (carbs ?? 0);
}

interface NormalizedSilpoProduct {
  name: string;
  brand: string | null;
  barcode: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  /** Сире число з упаковки (без конверсії) — лише для дисплейного `servingSize`. */
  servingAmount: number | null;
  /** Маса порції в грамах, або `null` коли юніт не масовий (див. `toServingGrams`). */
  servingGrams: number | null;
  servingUnit: string | null;
  hasMacro: boolean;
}

/**
 * Нормалізує `product` з `silpo_get_product_details`. Макро — з
 * `attributes` за українськими ключами-префіксами (спайк §0); значення на
 * упаковці Сільпо — стандартні per-100g. Порція — з `displayRatio`.
 */
function normalizeRawProduct(
  raw: z.infer<typeof RawProductDetailsSchema>,
): NormalizedSilpoProduct | null {
  const name = raw.name;
  if (!name) return null;

  const attributes = raw.attributes ?? {};
  const kcal = parseKcal(findAttr(attributes, "Енергетична цінність"));
  const protein = attrNumber(findAttr(attributes, "Білки"));
  const fat = attrNumber(findAttr(attributes, "Жири"));
  const carbs = attrNumber(findAttr(attributes, "Вуглеводи"));
  const brandAttr = findAttr(attributes, "Торгова марка");
  const ratio = parseDisplayRatio(raw.displayRatio);

  return {
    name,
    brand: typeof brandAttr === "string" ? brandAttr : null,
    barcode: null, // EAN відсутній у контракті Silpo MCP (спайк §0)
    // Не `kcal ?? atwater`: заявлений НУЛЬ так само підозрілий, як
    // відсутнє поле, а `??` пропускає лише null/undefined. Картка «0/0
    // ккал, білки 20» інакше відсіювалась би гейтом нижче, хоча КБЖВ у
    // неї справжні — рівно той клас битих карток, заради якого Atwater
    // сюди й додано.
    kcal_100g:
      kcal != null && kcal > 0 ? kcal : atwaterKcal(protein, fat, carbs),
    protein_100g: protein ?? null,
    fat_100g: fat ?? null,
    carbs_100g: carbs ?? null,
    servingAmount: ratio?.amount ?? null,
    servingGrams: toServingGrams(ratio?.amount, ratio?.unit),
    servingUnit: ratio?.unit ?? null,
    hasMacro:
      kcal !== undefined ||
      protein !== undefined ||
      fat !== undefined ||
      carbs !== undefined,
  };
}

/** Same deterministic-hash algorithm as `modules/nutrition/food-search.ts::stableId` — reimplemented locally to avoid a `silpo → nutrition` module dependency (nutrition already depends on `silpo`, not the other way around). */
function stableSilpoId(parts: Array<string | null | undefined>): string {
  const canonical = parts
    .map((p) => (p ? String(p).trim().toLowerCase() : ""))
    .join("|");
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash + canonical.charCodeAt(i)) | 0;
  }
  return `silpo_${(hash >>> 0).toString(36)}`;
}

// ─────────────────────────── Cascade output shapes ───────────────────────────

/** Structurally matches `FoodSearchProduct` (`@sergeant/shared/schemas`) once `"silpo"` is a valid `source` literal there. */
export interface SilpoSearchProduct {
  id: string;
  name: string;
  brand: string | null;
  source: "silpo";
  per100: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  defaultGrams: number;
}

/** Structurally matches `BarcodeProduct` (`@sergeant/shared/schemas`) once `"silpo"` is a valid `source` literal there. */
export interface SilpoBarcodeProduct {
  name: string;
  brand: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  fat_100g: number | null;
  carbs_100g: number | null;
  servingSize: string | null;
  servingGrams: number | null;
  source: "silpo";
  partial?: true;
}

/**
 * A search hit without USABLE calories is dropped — stricter than
 * `normalizeOFFSearch`/`normalizeUSDASearch`'s `hasSomeMacro` gate
 * (`apps/server/src/lib/normalizers/{off,usda}.ts`), because Silpo ships
 * attribute-complete but value-empty cards that gate cannot see (see
 * `MIN_SEARCH_KCAL_100G`). `FoodSearchProductSchema` has no `partial` escape
 * hatch (unlike barcode), so such a hit would otherwise lie as "0 kcal"
 * across the board.
 *
 * A PARTIAL hit (at least one macro present) IS emitted, with the missing
 * macro fields zero-filled (`?? 0`) — the same convention the OFF/USDA search
 * normalizers apply after their `hasSomeMacro` gate, and the only shape
 * `FoodSearchMacrosSchema` allows (`per100` is numeric-only, no nulls). So a
 * kcal-only product legitimately shows `protein/fat/carbs = 0` here, exactly
 * like it would coming from OFF or USDA.
 */
function toSearchProduct(p: NormalizedSilpoProduct): SilpoSearchProduct | null {
  // Гейт по КАЛОРІЙНОСТІ, а не по наявності атрибутів: нульова картка
  // проходить `hasMacro`, але в щоденнику бреше нулем — див.
  // `MIN_SEARCH_KCAL_100G`. `kcal_100g` тут уже включає Atwater-фолбек.
  if ((p.kcal_100g ?? 0) < MIN_SEARCH_KCAL_100G) return null;
  return {
    id: p.barcode
      ? `silpo_${p.barcode.replace(/^0+/, "") || "0"}`
      : stableSilpoId([p.name, p.brand]),
    name: p.name,
    brand: p.brand,
    source: "silpo",
    per100: {
      kcal: p.kcal_100g ?? 0,
      protein_g: p.protein_100g ?? 0,
      fat_g: p.fat_100g ?? 0,
      carbs_g: p.carbs_100g ?? 0,
    },
    defaultGrams: p.servingGrams ?? 100,
  };
}

/**
 * Unlike search, a barcode lookup always resolves to at most ONE product —
 * dropping a macro-less hit would just make the cascade re-fall-through to
 * "not found", which is worse than the UPCitemdb `partial: true` convention
 * (`apps/server/src/lib/normalizers/upcitemdb.ts`) this mirrors: return the
 * name/brand we DO have and let the client prompt for macros.
 */
function toBarcodeProduct(p: NormalizedSilpoProduct): SilpoBarcodeProduct {
  // Display string keeps the RAW amount + unit ("900 мл", "1 кг") — only the
  // numeric `servingGrams` field is unit-converted (see `toServingGrams`).
  const servingSize =
    p.servingAmount != null
      ? `${p.servingAmount}${p.servingUnit ? ` ${p.servingUnit}` : " г"}`
      : null;
  return {
    name: p.name,
    brand: p.brand,
    kcal_100g: p.kcal_100g,
    protein_100g: p.protein_100g,
    fat_100g: p.fat_100g,
    carbs_100g: p.carbs_100g,
    servingSize,
    servingGrams: p.servingGrams,
    source: "silpo",
    ...(p.hasMacro ? {} : { partial: true as const }),
  };
}

// ─────────────────────────────── MCP fetch step ─────────────────────────────

/**
 * КБЖВ немає в batch-хітах — лише в details (спайк §0), тому пошук
 * двофазний і details-збагачення обмежене топ-N хітів, щоб тримати
 * латентність typeahead у межах розумного (кожен `callMcpTool` — це
 * initialize + tools/call).
 */
const SEARCH_BATCH_LIMIT = 5;
const SEARCH_DETAILS_LIMIT = 3;

async function fetchProductDetails(
  accessToken: string,
  ctx: SilpoBranchContext,
  slug: string,
): Promise<NormalizedSilpoProduct | null> {
  const result = await callMcpTool({
    accessToken,
    toolName: "silpo_get_product_details",
    args: {
      branchId: ctx.branchId,
      slug,
      deliveryType: ctx.deliveryType,
      timeslotStart: ctx.timeslotStart,
      timeslotEnd: ctx.timeslotEnd,
    },
    schema: DetailsEnvelopeSchema,
  });
  if (!result.ok) {
    logger.warn({
      msg: "silpo_food_search_details_skipped",
      kind: result.error.kind,
    });
    return null;
  }
  const parsed = RawProductDetailsSchema.safeParse(result.data.product);
  if (!parsed.success) {
    logger.warn({
      msg: "silpo_food_search_details_unparseable",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    });
    return null;
  }
  return normalizeRawProduct(parsed.data);
}

function makeFetchSilpoSearch(
  userId: string,
  query: string,
): (accessToken: string) => Promise<McpResult<SilpoSearchProduct[]>> {
  return async (accessToken) => {
    const ctx = await resolveBranchContext(userId, accessToken);
    if (!ctx.ok) return ctx;

    const batch = await callMcpTool({
      accessToken,
      toolName: "silpo_find_products_batch",
      args: {
        branchId: ctx.data.branchId,
        deliveryType: ctx.data.deliveryType,
        timeslotStart: ctx.data.timeslotStart,
        timeslotEnd: ctx.data.timeslotEnd,
        products: [query],
        limit: SEARCH_BATCH_LIMIT,
      },
      schema: BatchEnvelopeSchema,
    });
    if (!batch.ok) return batch;

    const hits: RawCatalogHit[] = [];
    (batch.data.queries?.[0]?.products ?? []).forEach((raw, index) => {
      const parsed = RawCatalogHitSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn({
          msg: "silpo_food_search_raw_product_unparseable",
          index,
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            code: i.code,
          })),
        });
        return;
      }
      hits.push(parsed.data);
    });

    const withSlug = hits.filter((h): h is RawCatalogHit & { slug: string } =>
      Boolean(h.slug),
    );
    const detailed = await Promise.all(
      withSlug
        .slice(0, SEARCH_DETAILS_LIMIT)
        .map((h) => fetchProductDetails(accessToken, ctx.data, h.slug)),
    );

    const products = detailed
      .filter((p): p is NormalizedSilpoProduct => p !== null)
      .map(toSearchProduct)
      .filter((p): p is SilpoSearchProduct => p !== null);

    return { ok: true, data: products };
  };
}

// ────────────────────────────────── Orchestration ────────────────────────────

/**
 * `GET /api/food-search` — Silpo as the last cascade source, ONLY for a
 * connected `userId`. Never throws: any guard/MCP failure logs a
 * `logger.warn` and resolves to `[]`, exactly like the existing
 * `fetchOFF(...).catch(() => [])` / `fetchUSDA(...).catch(() => [])`
 * fallbacks in `modules/nutrition/food-search.ts`.
 */
export async function searchSilpoProducts(
  userId: string | null | undefined,
  query: string,
  deps: { query?: QueryFn } = {},
): Promise<SilpoSearchProduct[]> {
  try {
    if (!userId) return [];
    if (!(await isSilpoConnectedUser(userId, deps))) return [];

    const call = await callWithFreshAccessToken(
      userId,
      makeFetchSilpoSearch(userId, query),
      { query: deps.query ?? defaultQuery },
    );
    if (!call.ok) {
      logger.warn({
        msg: "silpo_food_search_source_skipped",
        kind: call.error.kind,
      });
      return [];
    }
    return call.data;
  } catch (err) {
    logger.warn({
      msg: "silpo_food_search_source_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * `GET /api/barcode` — СВІДОМО завжди `null`. Спайк §0 (2026-08-18)
 * показав, що Silpo MCP ніде не оперує EAN: `silpo_get_product_details`
 * приймає лише `slug`, а числовий пошук у `silpo_find_products_batch`
 * матчить внутрішні артикули (`externalProductId`/`lagerId`), не штрихкоди.
 * Сигнатура збережена, щоб каскад `modules/nutrition/barcode.ts` не
 * перебудовувався: Silpo просто ніколи не контрибʼютить у barcode-шлях.
 * Якщо Сільпо колись додасть EAN-lookup — реалізувати тут, каскад готовий.
 */
export async function lookupSilpoBarcode(
  _userId: string | null | undefined,
  _barcode: string,
  _deps: { query?: QueryFn } = {},
): Promise<SilpoBarcodeProduct | null> {
  return null;
}

// Re-exported for tests exercising internals without a live MCP call.
export const __test__ = {
  toServingGrams,
  normalizeRawProduct,
  toSearchProduct,
  toBarcodeProduct,
  attrNumber,
  parseKcal,
  parseDisplayRatio,
};
