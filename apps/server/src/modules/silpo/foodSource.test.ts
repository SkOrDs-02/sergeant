import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { SILPO_ENABLED: true },
  callWithFreshAccessToken: vi.fn(),
  callMcpTool: vi.fn(),
  dbQuery: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("../../env/env.js", () => ({ env: mocks.env }));

vi.mock("./tokenStore.js", () => ({
  callWithFreshAccessToken: mocks.callWithFreshAccessToken,
}));

vi.mock("./mcpClient.js", () => ({
  callMcpTool: mocks.callMcpTool,
}));

vi.mock("../../db.js", () => ({
  query: mocks.dbQuery,
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() },
}));

import {
  hasSilpoConnection,
  isSilpoConnectedUser,
  searchSilpoProducts,
  lookupSilpoBarcode,
  __test__,
} from "./foodSource.js";

const { normalizeRawProduct, toSearchProduct, toBarcodeProduct } = __test__;

beforeEach(() => {
  mocks.env.SILPO_ENABLED = true;
  mocks.callWithFreshAccessToken.mockReset();
  mocks.callMcpTool.mockReset();
  mocks.dbQuery.mockReset();
  mocks.loggerWarn.mockReset();
});

/** Makes `callWithFreshAccessToken` actually invoke the passed `fn` with a fake token — mirrors `receipts.test.ts`'s "per-order parsing via callMcpTool envelope" pattern. */
function passThroughAccessToken() {
  mocks.callWithFreshAccessToken.mockImplementation(
    async (_userId: string, fn: (token: string) => Promise<unknown>) =>
      fn("fake-access-token"),
  );
}

function connectedRow() {
  mocks.dbQuery.mockResolvedValue({ rows: [{ "?column?": 1 }] });
}

function notConnectedRow() {
  mocks.dbQuery.mockResolvedValue({ rows: [] });
}

// ─────────────────────────────── normalizeRawProduct ────────────────────────

describe("normalizeRawProduct (provisional field-alias mapping)", () => {
  it("maps the primary field names + all four macro aliases", () => {
    const parsed = normalizeRawProduct({
      name: "Молоко Галичина 2.5%",
      brand: "Галичина",
      barcode: "4820000000017",
      kcal100g: 60,
      protein100g: 3.2,
      fat100g: 2.5,
      carbs100g: 4.8,
      weight: 900,
      weightUnit: "мл",
    });
    expect(parsed).toEqual({
      name: "Молоко Галичина 2.5%",
      brand: "Галичина",
      barcode: "4820000000017",
      kcal_100g: 60,
      protein_100g: 3.2,
      fat_100g: 2.5,
      carbs_100g: 4.8,
      servingGrams: 900,
      servingUnit: "мл",
      hasMacro: true,
    });
  });

  it("falls back through the secondary alias set (title/brandName/ean/energyKcal100g/proteins100g/...)", () => {
    const parsed = normalizeRawProduct({
      title: "Хліб Український",
      brandName: "Київхліб",
      ean: "4820000000024",
      energyKcal100g: 220,
      proteins100g: 7.6,
      fats100g: 1.2,
      carbohydrates100g: 45,
      unit: "г",
    });
    expect(parsed).toMatchObject({
      name: "Хліб Український",
      brand: "Київхліб",
      barcode: "4820000000024",
      kcal_100g: 220,
      protein_100g: 7.6,
      fat_100g: 1.2,
      carbs_100g: 45,
      servingUnit: "г",
      hasMacro: true,
    });
  });

  it("drops a product with no usable name (never throws)", () => {
    expect(normalizeRawProduct({ brand: "Х", kcal100g: 100 })).toBeNull();
  });

  it("normalizes fine with zero macro fields present — hasMacro: false, no crash", () => {
    const parsed = normalizeRawProduct({ name: "Товар без КБЖВ" });
    expect(parsed).toMatchObject({
      name: "Товар без КБЖВ",
      hasMacro: false,
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
    });
  });
});

describe("toSearchProduct", () => {
  it("emits a real per100 block when macros are present", () => {
    const product = toSearchProduct({
      name: "Молоко",
      brand: "Галичина",
      barcode: "4820000000017",
      kcal_100g: 60,
      protein_100g: 3.2,
      fat_100g: 2.5,
      carbs_100g: 4.8,
      servingGrams: 900,
      servingUnit: "мл",
      hasMacro: true,
    });
    expect(product).toEqual({
      id: "silpo_4820000000017",
      name: "Молоко",
      brand: "Галичина",
      source: "silpo",
      per100: { kcal: 60, protein_g: 3.2, fat_g: 2.5, carbs_g: 4.8 },
      defaultGrams: 900,
    });
  });

  it("is dropped (not zero-filled) when no macro is present — FoodSearchProductSchema has no `partial` escape hatch", () => {
    expect(
      toSearchProduct({
        name: "Товар без КБЖВ",
        brand: null,
        barcode: null,
        kcal_100g: null,
        protein_100g: null,
        fat_100g: null,
        carbs_100g: null,
        servingGrams: null,
        servingUnit: null,
        hasMacro: false,
      }),
    ).toBeNull();
  });
});

describe("toBarcodeProduct", () => {
  it("returns `partial: true` + null macros when no macro is present (mirrors UPCitemdb)", () => {
    const product = toBarcodeProduct({
      name: "Товар без КБЖВ",
      brand: "Бренд",
      barcode: "4820000000017",
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingGrams: null,
      servingUnit: null,
      hasMacro: false,
    });
    expect(product).toEqual({
      name: "Товар без КБЖВ",
      brand: "Бренд",
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingSize: null,
      servingGrams: null,
      source: "silpo",
      partial: true,
    });
  });

  it("omits `partial` and returns real macros when present", () => {
    const product = toBarcodeProduct({
      name: "Молоко",
      brand: "Галичина",
      barcode: "4820000000017",
      kcal_100g: 60,
      protein_100g: 3.2,
      fat_100g: 2.5,
      carbs_100g: 4.8,
      servingGrams: 900,
      servingUnit: "мл",
      hasMacro: true,
    });
    expect(product.partial).toBeUndefined();
    expect(product.servingSize).toBe("900 мл");
  });
});

// ─────────────────────────────── isSilpoConnectedUser ────────────────────────

describe("isSilpoConnectedUser (cheap guard)", () => {
  it("returns false without any DB call when userId is absent", async () => {
    const result = await isSilpoConnectedUser(null);
    expect(result).toBe(false);
    expect(mocks.dbQuery).not.toHaveBeenCalled();
  });

  it("returns false without any DB call when SILPO_ENABLED=false", async () => {
    mocks.env.SILPO_ENABLED = false;
    const result = await isSilpoConnectedUser("user-1");
    expect(result).toBe(false);
    expect(mocks.dbQuery).not.toHaveBeenCalled();
  });

  it("returns true only for a `status = connected` row", async () => {
    connectedRow();
    expect(await isSilpoConnectedUser("user-1")).toBe(true);
    expect(mocks.dbQuery).toHaveBeenCalledWith(
      expect.stringContaining("silpo_connection"),
      ["user-1"],
      expect.objectContaining({ op: expect.any(String) }),
    );
  });

  it("returns false when the user has no connection row", async () => {
    notConnectedRow();
    expect(await isSilpoConnectedUser("user-1")).toBe(false);
  });

  it("fails closed (false, warn-logged) when the guard query itself throws", async () => {
    mocks.dbQuery.mockRejectedValue(new Error("pool exhausted"));
    expect(await isSilpoConnectedUser("user-1")).toBe(false);
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });
});

describe("hasSilpoConnection", () => {
  it("resolves true/false straight off `rows.length`", async () => {
    connectedRow();
    expect(await hasSilpoConnection("user-1", mocks.dbQuery)).toBe(true);
    notConnectedRow();
    expect(await hasSilpoConnection("user-1", mocks.dbQuery)).toBe(false);
  });
});

// ─────────────────────────────── searchSilpoProducts ─────────────────────────

describe("searchSilpoProducts", () => {
  it("silently skips (empty array, no MCP call) for a non-connected user — guard #4", async () => {
    notConnectedRow();
    const products = await searchSilpoProducts("user-1", "молоко");
    expect(products).toEqual([]);
    expect(mocks.callWithFreshAccessToken).not.toHaveBeenCalled();
  });

  it("silently skips without touching the DB when userId is null", async () => {
    const products = await searchSilpoProducts(null, "молоко");
    expect(products).toEqual([]);
    expect(mocks.dbQuery).not.toHaveBeenCalled();
    expect(mocks.callWithFreshAccessToken).not.toHaveBeenCalled();
  });

  it("happy path: normalizes a raw product array from the (provisional) envelope", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        products: [
          {
            name: "Молоко Галичина 2.5%",
            brand: "Галичина",
            kcal100g: 60,
            protein100g: 3.2,
            fat100g: 2.5,
            carbs100g: 4.8,
          },
        ],
      },
    });

    const products = await searchSilpoProducts("user-1", "молоко");

    expect(products).toEqual([
      {
        id: expect.stringMatching(/^silpo_/),
        name: "Молоко Галичина 2.5%",
        brand: "Галичина",
        source: "silpo",
        per100: { kcal: 60, protein_g: 3.2, fat_g: 2.5, carbs_g: 4.8 },
        defaultGrams: 100,
      },
    ]);
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "silpo_find_products_batch",
        args: { queries: ["молоко"] },
      }),
    );
  });

  it("drops a malformed element (never fails the whole search) and logs a warn", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: [
        { name: "Хліб", kcal100g: 220 },
        // Malformed: `name` must be a string per `RawProductSchema`.
        { name: 12345, kcal100g: 100 },
      ],
    });

    const products = await searchSilpoProducts("user-1", "хліб");

    expect(products).toHaveLength(1);
    expect(products[0]?.name).toBe("Хліб");
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_food_search_raw_product_unparseable",
      }),
    );
  });

  it("drops a well-formed hit with no macro data instead of zero-filling it", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: [{ name: "Товар без КБЖВ" }],
    });

    expect(await searchSilpoProducts("user-1", "товар")).toEqual([]);
  });

  it("never breaks the cascade on an MCP-layer error — quiet skip + warn", async () => {
    connectedRow();
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "upstream_unavailable", message: "Silpo MCP down" },
    });

    const products = await searchSilpoProducts("user-1", "молоко");

    expect(products).toEqual([]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_food_search_source_skipped",
        kind: "upstream_unavailable",
      }),
    );
  });

  it("never throws even when the MCP layer itself throws unexpectedly", async () => {
    connectedRow();
    mocks.callWithFreshAccessToken.mockRejectedValue(new Error("boom"));

    await expect(searchSilpoProducts("user-1", "молоко")).resolves.toEqual([]);
  });
});

// ─────────────────────────────── lookupSilpoBarcode ──────────────────────────

describe("lookupSilpoBarcode", () => {
  it("silently skips (null, no MCP call) for a non-connected user — guard #4", async () => {
    notConnectedRow();
    const product = await lookupSilpoBarcode("user-1", "4820000000017");
    expect(product).toBeNull();
    expect(mocks.callWithFreshAccessToken).not.toHaveBeenCalled();
  });

  it("happy path: normalizes a single raw product with real macros", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        product: {
          name: "Молоко Галичина 2.5%",
          brand: "Галичина",
          kcal100g: 60,
          protein100g: 3.2,
          fat100g: 2.5,
          carbs100g: 4.8,
          weight: 900,
          weightUnit: "мл",
        },
      },
    });

    const product = await lookupSilpoBarcode("user-1", "4820000000017");

    expect(product).toEqual({
      name: "Молоко Галичина 2.5%",
      brand: "Галичина",
      kcal_100g: 60,
      protein_100g: 3.2,
      fat_100g: 2.5,
      carbs_100g: 4.8,
      servingSize: "900 мл",
      servingGrams: 900,
      source: "silpo",
    });
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "silpo_get_product_details",
        args: { barcode: "4820000000017" },
      }),
    );
  });

  it("returns `partial: true` (never null) when the product has a name but no macros", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { product: { name: "Товар без КБЖВ" } },
    });

    const product = await lookupSilpoBarcode("user-1", "4820000000017");
    expect(product).toMatchObject({ name: "Товар без КБЖВ", partial: true });
  });

  it("drops an unparseable single result and logs a warn instead of throwing", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { product: { name: 12345 } },
    });

    expect(await lookupSilpoBarcode("user-1", "4820000000017")).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_barcode_raw_product_unparseable",
      }),
    );
  });

  it("never breaks the cascade on an MCP-layer error — quiet skip + warn", async () => {
    connectedRow();
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "reauth_required", message: "needs reconnect" },
    });

    const product = await lookupSilpoBarcode("user-1", "4820000000017");

    expect(product).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_barcode_source_skipped",
        kind: "reauth_required",
      }),
    );
  });
});
