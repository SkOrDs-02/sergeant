import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response as ExpressResponse } from "express";
import {
  stableId,
  hasErrorName,
  normalizeOFFProduct,
  normalizeUSDAProduct,
} from "./food-search.js";
import handler from "./food-search.js";

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

  it("validates query args before calling upstreams", async () => {
    const res = mockRes();

    await handler(asReq({ q: "x", limit: "3" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "Некоректні параметри запиту" });
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
});
