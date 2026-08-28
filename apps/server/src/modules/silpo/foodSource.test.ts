import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { SILPO_ENABLED: true },
  callWithFreshAccessToken: vi.fn(),
  callMcpTool: vi.fn(),
  resolveBranchContext: vi.fn(),
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

vi.mock("./branchContext.js", () => ({
  resolveBranchContext: mocks.resolveBranchContext,
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

const {
  toServingGrams,
  normalizeRawProduct,
  toSearchProduct,
  toBarcodeProduct,
  attrNumber,
  parseKcal,
  parseDisplayRatio,
} = __test__;

beforeEach(() => {
  mocks.env.SILPO_ENABLED = true;
  mocks.callWithFreshAccessToken.mockReset();
  mocks.callMcpTool.mockReset();
  mocks.resolveBranchContext.mockReset();
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

const BRANCH_CTX = {
  ok: true as const,
  data: {
    branchId: "branch-uuid-1",
    deliveryType: "DeliveryHome",
    timeslotStart: "",
    timeslotEnd: "",
  },
};

// ─────────────────────────────── toServingGrams ─────────────────────────────

describe("toServingGrams (mass-units-only conversion)", () => {
  it("passes gram-like units through as-is (г/g/гр/грам, trim + case + trailing dot)", () => {
    expect(toServingGrams(250, "г")).toBe(250);
    expect(toServingGrams(250, "g")).toBe(250);
    expect(toServingGrams(250, "гр.")).toBe(250);
    expect(toServingGrams(250, " Грам ")).toBe(250);
  });

  it("converts кг/kg to grams (×1000)", () => {
    expect(toServingGrams(1, "кг")).toBe(1000);
    expect(toServingGrams(0.5, "kg")).toBe(500);
  });

  it("returns null for volume/count units — мл, л, шт are NOT grams", () => {
    expect(toServingGrams(900, "мл")).toBeNull();
    expect(toServingGrams(1, "л")).toBeNull();
    expect(toServingGrams(10, "шт")).toBeNull();
  });

  it("treats a missing unit as grams (packaged-goods default)", () => {
    expect(toServingGrams(900, undefined)).toBe(900);
  });

  it("returns null when weight itself is absent or non-finite", () => {
    expect(toServingGrams(undefined, "г")).toBeNull();
    expect(toServingGrams(Number.NaN, "г")).toBeNull();
  });
});

// ──────────────── attributes-парсери (живі форми, спайк §0) ─────────────────

describe("attrNumber / parseKcal / parseDisplayRatio", () => {
  it("attrNumber: number as-is, рядок з комою → число, сміття → undefined", () => {
    expect(attrNumber(2.9)).toBe(2.9);
    expect(attrNumber("4,3")).toBe(4.3);
    expect(attrNumber("10")).toBe(10);
    expect(attrNumber("н/д")).toBeUndefined();
    expect(attrNumber(undefined)).toBeUndefined();
  });

  it('parseKcal: "119/492" (кКал/кДЖ) → 119; number as-is', () => {
    expect(parseKcal("119/492")).toBe(119);
    expect(parseKcal("60,5/253")).toBe(60.5);
    expect(parseKcal(220)).toBe(220);
    expect(parseKcal(undefined)).toBeUndefined();
  });

  it('parseDisplayRatio: "500г" / "10 шт" / "1,5л" → {amount, unit}', () => {
    expect(parseDisplayRatio("500г")).toEqual({ amount: 500, unit: "г" });
    expect(parseDisplayRatio("10 шт")).toEqual({ amount: 10, unit: "шт" });
    expect(parseDisplayRatio("1,5л")).toEqual({ amount: 1.5, unit: "л" });
    expect(parseDisplayRatio(null)).toBeNull();
    expect(parseDisplayRatio("шт")).toBeNull();
  });
});

// ─────────────────────────────── normalizeRawProduct ────────────────────────

describe("normalizeRawProduct (details-форма зі спайку §0)", () => {
  it("мапить attributes з українськими ключами у макро-поля", () => {
    const parsed = normalizeRawProduct({
      name: "Тестові вершки 10%",
      displayRatio: "500г",
      attributes: {
        Країна: "Україна",
        "Торгова марка": "ТестБренд",
        "Енергетична цінність (кКал/кДЖ)": "119/492",
        "Білки (г)": 2.9,
        "Жири (г)": 10,
        "Вуглеводи (г)": 4.3,
      },
    });
    expect(parsed).toEqual({
      name: "Тестові вершки 10%",
      brand: "ТестБренд",
      barcode: null, // EAN відсутній у контракті Silpo MCP
      kcal_100g: 119,
      protein_100g: 2.9,
      fat_100g: 10,
      carbs_100g: 4.3,
      servingAmount: 500,
      servingGrams: 500,
      servingUnit: "г",
      hasMacro: true,
    });
  });

  it('обʼємні юніти displayRatio ("1,5л") не течуть у грами', () => {
    const parsed = normalizeRawProduct({
      name: "Тестова вода",
      displayRatio: "1,5л",
      attributes: { "Енергетична цінність (кКал/кДЖ)": "0/0" },
    });
    expect(parsed).toMatchObject({
      servingAmount: 1.5,
      servingGrams: null,
      servingUnit: "л",
    });
  });

  it("drops a product with no usable name (never throws)", () => {
    expect(normalizeRawProduct({ attributes: { "Білки (г)": 1 } })).toBeNull();
  });

  it("normalizes fine with zero macro attributes — hasMacro: false, no crash", () => {
    const parsed = normalizeRawProduct({
      name: "Товар без КБЖВ",
      attributes: { Країна: "Україна" },
    });
    expect(parsed).toMatchObject({
      name: "Товар без КБЖВ",
      hasMacro: false,
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
    });
  });

  it("normalizes fine with attributes absent entirely", () => {
    expect(normalizeRawProduct({ name: "Голий товар" })).toMatchObject({
      name: "Голий товар",
      hasMacro: false,
      brand: null,
    });
  });
});

describe("toSearchProduct", () => {
  it("emits a real per100 block when macros are present", () => {
    const product = toSearchProduct({
      name: "Сир кисломолочний",
      brand: "ТестБренд",
      barcode: null,
      kcal_100g: 101,
      protein_100g: 16.7,
      fat_100g: 2,
      carbs_100g: 3.4,
      servingAmount: 350,
      servingGrams: 350,
      servingUnit: "г",
      hasMacro: true,
    });
    expect(product).toEqual({
      id: expect.stringMatching(/^silpo_/),
      name: "Сир кисломолочний",
      brand: "ТестБренд",
      source: "silpo",
      per100: { kcal: 101, protein_g: 16.7, fat_g: 2, carbs_g: 3.4 },
      defaultGrams: 350,
    });
  });

  it("falls back to defaultGrams: 100 when the serving is non-mass (л → servingGrams null)", () => {
    const product = toSearchProduct({
      name: "Молоко",
      brand: null,
      barcode: null,
      kcal_100g: 60,
      protein_100g: 3.2,
      fat_100g: 2.5,
      carbs_100g: 4.8,
      servingAmount: 900,
      servingGrams: null,
      servingUnit: "мл",
      hasMacro: true,
    });
    expect(product?.defaultGrams).toBe(100);
  });

  it("zero-fills MISSING macros on a partial hit (kcal-only) — same `?? 0` convention as OFF/USDA search normalizers", () => {
    const product = toSearchProduct({
      name: "Хліб",
      brand: null,
      barcode: null,
      kcal_100g: 220,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingAmount: null,
      servingGrams: null,
      servingUnit: null,
      hasMacro: true,
    });
    expect(product?.per100).toEqual({
      kcal: 220,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
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
        servingAmount: null,
        servingGrams: null,
        servingUnit: null,
        hasMacro: false,
      }),
    ).toBeNull();
  });

  it("drops an attribute-complete but value-empty card (Silpo ships these — 0 kcal would lie in the diary)", () => {
    // Живий каталог 2026-08-27: «Кускус з курячими котлетками та лінивими
    // огірками» — 0/2 ккал, білки 0.1, решта 0. `hasMacro` тут true.
    expect(
      toSearchProduct({
        name: "Кускус з курячими котлетками та лінивими огірками",
        brand: null,
        barcode: null,
        kcal_100g: 0,
        protein_100g: 0.1,
        fat_100g: 0,
        carbs_100g: 0,
        servingAmount: 330,
        servingGrams: 330,
        servingUnit: "г",
        hasMacro: true,
      }),
    ).toBeNull();
  });

  it("falls back to Atwater when the declared energy value is a bogus zero", () => {
    // `0/0` ккал при справжніх БЖВ — той самий клас битих карток. Доти
    // `kcal ?? atwater` лишав нуль (0 не nullish), і гейт викидав картку.
    const parsed = normalizeRawProduct({
      name: "Салат із нульовою енергетичною цінністю",
      displayRatio: "200г",
      attributes: {
        "Енергетична цінність (кКал/кДЖ)": "0/0",
        "Білки (г)": 20,
        "Жири (г)": 10,
        "Вуглеводи (г)": 5,
      },
    });
    // 4*20 + 9*10 + 4*5 = 190
    expect(parsed?.kcal_100g).toBe(190);
    expect(toSearchProduct(parsed!)?.per100.kcal).toBe(190);
  });

  it("keeps a card whose kcal came from the Atwater fallback (macros present, energy attribute missing)", () => {
    const parsed = normalizeRawProduct({
      name: "Салат без енергетичної цінності",
      displayRatio: "200г",
      attributes: {
        "Білки (г)": 3,
        "Жири (г)": 12,
        "Вуглеводи (г)": 5,
      },
    });
    // 4*3 + 9*12 + 4*5 = 140
    expect(parsed?.kcal_100g).toBe(140);
    expect(toSearchProduct(parsed!)?.per100.kcal).toBe(140);
  });
});

describe("toBarcodeProduct", () => {
  // Функція лишається для дня, коли Сільпо додасть EAN-lookup —
  // `lookupSilpoBarcode` зараз завжди `null` (див. тести нижче).
  it("returns `partial: true` + null macros when no macro is present (mirrors UPCitemdb)", () => {
    const product = toBarcodeProduct({
      name: "Товар без КБЖВ",
      brand: "Бренд",
      barcode: null,
      kcal_100g: null,
      protein_100g: null,
      fat_100g: null,
      carbs_100g: null,
      servingAmount: null,
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

/** Хіт batch-каталогу + details з КБЖВ — вигадані дані у живих формах. */
function mockTwoPhaseSearch() {
  mocks.resolveBranchContext.mockResolvedValue(BRANCH_CTX);
  mocks.callMcpTool.mockImplementation(
    async ({ toolName }: { toolName: string }) => {
      if (toolName === "silpo_find_products_batch") {
        return {
          ok: true,
          data: {
            queries: [
              {
                query: "молоко",
                totalFound: 1,
                products: [
                  {
                    id: "cat-uuid-1",
                    name: "Тестове молоко 2.5%",
                    slug: "testove-moloko-2-5-111111",
                    price: 45.5,
                    displayRatio: "900г",
                    externalProductId: 111111,
                  },
                ],
              },
            ],
          },
        };
      }
      if (toolName === "silpo_get_product_details") {
        return {
          ok: true,
          data: {
            product: {
              name: "Тестове молоко 2.5%",
              displayRatio: "900г",
              attributes: {
                "Торгова марка": "ТестБренд",
                "Енергетична цінність (кКал/кДЖ)": "60/251",
                "Білки (г)": 3.2,
                "Жири (г)": 2.5,
                "Вуглеводи (г)": 4.8,
              },
            },
          },
        };
      }
      throw new Error(`unexpected tool: ${toolName}`);
    },
  );
}

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

  it("happy path: двофазний batch → details, макро з attributes", async () => {
    connectedRow();
    passThroughAccessToken();
    mockTwoPhaseSearch();

    const products = await searchSilpoProducts("user-1", "молоко");

    expect(products).toEqual([
      {
        id: expect.stringMatching(/^silpo_/),
        name: "Тестове молоко 2.5%",
        brand: "ТестБренд",
        source: "silpo",
        per100: { kcal: 60, protein_g: 3.2, fat_g: 2.5, carbs_g: 4.8 },
        defaultGrams: 900,
      },
    ]);
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "silpo_find_products_batch",
        args: expect.objectContaining({
          branchId: "branch-uuid-1",
          deliveryType: "DeliveryHome",
          products: ["молоко"],
        }),
      }),
    );
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "silpo_get_product_details",
        args: expect.objectContaining({
          slug: "testove-moloko-2-5-111111",
        }),
      }),
    );
  });

  it("drops a malformed batch element (never fails the whole search) and logs a warn", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.resolveBranchContext.mockResolvedValue(BRANCH_CTX);
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => {
        if (toolName === "silpo_find_products_batch") {
          return {
            ok: true,
            data: {
              queries: [
                {
                  products: [
                    // Malformed: `name` must be a string.
                    { name: 12345, slug: "x" },
                  ],
                },
              ],
            },
          };
        }
        throw new Error(`unexpected tool: ${toolName}`);
      },
    );

    expect(await searchSilpoProducts("user-1", "хліб")).toEqual([]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_food_search_raw_product_unparseable",
      }),
    );
  });

  it("drops a hit whose details have no macro attributes instead of zero-filling it", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.resolveBranchContext.mockResolvedValue(BRANCH_CTX);
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => {
        if (toolName === "silpo_find_products_batch") {
          return {
            ok: true,
            data: {
              queries: [
                { products: [{ name: "Товар без КБЖВ", slug: "tovar-1" }] },
              ],
            },
          };
        }
        return {
          ok: true,
          data: { product: { name: "Товар без КБЖВ", attributes: {} } },
        };
      },
    );

    expect(await searchSilpoProducts("user-1", "товар")).toEqual([]);
  });

  it("порожній результат без жодного details-виклику, коли контекст філії недоступний", async () => {
    connectedRow();
    passThroughAccessToken();
    mocks.resolveBranchContext.mockResolvedValue({
      ok: false,
      error: { kind: "schema_drift", message: "no branch context" },
    });

    const products = await searchSilpoProducts("user-1", "молоко");

    expect(products).toEqual([]);
    expect(mocks.callMcpTool).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "silpo_food_search_source_skipped" }),
    );
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

describe("lookupSilpoBarcode (EAN не підтримується Silpo MCP — спайк §0)", () => {
  it("always resolves null without touching DB or MCP", async () => {
    expect(await lookupSilpoBarcode("user-1", "4820000000017")).toBeNull();
    expect(mocks.dbQuery).not.toHaveBeenCalled();
    expect(mocks.callWithFreshAccessToken).not.toHaveBeenCalled();
    expect(mocks.callMcpTool).not.toHaveBeenCalled();
  });

  it("null навіть для nullish userId — сигнатура каскаду незмінна", async () => {
    expect(await lookupSilpoBarcode(null, "4820000000017")).toBeNull();
  });
});
