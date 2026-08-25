import { describe, expect, it } from "vitest";
import {
  decodeLagerId,
  deriveUnit,
  encodeLagerId,
  normalizeCartDetail,
  normalizeCartMatch,
} from "./cartNormalize.js";

describe("encodeLagerId / decodeLagerId (opaque cart-selection token)", () => {
  it("round-trips a {productId, companyId, branchId} triplet", () => {
    const ref = {
      productId: "11111111-1111-1111-1111-111111111111",
      companyId: "22222222-2222-2222-2222-222222222222",
      branchId: "33333333-3333-3333-3333-333333333333",
    };
    const token = encodeLagerId(ref);
    expect(typeof token).toBe("string");
    expect(decodeLagerId(token)).toEqual(ref);
  });

  it("returns null (never throws) for garbage input", () => {
    expect(decodeLagerId("not-base64url-json")).toBeNull();
    expect(decodeLagerId("")).toBeNull();
  });

  it("returns null for a validly-encoded but structurally wrong payload", () => {
    const token = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString(
      "base64url",
    );
    expect(decodeLagerId(token)).toBeNull();
  });

  it("returns null when a required field is the wrong type", () => {
    const token = Buffer.from(
      JSON.stringify({ productId: 1, companyId: "c", branchId: "b" }),
      "utf8",
    ).toString("base64url");
    expect(decodeLagerId(token)).toBeNull();
  });
});

describe("deriveUnit", () => {
  it('parses the suffix of displayRatio ("500г" → "г", "10 шт" → "шт", "1,5л" → "л")', () => {
    expect(deriveUnit("500г", false)).toBe("г");
    expect(deriveUnit("10 шт", false)).toBe("шт");
    expect(deriveUnit("1,5л", false)).toBe("л");
  });

  it("falls back to кг/шт from the weighted flag when displayRatio is absent", () => {
    expect(deriveUnit(null, true)).toBe("кг");
    expect(deriveUnit(undefined, false)).toBe("шт");
    expect(deriveUnit(undefined, undefined)).toBe("шт");
  });

  it("falls back when displayRatio has no parseable unit suffix", () => {
    expect(deriveUnit("шт", true)).toBe("кг");
  });
});

describe("normalizeCartMatch", () => {
  const RAW_HIT = {
    id: "prod-1",
    name: "Молоко 2.5%",
    price: 45.5,
    companyId: "company-1",
    branchId: "branch-1",
    weighted: false,
    displayRatio: "900мл",
  };

  it("normalizes a complete hit — UAH price → kopiykas (Hard Rule #1), unit from displayRatio", () => {
    const match = normalizeCartMatch(RAW_HIT);
    expect(match).not.toBeNull();
    expect(match).toMatchObject({
      name: "Молоко 2.5%",
      priceKop: 4550,
      unit: "мл",
      displayRatio: "900мл",
    });
    expect(typeof match?.lagerId).toBe("string");
    expect(decodeLagerId(match!.lagerId)).toEqual({
      productId: "prod-1",
      companyId: "company-1",
      branchId: "branch-1",
    });
  });

  it("drops a hit missing companyId/branchId — a match unusable for /cart/apply is worse than none", () => {
    expect(normalizeCartMatch({ ...RAW_HIT, companyId: null })).toBeNull();
    expect(normalizeCartMatch({ ...RAW_HIT, branchId: null })).toBeNull();
  });

  it("drops a hit missing id/name/price", () => {
    expect(normalizeCartMatch({ ...RAW_HIT, id: undefined })).toBeNull();
    expect(normalizeCartMatch({ ...RAW_HIT, name: undefined })).toBeNull();
    expect(normalizeCartMatch({ ...RAW_HIT, price: undefined })).toBeNull();
  });

  it("rounds fractional kopiykas", () => {
    const match = normalizeCartMatch({ ...RAW_HIT, price: 12.345 });
    expect(match?.priceKop).toBe(1235); // 12.345 * 100 = 1234.5 -> round = 1235
  });
});

describe("normalizeCartDetail", () => {
  it("normalizes a full cart envelope — items, totalAfterDiscounts preferred over total, checkoutWebLink → cartUrl", () => {
    const result = normalizeCartDetail({
      success: true,
      cart: {
        shipments: [
          {
            products: [
              { name: "Хліб", price: 30, quantity: 2, subtotal: 60 },
              { name: "Сир", price: 120, quantity: 1 },
            ],
          },
        ],
        calculation: { total: 200, totalAfterDiscounts: 180 },
      },
      checkoutWebLink: "https://silpo.ua/checkout/abc",
    });

    expect(result).not.toBeNull();
    expect(result?.itemsDropped).toBe(0);
    expect(result?.cart).toEqual({
      items: [
        { name: "Хліб", quantity: 2, priceKop: 3000, subtotalKop: 6000 },
        { name: "Сир", quantity: 1, priceKop: 12000, subtotalKop: 12000 },
      ],
      totalKop: 18000,
      cartUrl: "https://silpo.ua/checkout/abc",
    });
  });

  it("falls back to calculation.total when totalAfterDiscounts is absent", () => {
    const result = normalizeCartDetail({
      cart: { shipments: [], calculation: { total: 500 } },
    });
    expect(result?.cart.totalKop).toBe(50000);
  });

  it("degrades to totalKop: null and cartUrl: null when both are absent — never throws", () => {
    const result = normalizeCartDetail({ cart: { shipments: [] } });
    expect(result?.cart).toEqual({ items: [], totalKop: null, cartUrl: null });
  });

  it("drops individual unparseable/incomplete line items but keeps the rest", () => {
    const result = normalizeCartDetail({
      cart: {
        shipments: [
          {
            products: [
              { name: "OK", price: 10, quantity: 1 },
              { name: "Без ціни", quantity: 1 }, // missing price
              "not-an-object",
            ],
          },
        ],
      },
    });
    expect(result?.itemsDropped).toBe(2);
    expect(result?.cart.items).toEqual([
      { name: "OK", quantity: 1, priceKop: 1000, subtotalKop: 1000 },
    ]);
  });

  it("returns null (schema drift) when `cart` itself is missing", () => {
    expect(normalizeCartDetail({ success: true })).toBeNull();
  });

  it("returns null (schema drift) when the raw payload isn't an object at all", () => {
    expect(normalizeCartDetail("not-an-object")).toBeNull();
    expect(normalizeCartDetail(null)).toBeNull();
  });
});
