import type { Request, Response } from "express";
import {
  FoodSearchSuccessSchema,
  type FoodSearchProduct,
} from "@sergeant/shared/schemas";
import { FoodSearchQuerySchema } from "../../http/schemas.js";
import { validateQuery } from "../../http/validate.js";
import {
  normalizeOFFSearch,
  normalizeUSDASearch,
  type OFFSearchProduct,
  type USDASearchFood,
} from "../../lib/normalizers/index.js";

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

// SSOT for the `/api/food-search` response shape lives in
// `@sergeant/shared/schemas/nutrition` (AGENTS.md Hard Rule #3).
// Server derives its normalised row type via `z.infer<>` and asserts
// the outgoing payload against `FoodSearchSuccessSchema` before
// `res.json(...)` so drift from the api-client types surfaces at
// test time.
type NormalizedSearchProduct = FoodSearchProduct;

function hasErrorName(e: unknown, name: string): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === name;
}

// Перший токен запиту → англійський еквівалент для USDA / OFF-en пошуку
const UK_TO_EN: Record<string, string> = {
  груша: "pear",
  яблуко: "apple",
  банан: "banana",
  апельсин: "orange",
  лимон: "lemon",
  ківі: "kiwi",
  манго: "mango",
  персик: "peach",
  слива: "plum",
  вишня: "cherry",
  черешня: "cherry",
  полуниця: "strawberry",
  суниця: "strawberry",
  малина: "raspberry",
  чорниця: "blueberry",
  виноград: "grapes",
  гарбуз: "pumpkin",
  кабачок: "zucchini",
  баклажан: "eggplant",
  помідор: "tomato",
  томат: "tomato",
  огірок: "cucumber",
  морква: "carrot",
  цибуля: "onion",
  часник: "garlic",
  картопля: "potato",
  броколі: "broccoli",
  шпинат: "spinach",
  капуста: "cabbage",
  буряк: "beet",
  гриби: "mushrooms",
  шампіньони: "mushrooms",
  авокадо: "avocado",
  курка: "chicken",
  яловичина: "beef",
  свинина: "pork",
  лосось: "salmon",
  тунець: "tuna",
  яйце: "egg",
  молоко: "milk",
  сир: "cheese",
  йогурт: "yogurt",
  масло: "butter",
  рис: "rice",
  гречка: "buckwheat",
  вівсянка: "oatmeal",
  макарони: "pasta",
  хліб: "bread",
  мед: "honey",
  горіх: "nuts",
  арахіс: "peanut",
  мигдаль: "almond",
  кава: "coffee",
  чай: "tea",
  сочевиця: "lentils",
  квасоля: "beans",
  нут: "chickpeas",
  тофу: "tofu",
  ананас: "pineapple",
  диня: "melon",
  кавун: "watermelon",
  абрикос: "apricot",
  мандарин: "tangerine",
  грейпфрут: "grapefruit",
  родзинки: "raisins",
  чорнослив: "prunes",
  курага: "dried apricot",
  гарбузове: "pumpkin",
  цвітна: "cauliflower",
  селера: "celery",
  петрушка: "parsley",
  кріп: "dill",
  редиска: "radish",
  горошок: "peas",
  кукурудза: "corn",
  спаржа: "asparagus",
  гречане: "buckwheat",
  вівсяне: "oatmeal",
  пшениця: "wheat",
  кефір: "kefir",
  сметана: "sour cream",
  вершки: "cream",
  яловичий: "beef",
  курячий: "chicken",
  свинячий: "pork",
  рибний: "fish",
  оселедець: "herring",
  скумбрія: "mackerel",
  тріска: "cod",
  форель: "trout",
  короп: "carp",
};

// Точний або prefix-match (напр. "груш" → "груша" → "pear")
function translateFirstToken(query: string): string | null {
  const token = query.trim().toLowerCase().split(/\s+/)[0];
  if (!token || token.length < 2) return null;
  if (UK_TO_EN[token]) return UK_TO_EN[token];
  if (token.length >= 3) {
    for (const [key, val] of Object.entries(UK_TO_EN)) {
      if (key.startsWith(token)) return val;
    }
  }
  return null;
}

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
      "User-Agent":
        "Sergeant-NutritionApp/1.0 (https://sergeant.2dmanager.com.ua)",
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
  const apiKey = process.env.USDA_API_KEY || "DEMO_KEY";
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
 * GET /api/food-search?q=… — каскадний пошук через Open Food Facts + USDA.
 * CORS і rate-limit виставляє роутер.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = validateQuery(FoodSearchQuerySchema, req, res);
  if (!parsed.ok) return;
  const { q: query, limit } = parsed.data;

  const signal = AbortSignal.timeout(8000);

  try {
    const enTerm = translateFirstToken(query);

    const [ukOff, enOff, usdaRaw] = await Promise.all([
      fetchOFF(query, "uk", signal).catch((): OFFSearchProduct[] => []),
      enTerm
        ? fetchOFF(enTerm, "en", signal).catch((): OFFSearchProduct[] => [])
        : Promise.resolve<OFFSearchProduct[]>([]),
      enTerm
        ? fetchUSDA(enTerm, signal).catch((): USDASearchFood[] => [])
        : Promise.resolve<USDASearchFood[]>([]),
    ]);

    const offProducts = [...ukOff, ...enOff]
      .map((p) => normalizeOFFProduct(p))
      .filter((p): p is NormalizedSearchProduct => p != null);

    const usdaProducts = usdaRaw
      .map((p) => normalizeUSDAProduct(p))
      .filter((p): p is NormalizedSearchProduct => p != null);

    // OFF (з українськими назвами) йде першим, USDA — як fallback
    const allProducts: NormalizedSearchProduct[] = [
      ...offProducts,
      ...usdaProducts,
    ];

    const qTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);
    const enTokens = enTerm ? enTerm.toLowerCase().split(/\s+/) : [];
    const allTokens = [...qTokens, ...enTokens];

    const seen = new Set<string>();
    const products = allProducts
      .filter((p) => {
        const key = `${(p.name || "").toLowerCase()}|${(p.brand || "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        if (!allTokens.length) return true;
        const n = (p.name || "").toLowerCase();
        return allTokens.some((t) => n.includes(t));
      })
      .slice(0, limit);

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
