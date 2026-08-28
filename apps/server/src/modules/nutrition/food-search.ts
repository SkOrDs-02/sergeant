import type { Request, Response } from "express";
import {
  FoodSearchSuccessSchema,
  type FoodSearchProduct,
} from "@sergeant/shared/schemas";
import { env } from "../../env.js";
import { FoodSearchQuerySchema } from "../../http/schemas.js";
import { parseQuery } from "../../http/validate.js";
import { getSessionUser } from "../../auth.js";
import {
  normalizeOFFSearch,
  normalizeUSDASearch,
  translateFirstToken,
  type OFFSearchProduct,
  type USDASearchFood,
} from "../../lib/normalizers/index.js";
import {
  isSilpoConnectedUser,
  searchSilpoProducts,
  type SilpoSearchProduct,
} from "../silpo/foodSource.js";
import { NUTRITION_AI_TIMEOUTS_MS } from "./timeouts.js";
import { logger } from "../../obs/logger.js";
import { searchCatalog } from "./productCatalog.js";
import { searchGenericFoods } from "./genericFoods.js";

/**
 * Best-effort session peek. `/api/food-search` is deliberately session-less
 * (open, cached, PERF-007 typeahead) — this must NEVER turn it into an
 * auth-gated route. `getSessionUser` throws on a lookup failure (see its
 * docstring in `auth.ts`); catching here keeps that failure mode identical
 * to "no session" instead of a 500 on an endpoint that never required auth.
 */
async function resolveOptionalUserId(req: Request): Promise<string | null> {
  try {
    const user = await getSessionUser(req);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

const OFF_SEARCH = "https://world.openfoodfacts.org/api/v2/search";
const OFF_FIELDS =
  "code,product_name,product_name_uk,brands,nutriments,serving_quantity";
const USDA_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search";

// Deterministic fallback id based on product content — used when the upstream
// record has no stable code (OFF `code` / USDA `fdcId`). Avoids embedding
// request-time `Date.now()` into search-result ids, which would cause React
// to churn keys and break any client-side dedup/caching across searches.
export function stableId(
  prefix: string,
  parts: Array<string | null | undefined>,
) {
  const canonical = parts
    .map((p) => (p ? String(p).trim().toLowerCase() : ""))
    .join("|");
  let hash = 0;
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash + canonical.charCodeAt(i)) | 0;
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

export function hasErrorName(e: unknown, name: string): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === name;
}

// SSOT for the `/api/food-search` response shape lives in
// `@sergeant/shared/schemas/nutrition` (AGENTS.md Hard Rule #3).
// Server derives its normalised row type via `z.infer<>` and asserts
// the outgoing payload against `FoodSearchSuccessSchema` before
// `res.json(...)` so drift from the api-client types surfaces at
// test time.
type NormalizedSearchProduct = FoodSearchProduct;

export function normalizeOFFProduct(
  product: OFFSearchProduct | null | undefined,
): NormalizedSearchProduct | null {
  return normalizeOFFSearch(product, stableId);
}

// USDA nutrient IDs: 1008=Energy(kcal), 1003=Protein, 1004=Fat, 1005=Carbs
export function normalizeUSDAProduct(
  food: USDASearchFood | null | undefined,
): NormalizedSearchProduct | null {
  return normalizeUSDASearch(food, stableId);
}

async function fetchOFF(
  searchTerms: string,
  lc: string,
  signal: AbortSignal,
): Promise<OFFSearchProduct[]> {
  const url = new URL(OFF_SEARCH);
  url.searchParams.set("search_terms", searchTerms);
  url.searchParams.set("page_size", "20");
  url.searchParams.set("fields", OFF_FIELDS);
  url.searchParams.set("sort_by", "unique_scans_n");
  url.searchParams.set("lc", lc);
  url.searchParams.set("cc", "ua");

  const r = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Sergeant-NutritionApp/1.0 (https://sergeant.com.ua)",
    },
    signal,
  });
  if (!r.ok) return [];
  const data = (await r.json()) as { products?: OFFSearchProduct[] };
  return data?.products || [];
}

async function fetchUSDA(
  query: string,
  signal: AbortSignal,
): Promise<USDASearchFood[]> {
  const apiKey =
    process.env["USDA_FDC_API_KEY"] ||
    process.env["USDA_API_KEY"] ||
    "DEMO_KEY";
  const url = new URL(USDA_SEARCH);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "10");
  url.searchParams.set("dataType", "Foundation,SR Legacy");
  url.searchParams.set("api_key", apiKey);

  const r = await fetch(url.toString(), { signal });
  if (!r.ok) return [];
  const data = (await r.json()) as { foods?: USDASearchFood[] };
  return data?.foods || [];
}

/**
 * GET /api/food-search?q=… — каскадний пошук через Open Food Facts + USDA
 * (+ Silpo як четверте джерело, лише для юзера зі звʼязаним акаунтом —
 * `modules/silpo/foodSource.ts`). CORS і rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const { q: query, limit } = parseQuery(FoodSearchQuerySchema, req);

  const signal = AbortSignal.timeout(NUTRITION_AI_TIMEOUTS_MS.foodSearch);

  // ── Tier-1: власні джерела ────────────────────────────────────────────────
  //
  // Той самий ярус, що й у lookup-у штрихкодів, з однією відмінністю: тут
  // hit НЕ завжди зупиняє каскад. Скан штрихкоду має рівно одну правильну
  // відповідь, а пошук — тим кращий, чим більше релевантних варіантів.
  // Тому назовні не йдемо лише тоді, коли своїх результатів уже повний
  // ліміт: це і є найчастіший випадок («молоко», «хліб», «яйця»), і саме
  // там економія квоти має значення.
  //
  // Помилка БД не фатальна, як і в штрихкодах: власні джерела
  // прискорюють, а не замінюють зовнішні.
  //
  // Два власні джерела питаємо паралельно — вони незалежні й обидва
  // локальні. `generic_foods` (базова їжа без штрихкоду) навмисно перед
  // каталогом у видачі: на запит «огірок» людина хоче овоч, а не
  // «Огірки консервовані Верес» — брендована картка релевантна тоді,
  // коли її шукають назвою бренду, і тоді вона й так підніметься.
  const [genericProducts, catalogProducts] = await Promise.all([
    searchGenericFoods(query, limit).catch(
      (e: unknown): NormalizedSearchProduct[] => {
        logger.warn(
          { err: e instanceof Error ? e.message : String(e) },
          "generic_foods search failed",
        );
        return [];
      },
    ),
    searchCatalog(query, limit).catch(
      (e: unknown): NormalizedSearchProduct[] => {
        logger.warn(
          { err: e instanceof Error ? e.message : String(e) },
          "product_catalog search failed, falling through to upstreams",
        );
        return [];
      },
    ),
  ]);

  const ownSeen = new Set<string>();
  const ownProducts = [...genericProducts, ...catalogProducts].filter((p) => {
    const key = `${p.name.toLowerCase()}|${(p.brand ?? "").toLowerCase()}`;
    if (ownSeen.has(key)) return false;
    ownSeen.add(key);
    return true;
  });

  if (ownProducts.length >= limit) {
    res.status(200).json(
      FoodSearchSuccessSchema.parse({
        products: ownProducts.slice(0, limit),
      }),
    );
    return;
  }

  try {
    const enTerm = translateFirstToken(query);
    // Cheap guard (single indexed SELECT, zero cost for the anonymous
    // majority) decides both whether to fan the Silpo source into the
    // cascade below AND whether this response may hit the shared public
    // cache (see the `Cache-Control` override near the end of this
    // handler) — a Silpo-augmented response is per-user and must never be
    // served from a CDN/browser cache to a different caller. Gated on the
    // kill switch FIRST: with `SILPO_ENABLED` off (the default) this
    // session-less endpoint must not pay a per-request session lookup for a
    // source that can never activate.
    const userId = env.SILPO_ENABLED ? await resolveOptionalUserId(req) : null;
    const silpoConnected = userId ? await isSilpoConnectedUser(userId) : false;

    const [ukOff, enOff, usdaRaw, silpoProducts] = await Promise.all([
      fetchOFF(query, "uk", signal).catch((): OFFSearchProduct[] => []),
      enTerm
        ? fetchOFF(enTerm, "en", signal).catch((): OFFSearchProduct[] => [])
        : Promise.resolve<OFFSearchProduct[]>([]),
      enTerm
        ? fetchUSDA(enTerm, signal).catch((): USDASearchFood[] => [])
        : Promise.resolve<USDASearchFood[]>([]),
      // Uses the original (Ukrainian) query, not `enTerm` — Silpo's catalog
      // is a Ukrainian retailer, mirroring the OFF `uk` branch above.
      // `searchSilpoProducts` never throws (see its docstring); `.catch` is
      // defense-in-depth so a bug there can never break this cascade.
      silpoConnected
        ? searchSilpoProducts(userId, query).catch(
            (): SilpoSearchProduct[] => [],
          )
        : Promise.resolve<SilpoSearchProduct[]>([]),
    ]);

    const offProducts = [...ukOff, ...enOff]
      .map((p) => normalizeOFFProduct(p))
      .filter((p): p is NormalizedSearchProduct => p != null);

    const usdaProducts = usdaRaw
      .map((p) => normalizeUSDAProduct(p))
      .filter((p): p is NormalizedSearchProduct => p != null);

    // OFF (з українськими назвами) йде першим, USDA — як fallback, Silpo —
    // останнє джерело, вже нормалізоване у `searchSilpoProducts`
    // (структурно == `FoodSearchProduct`). Silpo лишається в UPSTREAM, а не
    // серед власних джерел: попри те, що пошук відпрацював на боці Сільпо,
    // це зовнішній каталог без наших воріт Атвотера, тож токен-фільтр нижче
    // для нього — потрібний захист від шуму, а не втрата влучних збігів.
    const upstreamProducts: NormalizedSearchProduct[] = [
      ...offProducts,
      ...usdaProducts,
      ...silpoProducts,
    ];

    const qTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    const enTokens = enTerm ? enTerm.toLowerCase().split(/\s+/) : [];
    const allTokens = [...qTokens, ...enTokens];

    const seen = new Set<string>();
    const keyOf = (p: NormalizedSearchProduct) =>
      `${(p.name || "").toLowerCase()}|${(p.brand || "").toLowerCase()}`;

    // AI-CONTEXT: токен-фільтр застосовується ЛИШЕ до upstream-результатів.
    // Власні джерела вже відібрали релевантне в самій БД, причому кількома
    // каналами — підрядком, синонімом і trigram-схожістю. Прогнати їх через
    // `includes(token)` означало б викинути саме те, заради чого ці канали
    // й потрібні: на запит «малоко» каталог знаходить «Молоко…», а на
    // «помідор» базова їжа знаходить «Томат» — буквального токена запиту
    // в назві немає в обох випадках, і фільтр мовчки зʼїв би влучний
    // результат.
    const ownFirst = ownProducts.filter((p) => {
      const key = keyOf(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const upstreamFiltered = upstreamProducts.filter((p) => {
      const key = keyOf(p);
      if (seen.has(key)) return false;
      seen.add(key);
      if (!allTokens.length) return true;
      const n = (p.name || "").toLowerCase();
      return allTokens.some((t) => n.includes(t));
    });

    // Каталог попереду: це вже перевірені воротами Атвотера картки, тоді
    // як upstream віддає сире.
    const products = [...ownFirst, ...upstreamFiltered].slice(0, limit);

    if (silpoConnected) {
      // Overrides the router's `stale-while-revalidate, public` header
      // (PERF-007) — a Silpo-augmented response reflects THIS user's
      // linked account and must not be reused for anyone else's identical
      // query via a shared/CDN cache.
      res.setHeader(
        "Cache-Control",
        "private, no-store, no-cache, must-revalidate",
      );
    }
    res.status(200).json(FoodSearchSuccessSchema.parse({ products }));
  } catch (e: unknown) {
    if (hasErrorName(e, "TimeoutError") || hasErrorName(e, "AbortError")) {
      res
        .status(504)
        .json({ error: "Сервіс недоступний (таймаут). Спробуй пізніше." });
      return;
    }
    const message = e instanceof Error ? e.message : "Server error";
    res.status(500).json({ error: message });
  }
}
