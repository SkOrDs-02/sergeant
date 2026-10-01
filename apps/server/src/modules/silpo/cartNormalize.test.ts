import { describe, expect, it } from "vitest";
import {
  decodeLagerId,
  deriveUnit,
  encodeLagerId,
  evaluateCartMatch,
  normalizeCartDetail,
  normalizeCartMatch,
  queryMatchKey,
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

  it("exposes the pre-promo price only when it is strictly higher", () => {
    // Акція: 45.50 замість 52.90 — показуємо.
    expect(normalizeCartMatch({ ...RAW_HIT, oldPrice: 52.9 })).toMatchObject({
      priceKop: 4550,
      oldPriceKop: 5290,
    });
    // Сільпо іноді шле `oldPrice` рівний `price` (слід перецінки) —
    // «знижка 0%» гірша за відсутність значка.
    expect(normalizeCartMatch({ ...RAW_HIT, oldPrice: 45.5 })).toMatchObject({
      oldPriceKop: null,
    });
    expect(normalizeCartMatch({ ...RAW_HIT, oldPrice: null })).toMatchObject({
      oldPriceKop: null,
    });
    expect(normalizeCartMatch(RAW_HIT)).toMatchObject({ oldPriceKop: null });
  });

  it("ignores a sub-1% promo — the client would round it to «−0%»", () => {
    // 45.50 замість 45.60 це 0.2%: перекреслена ціна поруч із «−0%»
    // виглядає як акція, не будучи нею.
    expect(normalizeCartMatch({ ...RAW_HIT, oldPrice: 45.6 })).toMatchObject({
      oldPriceKop: null,
    });
    // 1% рівно — вже показуємо.
    expect(
      normalizeCartMatch({ ...RAW_HIT, price: 99, oldPrice: 100 }),
    ).toMatchObject({ oldPriceKop: 10000 });
  });

  it("treats a giveaway (price 0) as a full discount", () => {
    expect(
      normalizeCartMatch({ ...RAW_HIT, price: 0, oldPrice: 30 }),
    ).toMatchObject({ priceKop: 0, oldPriceKop: 3000 });
  });

  it("reads availability from either signal, and defaults to available", () => {
    expect(normalizeCartMatch(RAW_HIT)).toMatchObject({ available: true });
    expect(normalizeCartMatch({ ...RAW_HIT, available: false })).toMatchObject({
      available: false,
    });
    // `stock: 0` — теж «немає», навіть коли прапорець каже інше.
    expect(
      normalizeCartMatch({ ...RAW_HIT, available: true, stock: 0 }),
    ).toMatchObject({ available: false });
    // Мовчазна відсутність полів НЕ читається як «немає»: інакше дрейф
    // схеми зробив би весь список сірим.
    expect(normalizeCartMatch({ ...RAW_HIT, stock: 12 })).toMatchObject({
      available: true,
    });
  });

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

  describe("fallbackBranchId — філія, по якій шукали", () => {
    it("добудовує nullable branchId філією пошуку замість того, щоб відкинути хіт", () => {
      const match = normalizeCartMatch(
        { ...RAW_HIT, branchId: null },
        { fallbackBranchId: "search-branch" },
      );
      expect(match).not.toBeNull();
      expect(decodeLagerId(match!.lagerId)).toEqual({
        productId: "prod-1",
        companyId: "company-1",
        branchId: "search-branch",
      });
    });

    it("не перебиває branchId, який Сільпо віддала сама", () => {
      const match = normalizeCartMatch(RAW_HIT, {
        fallbackBranchId: "search-branch",
      });
      expect(decodeLagerId(match!.lagerId)?.branchId).toBe("branch-1");
    });

    it("companyId з контексту не добудовується: його там немає", () => {
      expect(
        normalizeCartMatch(
          { ...RAW_HIT, companyId: null },
          { fallbackBranchId: "search-branch" },
        ),
      ).toBeNull();
    });
  });
});

describe("evaluateCartMatch — причина відмови", () => {
  const RAW_HIT = {
    id: "prod-1",
    name: "Хліб",
    price: 30,
    companyId: "company-1",
    branchId: "branch-1",
  };

  it.each([
    ["no_id", { id: undefined }],
    ["no_name", { name: undefined }],
    ["no_price", { price: undefined }],
    ["no_company_id", { companyId: null }],
    ["no_branch_id", { branchId: null }],
  ] as const)("%s", (reason, patch) => {
    expect(evaluateCartMatch({ ...RAW_HIT, ...patch })).toEqual({
      ok: false,
      reason,
    });
  });

  it("повідомляє, що branchId добудовано", () => {
    expect(
      evaluateCartMatch(
        { ...RAW_HIT, branchId: null },
        { fallbackBranchId: "search-branch" },
      ),
    ).toMatchObject({ ok: true, branchFilled: true });
    expect(
      evaluateCartMatch(RAW_HIT, { fallbackBranchId: "search-branch" }),
    ).toMatchObject({ ok: true, branchFilled: false });
  });
});

describe("queryMatchKey", () => {
  it("не залежить від регістру, крайніх і подвійних пробілів", () => {
    expect(queryMatchKey("  ХЛІБ  білий ")).toBe(queryMatchKey("хліб білий"));
  });

  it("зводить Unicode-форми літер до однієї (NFC)", () => {
    // «й» як одна літера U+0439 і як «и» + комбінований бревіс U+0306.
    expect(queryMatchKey("йogurt")).toBe(queryMatchKey("йogurt"));
  });

  it("зводить форми апострофа", () => {
    const forms = ["'", "’", "ʼ"].map((a) => queryMatchKey(`м${a}ясо`));
    expect(new Set(forms).size).toBe(1);
  });

  it("різні слова лишаються різними", () => {
    expect(queryMatchKey("хліб")).not.toBe(queryMatchKey("хлібці"));
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
