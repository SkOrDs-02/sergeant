import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response as ExpressResponse } from "express";
import type { FoodSearchProduct } from "@sergeant/shared/schemas";

/**
 * Каталог (Tier-1) мокається на рівні модуля: ці тести перевіряють
 * ПОШУКОВИЙ каскад, а не доступ до Postgres. Дефолт — порожньо, тобто
 * рівно та поведінка, що була до появи ярусу, тож наявні сценарії
 * читаються без змін.
 */
const searchCatalogMock = vi.hoisted(() =>
  vi.fn<(q: string, limit: number) => Promise<FoodSearchProduct[]>>(
    async () => [],
  ),
);
vi.mock("./productCatalog.js", () => ({
  searchCatalog: searchCatalogMock,
  lookupInCatalog: vi.fn(async () => null),
  upsertIntoCatalog: vi.fn(async () => undefined),
}));

/** Базова їжа без штрихкоду — те саме, окремим джерелом. */
const searchGenericFoodsMock = vi.hoisted(() =>
  vi.fn<(q: string, limit: number) => Promise<FoodSearchProduct[]>>(
    async () => [],
  ),
);
vi.mock("./genericFoods.js", () => ({
  searchGenericFoods: searchGenericFoodsMock,
  seedGenericFoods: vi.fn(async () => 0),
}));

import {
  stableId,
  hasErrorName,
  normalizeOFFProduct,
  normalizeUSDAProduct,
} from "./food-search.js";
import handler from "./food-search.js";
import { FoodSearchSuccessSchema } from "@sergeant/shared/schemas";

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function mockRes(): TestRes & ExpressResponse {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & ExpressResponse;
}

function asReq(query: Record<string, string>): Request {
  return { query } as unknown as Request;
}

function jsonResponse(ok: boolean, body: unknown, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function products(body: unknown): Array<Record<string, unknown>> {
  return asRecord(body)["products"] as Array<Record<string, unknown>>;
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  vi.unstubAllEnvs();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("stableId", () => {
  it("is deterministic across calls with identical input", () => {
    const a = stableId("off", ["Молоко", "Галичина"]);
    const b = stableId("off", ["Молоко", "Галичина"]);
    expect(a).toBe(b);
    expect(a.startsWith("off_")).toBe(true);
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(stableId("usda", ["  Apple  ", null])).toBe(
      stableId("usda", ["apple", undefined]),
    );
  });

  it("differentiates inputs that only differ by order", () => {
    expect(stableId("off", ["a", "b"])).not.toBe(stableId("off", ["b", "a"]));
  });

  it("returns a short, url-safe suffix", () => {
    const id = stableId("off", ["Name", "Brand"]);
    expect(id).toMatch(/^off_[0-9a-z]+$/);
  });
});

describe("hasErrorName", () => {
  it("matches object errors by name and rejects non-objects", () => {
    expect(hasErrorName({ name: "TimeoutError" }, "TimeoutError")).toBe(true);
    expect(hasErrorName({ name: "AbortError" }, "TimeoutError")).toBe(false);
    expect(hasErrorName(null, "TimeoutError")).toBe(false);
    expect(hasErrorName("TimeoutError", "TimeoutError")).toBe(false);
  });
});

describe("normalizeOFFProduct", () => {
  const nutriments = {
    "energy-kcal_100g": 250,
    proteins_100g: 3.2,
    fat_100g: 1.1,
    carbohydrates_100g: 52,
  };

  it("uses the OFF `code` (barcode) as the id when present", () => {
    const result = normalizeOFFProduct({
      code: "3017620422003",
      product_name: "Nutella",
      brands: "Ferrero",
      nutriments,
    });
    expect(result).not.toBeNull();
    expect(result!.id).toBe("off_3017620422003");
  });

  it("strips leading zeros from numeric codes but keeps a single 0", () => {
    expect(
      normalizeOFFProduct({
        code: "000012345",
        product_name: "Something",
        nutriments,
      })!.id,
    ).toBe("off_12345");
    expect(
      normalizeOFFProduct({
        code: "0000",
        product_name: "Zeroed",
        nutriments,
      })!.id,
    ).toBe("off_0");
  });

  it("falls back to a deterministic stable id when `code` is missing", () => {
    // Regression for the unstable-id bug: two calls with the same payload
    // and no `code` must produce the same id (previously was a Date.now()
    // suffix and churned across requests).
    const payload = {
      product_name_uk: "Молоко",
      brands: "Галичина",
      nutriments,
    };
    const a = normalizeOFFProduct(payload);
    const b = normalizeOFFProduct(payload);
    expect(a!.id).toBe(b!.id);
    expect(a!.id).toMatch(/^off_[0-9a-z]+$/);
  });

  it("prefers the Ukrainian localized name when provided", () => {
    const p = normalizeOFFProduct({
      product_name: "Milk",
      product_name_uk: "Молоко",
      nutriments,
    });
    expect(p!.name).toBe("Молоко");
  });

  it("accepts Latin product_name containing digits and punctuation", () => {
    // The simplified regex relies on \u0020-\u024F covering ASCII digits and
    // common punctuation. Make sure that's actually true at runtime.
    const p = normalizeOFFProduct({
      product_name: "Greek Yogurt 2.5% (500 g)",
      nutriments,
    });
    expect(p?.name).toBe("Greek Yogurt 2.5% (500 g)");
  });

  it("rejects product_name with control characters / disallowed ranges", () => {
    const p = normalizeOFFProduct({
      product_name: "bad\u0000name",
      nutriments,
    });
    expect(p).toBeNull();
  });

  it("returns null when every macro is missing", () => {
    const p = normalizeOFFProduct({
      product_name: "Mystery",
      nutriments: {},
    });
    expect(p).toBeNull();
  });

  it("rounds macros to 1 decimal place and fills missing values with 0", () => {
    const p = normalizeOFFProduct({
      product_name: "X",
      nutriments: { "energy-kcal_100g": 99.87 },
    });
    expect(p!.per100.kcal).toBe(99.9);
    expect(p!.per100.protein_g).toBe(0);
  });

  it("takes only the first brand from a comma-separated list", () => {
    const p = normalizeOFFProduct({
      product_name: "X",
      brands: "Alpha, Beta, Gamma",
      nutriments,
    });
    expect(p!.brand).toBe("Alpha");
  });

  it("defaults defaultGrams to 100 when serving_quantity is absent", () => {
    expect(
      normalizeOFFProduct({
        product_name: "X",
        nutriments,
      })!.defaultGrams,
    ).toBe(100);
  });
});

describe("normalizeUSDAProduct", () => {
  const nutrients = [
    { nutrientId: 1008, value: 64 },
    { nutrientId: 1003, value: 3.4 },
    { nutrientId: 1004, value: 3.6 },
    { nutrientId: 1005, value: 4.8 },
  ];

  it("uses fdcId as the id when present", () => {
    const p = normalizeUSDAProduct({
      fdcId: 170290,
      description: "Milk, whole",
      foodNutrients: nutrients,
    });
    expect(p!.id).toBe("usda_170290");
  });

  it("falls back to a deterministic id when fdcId is missing", () => {
    const payload = { description: "Custom food", foodNutrients: nutrients };
    expect(normalizeUSDAProduct(payload)!.id).toBe(
      normalizeUSDAProduct(payload)!.id,
    );
  });

  it("returns null when description is empty", () => {
    expect(
      normalizeUSDAProduct({ description: "", foodNutrients: nutrients }),
    ).toBeNull();
  });

  it("returns null when every nutrient is missing", () => {
    expect(
      normalizeUSDAProduct({ description: "X", foodNutrients: [] }),
    ).toBeNull();
  });

  it("maps the four tracked nutrient ids (1008/1003/1004/1005)", () => {
    const p = normalizeUSDAProduct({
      fdcId: 1,
      description: "X",
      foodNutrients: nutrients,
    });
    expect(p!.per100).toEqual({
      kcal: 64,
      protein_g: 3.4,
      fat_g: 3.6,
      carbs_g: 4.8,
    });
  });
});

describe("food-search handler", () => {
  const offPear = {
    code: "000987",
    product_name_uk: "Груша",
    product_name: "Pear",
    brands: "Садочок",
    nutriments: {
      "energy-kcal_100g": 57,
      proteins_100g: 0.4,
      fat_100g: 0.1,
      carbohydrates_100g: 15.2,
    },
  };

  const offEnglishPear = {
    product_name: "Pear snack",
    brands: "Garden",
    nutriments: {
      "energy-kcal_100g": 82,
      proteins_100g: 1,
      fat_100g: 0.2,
      carbohydrates_100g: 20,
    },
  };

  const usdaPear = {
    fdcId: 9252,
    description: "Pears, raw",
    foodNutrients: [
      { nutrientId: 1008, value: 57 },
      { nutrientId: 1003, value: 0.4 },
      { nutrientId: 1004, value: 0.1 },
      { nutrientId: 1005, value: 15.2 },
    ],
  };

  it("queries Ukrainian OFF, translated English OFF, and USDA, then limits results", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [offPear] }))
      .mockResolvedValueOnce(jsonResponse(true, { products: [offEnglishPear] }))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [usdaPear] }));

    const res = mockRes();
    await handler(asReq({ q: "груша", limit: "2" }), res);

    expect(res.statusCode).toBe(200);
    expect(products(res.body)).toHaveLength(2);
    expect(products(res.body).map((p) => p["source"])).toEqual(["off", "off"]);
    expect(products(res.body)[0]).toMatchObject({
      id: "off_987",
      name: "Груша",
      brand: "Садочок",
      defaultGrams: 100,
    });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("search_terms=%D0%B3%D1%80%D1%83%D1%88%D0%B0");
    expect(urls[0]).toContain("lc=uk");
    expect(urls[1]).toContain("search_terms=pear");
    expect(urls[1]).toContain("lc=en");
    expect(urls[2]).toContain("query=pear");
    expect(urls[2]).toContain("pageSize=10");
    expect(urls[2]).toContain("api_key=DEMO_KEY");
  });

  it("uses USDA_API_KEY and returns USDA fallback results when OFF is empty", async () => {
    vi.stubEnv("USDA_API_KEY", "test-usda-key");
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(false, {}))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [usdaPear] }));

    const res = mockRes();
    await handler(asReq({ q: "груш", limit: "5" }), res);

    expect(res.statusCode).toBe(200);
    expect(products(res.body)).toEqual([
      expect.objectContaining({
        id: "usda_9252",
        name: "Pears, raw",
        source: "usda",
        per100: {
          kcal: 57,
          protein_g: 0.4,
          fat_g: 0.1,
          carbs_g: 15.2,
        },
      }),
    ]);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      "api_key=test-usda-key",
    );
  });

  it("prefers USDA_FDC_API_KEY over the legacy USDA_API_KEY env var", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "fdc-key");
    vi.stubEnv("USDA_API_KEY", "legacy-key");
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [usdaPear] }));

    const res = mockRes();
    await handler(asReq({ q: "груша", limit: "5" }), res);

    expect(res.statusCode).toBe(200);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("api_key=fdc-key");
    expect(String(fetchMock.mock.calls[2]?.[0])).not.toContain("legacy-key");
  });

  it("deduplicates by normalized name and brand before applying limit", async () => {
    const duplicate = {
      ...offPear,
      code: "123",
      product_name_uk: "Груша",
      product_name: "Pear duplicate",
    };
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [offPear] }))
      .mockResolvedValueOnce(jsonResponse(true, { products: [duplicate] }))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [usdaPear] }));

    const res = mockRes();
    await handler(asReq({ q: "груша", limit: "10" }), res);

    expect(products(res.body).map((p) => p["id"])).toEqual([
      "off_987",
      "usda_9252",
    ]);
  });

  it("throws ValidationError before calling upstreams", async () => {
    await expect(
      handler(asReq({ q: "x", limit: "3" }), mockRes()),
    ).rejects.toMatchObject({ name: "ValidationError" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("tolerates upstream fetch failures and returns an empty list", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockRejectedValueOnce(new Error("OFF unavailable"))
      .mockRejectedValueOnce(new Error("OFF-en unavailable"))
      .mockRejectedValueOnce(new Error("USDA unavailable"));

    const res = mockRes();
    await handler(asReq({ q: "груша", limit: "3" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ products: [] });
  });

  it("returns 504 when response validation is interrupted by an abort-like error", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [offPear] }))
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [] }));
    vi.spyOn(FoodSearchSuccessSchema, "parse").mockImplementationOnce(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });

    const res = mockRes();
    await handler(asReq({ q: "груша", limit: "3" }), res);

    expect(res.statusCode).toBe(504);
    expect(res.body).toMatchObject({
      error: expect.stringMatching(/таймаут/i),
    });
  });

  it("returns 500 when response validation throws a generic error", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [offPear] }))
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [] }));
    vi.spyOn(FoodSearchSuccessSchema, "parse").mockImplementationOnce(() => {
      throw new Error("schema drift");
    });

    const res = mockRes();
    await handler(asReq({ q: "груша", limit: "3" }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "schema drift" });
  });

  it("skips English fallback sources when the query is not translatable", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(true, {
        products: [
          {
            product_name: "zz crackers",
            nutriments: { "energy-kcal_100g": 120 },
          },
        ],
      }),
    );

    const res = mockRes();
    await handler(asReq({ q: "zz", limit: "3" }), res);

    expect(res.statusCode).toBe(200);
    expect(products(res.body)).toEqual([
      expect.objectContaining({
        name: "zz crackers",
        source: "off",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("lc=uk");
  });

  // ── PR F: contract shape validation (Hard Rule #3) ──────────────────────
  // Response shape must match FoodSearchSuccessSchema (api-client source of truth).

  it("response body satisfies FoodSearchSuccessSchema contract (PR F)", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(true, {
          products: [
            {
              code: "4820000000001",
              product_name_uk: "Молоко",
              brands: "Галичина",
              nutriments: {
                "energy-kcal_100g": 60,
                proteins_100g: 3.2,
                fat_100g: 3.5,
                carbohydrates_100g: 4.7,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [] }));

    const res = mockRes();
    await handler(asReq({ q: "молоко", limit: "5" }), res);

    expect(res.statusCode).toBe(200);
    // Validates the actual runtime shape against the shared schema — catches
    // any server-side drift before it reaches the api-client types.
    const parsed = FoodSearchSuccessSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);

    const p = products(res.body)[0];
    expect(p).toBeDefined();
    // All required fields present with correct types:
    expect(typeof p!["id"]).toBe("string");
    expect(typeof p!["name"]).toBe("string");
    expect(["string", "object"].includes(typeof p!["brand"])).toBe(true); // string | null
    expect(p!["source"]).toMatch(/^(off|usda)$/);
    expect(typeof p!["defaultGrams"]).toBe("number");
    const per100 = p!["per100"] as Record<string, unknown>;
    expect(typeof per100["kcal"]).toBe("number");
    expect(typeof per100["protein_g"]).toBe("number");
    expect(typeof per100["fat_g"]).toBe("number");
    expect(typeof per100["carbs_g"]).toBe("number");
  });

  it("empty upstream results → {products:[]} satisfies FoodSearchSuccessSchema", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(true, { products: [] }))
      .mockResolvedValueOnce(jsonResponse(true, { foods: [] }));

    const res = mockRes();
    await handler(asReq({ q: "груша", limit: "5" }), res);

    const parsed = FoodSearchSuccessSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    expect(products(res.body)).toHaveLength(0);
  });

  // ── UK_TO_EN translation coverage via handler behaviour ──────────────────
  // Tests that key Ukrainian query tokens are translated to English
  // so that OFF-en and USDA are actually queried.

  it("translates Cyrillic prefix 'молок' → 'milk' (prefix match)", async () => {
    const fetchMock = vi.mocked(global.fetch);
    // "молок" is a valid prefix of "молоко" in UK_TO_EN → translates to "milk"
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [] })) // OFF-uk
      .mockResolvedValueOnce(jsonResponse(true, { products: [] })) // OFF-en
      .mockResolvedValueOnce(jsonResponse(true, { foods: [] })); // USDA

    const res = mockRes();
    await handler(asReq({ q: "молок", limit: "3" }), res);

    // Should have made 3 calls (uk + en + usda) — prefix matched
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[1]).toContain("search_terms=milk");
    expect(urls[2]).toContain("query=milk");
  });

  it("exact Ukrainian word 'яйце' translates to 'egg'", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(true, { products: [] })) // OFF-uk
      .mockResolvedValueOnce(jsonResponse(true, { products: [] })) // OFF-en
      .mockResolvedValueOnce(jsonResponse(true, { foods: [] })); // USDA

    await handler(asReq({ q: "яйце", limit: "3" }), mockRes());

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls[1]).toContain("search_terms=egg");
    expect(urls[2]).toContain("query=egg");
  });
});

describe("food-search — Tier-1 (власний каталог)", () => {
  const origFetch = global.fetch;

  function catalogProduct(n: number): FoodSearchProduct {
    return {
      id: `cat_off_482000000000${n}`,
      name: `Молоко варіант ${n}`,
      brand: "Яготинське",
      source: "off",
      per100: { kcal: 53, protein_g: 2.8, fat_g: 2.6, carbs_g: 4.7 },
      defaultGrams: 100,
    };
  }

  beforeEach(() => {
    searchCatalogMock.mockReset();
    searchCatalogMock.mockResolvedValue([]);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  function req(q: string, limit?: number): Request {
    return {
      query: limit == null ? { q } : { q, limit: String(limit) },
    } as unknown as Request;
  }

  it("повний ліміт із каталогу зупиняє каскад — жодного виходу назовні", async () => {
    // Найчастіший випадок («молоко», «хліб», «яйця») і саме той, де
    // економія квоти upstream-ів має значення.
    const fetchSpy = vi.spyOn(global, "fetch");
    searchCatalogMock.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => catalogProduct(i)),
    );

    const res = mockRes();
    await handler(req("молоко", 5), res);

    expect(res.statusCode).toBe(200);
    expect((res.body as { products: unknown[] }).products).toHaveLength(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("неповна видача каталогу добирається з upstream", async () => {
    searchCatalogMock.mockResolvedValue([catalogProduct(1)]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          {
            code: "111",
            product_name: "Молоко з OFF",
            brands: "Галичина",
            nutriments: {
              "energy-kcal_100g": 60,
              proteins_100g: 3,
              fat_100g: 2.5,
              carbohydrates_100g: 4.8,
            },
          },
        ],
      }),
    });

    const res = mockRes();
    await handler(req("молоко", 10), res);

    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
    const products = (res.body as { products: FoodSearchProduct[] }).products;
    // Каталог попереду: це вже перевірені воротами Атвотера картки.
    expect(products[0]?.id).toBe("cat_off_4820000000001");
    expect(products.length).toBeGreaterThan(1);
  });

  it("результат каталогу НЕ проходить токен-фільтр upstream-у", async () => {
    // Каталог знаходить і за схожістю слова, тож буквального токена
    // запиту в назві може не бути. Прогнати його через `includes(token)`
    // означало б викинути саме влучні результати з друкарською помилкою.
    searchCatalogMock.mockResolvedValue([
      { ...catalogProduct(1), name: "Молоко Яготинське" },
    ]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ products: [] }),
    });

    const res = mockRes();
    await handler(req("малоко", 10), res);

    const products = (res.body as { products: FoodSearchProduct[] }).products;
    expect(products).toHaveLength(1);
    expect(products[0]?.name).toBe("Молоко Яготинське");
  });

  it("недоступний каталог не ламає пошук", async () => {
    searchCatalogMock.mockRejectedValue(new Error("connection refused"));
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          {
            code: "222",
            product_name: "Молоко",
            brands: null,
            nutriments: {
              "energy-kcal_100g": 60,
              proteins_100g: 3,
              fat_100g: 2.5,
              carbohydrates_100g: 4.8,
            },
          },
        ],
      }),
    });

    const res = mockRes();
    await handler(req("молоко", 10), res);

    expect(res.statusCode).toBe(200);
    expect(
      (res.body as { products: unknown[] }).products.length,
    ).toBeGreaterThan(0);
  });

  it("дублікат між каталогом і upstream не потрапляє двічі", async () => {
    searchCatalogMock.mockResolvedValue([
      { ...catalogProduct(1), name: "Молоко", brand: "Галичина" },
    ]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          {
            code: "333",
            product_name: "Молоко",
            brands: "Галичина",
            nutriments: {
              "energy-kcal_100g": 60,
              proteins_100g: 3,
              fat_100g: 2.5,
              carbohydrates_100g: 4.8,
            },
          },
        ],
      }),
    });

    const res = mockRes();
    await handler(req("молоко", 10), res);

    const products = (res.body as { products: FoodSearchProduct[] }).products;
    const milk = products.filter((p) => p.name === "Молоко");
    expect(milk).toHaveLength(1);
    expect(milk[0]?.id).toBe("cat_off_4820000000001");
  });
});

describe("food-search — базова їжа без штрихкоду", () => {
  const origFetch = global.fetch;

  const cucumber: FoodSearchProduct = {
    id: "gen_ohirok",
    name: "Огірок",
    brand: null,
    source: "usda",
    per100: { kcal: 15, protein_g: 0.7, fat_g: 0.1, carbs_g: 3.6 },
    defaultGrams: 100,
  };

  beforeEach(() => {
    searchCatalogMock.mockReset();
    searchCatalogMock.mockResolvedValue([]);
    searchGenericFoodsMock.mockReset();
    searchGenericFoodsMock.mockResolvedValue([]);
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  function req(q: string, limit?: number): Request {
    return {
      query: limit == null ? { q } : { q, limit: String(limit) },
    } as unknown as Request;
  }

  it("базова їжа йде ПЕРЕД брендованою карткою", async () => {
    // На запит «огірок» людина хоче овоч, а не «Огірки консервовані
    // Верес». Брендована картка релевантна тоді, коли шукають бренд —
    // і тоді вона й так підніметься.
    searchGenericFoodsMock.mockResolvedValue([cucumber]);
    searchCatalogMock.mockResolvedValue([
      {
        id: "cat_off_482",
        name: "Огірки консервовані",
        brand: "Верес",
        source: "off",
        per100: { kcal: 11, protein_g: 0.8, fat_g: 0.1, carbs_g: 1.7 },
        defaultGrams: 100,
      },
    ]);

    const res = mockRes();
    await handler(req("огірок", 2), res);

    const found = (res.body as { products: FoodSearchProduct[] }).products;
    expect(found[0]?.id).toBe("gen_ohirok");
  });

  it("власних результатів на повний ліміт достатньо — назовні не йдемо", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    searchGenericFoodsMock.mockResolvedValue([cucumber]);
    searchCatalogMock.mockResolvedValue([]);

    const res = mockRes();
    await handler(req("огірок", 1), res);

    expect(res.statusCode).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("два власні джерела питаються паралельно, не послідовно", async () => {
    // Обидва локальні й незалежні; послідовний виклик подвоював би
    // затримку пошуку ні за що.
    //
    // AI-DANGER: перевіряти ПОРЯДОК СТАРТУ тут марно — послідовна
    // реалізація дає рівно ті самі «перший, другий», і такий тест
    // зеленіє на обох. Розрізняє лише те, що нижче: базова їжа
    // блокується на воротах і НЕ завершується, і саме в цей момент
    // каталог має бути вже викликаний. Послідовний `await` до другого
    // виклику просто не дійшов би — тест завис би на `pending`.
    let releaseGeneric!: () => void;
    let markGenericStarted!: () => void;
    const genericStarted = new Promise<void>((resolve) => {
      markGenericStarted = resolve;
    });
    const genericGate = new Promise<void>((resolve) => {
      releaseGeneric = resolve;
    });
    searchGenericFoodsMock.mockImplementation(async () => {
      markGenericStarted();
      await genericGate;
      return [];
    });
    searchCatalogMock.mockResolvedValue([]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ products: [] }),
    });

    const pending = handler(req("огірок", 10), mockRes());
    await genericStarted;
    expect(searchCatalogMock).toHaveBeenCalledWith("огірок", 10);

    releaseGeneric();
    await pending;
  });

  it("падіння базової їжі не ламає пошук", async () => {
    searchGenericFoodsMock.mockRejectedValue(new Error("relation missing"));
    searchCatalogMock.mockResolvedValue([]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        products: [
          {
            code: "444",
            product_name: "Огірок",
            brands: null,
            nutriments: {
              "energy-kcal_100g": 15,
              proteins_100g: 0.7,
              fat_100g: 0.1,
              carbohydrates_100g: 3.6,
            },
          },
        ],
      }),
    });

    const res = mockRes();
    await handler(req("огірок", 10), res);

    expect(res.statusCode).toBe(200);
    expect(
      (res.body as { products: unknown[] }).products.length,
    ).toBeGreaterThan(0);
  });

  it("дубль між базовою їжею і каталогом не потрапляє двічі", async () => {
    searchGenericFoodsMock.mockResolvedValue([cucumber]);
    searchCatalogMock.mockResolvedValue([{ ...cucumber, id: "cat_off_999" }]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ products: [] }),
    });

    const res = mockRes();
    await handler(req("огірок", 10), res);

    const found = (res.body as { products: FoodSearchProduct[] }).products;
    expect(found.filter((p) => p.name === "Огірок")).toHaveLength(1);
  });
});
