import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callWithFreshAccessToken: vi.fn(),
  callMcpTool: vi.fn(),
  resolveBranchContext: vi.fn(),
  dbQuery: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("./tokenStore.js", () => ({
  callWithFreshAccessToken: mocks.callWithFreshAccessToken,
}));

vi.mock("./mcpClient.js", () => ({
  callMcpTool: mocks.callMcpTool,
}));

vi.mock("./branchContext.js", () => ({
  resolveBranchContext: mocks.resolveBranchContext,
}));

vi.mock("../../db.js", () => ({ query: mocks.dbQuery }));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() },
}));

import {
  applyCart,
  buildPreviewResults,
  clearCart,
  getCart,
  previewCart,
} from "./cart.js";
import { encodeLagerId } from "./cartNormalize.js";

beforeEach(() => {
  mocks.callWithFreshAccessToken.mockReset();
  mocks.callMcpTool.mockReset();
  mocks.resolveBranchContext.mockReset();
  mocks.dbQuery.mockReset();
  mocks.loggerWarn.mockReset();
});

/** Mirrors `foodSource.test.ts`'s helper — makes `callWithFreshAccessToken` actually invoke the passed `fn`. */
function passThroughAccessToken() {
  mocks.callWithFreshAccessToken.mockImplementation(
    async (_userId: string, fn: (token: string) => Promise<unknown>) =>
      fn("fake-access-token"),
  );
}

const BRANCH_CTX = {
  ok: true as const,
  data: {
    branchId: "branch-1",
    deliveryType: "DeliveryHome",
    timeslotStart: "",
    timeslotEnd: "",
  },
};

const REF = {
  productId: "prod-1",
  companyId: "company-1",
  branchId: "branch-1",
};

// ─────────────────────────────── buildPreviewResults ────────────────────────

describe("buildPreviewResults (pure)", () => {
  it("matches queries back to items by exact text, not array index", () => {
    const items = [{ name: "молоко" }, { name: "хліб" }];
    const rawQueries = [
      {
        query: "хліб",
        totalFound: 1,
        products: [
          {
            id: "p1",
            name: "Хліб",
            price: 30,
            companyId: "c1",
            branchId: "b1",
          },
        ],
      },
      {
        query: "молоко",
        totalFound: 1,
        products: [
          {
            id: "p2",
            name: "Молоко",
            price: 45,
            companyId: "c1",
            branchId: "b1",
          },
        ],
      },
    ];

    const results = buildPreviewResults(items, rawQueries);
    expect(results).toHaveLength(2);
    expect(results[0]?.query).toBe("молоко");
    expect(results[0]?.matches[0]?.name).toBe("Молоко");
    expect(results[1]?.query).toBe("хліб");
    expect(results[1]?.matches[0]?.name).toBe("Хліб");
  });

  it("marks unmatched: true when a query has zero usable hits", () => {
    const results = buildPreviewResults(
      [{ name: "неіснуючий товар" }],
      [{ query: "неіснуючий товар", totalFound: 0, products: [] }],
    );
    expect(results).toEqual([
      { query: "неіснуючий товар", matches: [], unmatched: true },
    ]);
  });

  it("degrades (unmatched: true) instead of crashing when the raw response has no matching query entry", () => {
    const results = buildPreviewResults([{ name: "сир" }], []);
    expect(results).toEqual([{ query: "сир", matches: [], unmatched: true }]);
  });

  it("caps matches at 3 (top candidate + up to 2 alternatives) and drops unusable hits", () => {
    const results = buildPreviewResults(
      [{ name: "яблука" }],
      [
        {
          query: "яблука",
          totalFound: 5,
          products: [
            {
              id: "p1",
              name: "Яблука 1",
              price: 10,
              companyId: "c1",
              branchId: "b1",
            },
            {
              id: "p2",
              name: "Яблука 2",
              price: 20,
              companyId: "c1",
              branchId: "b1",
            },
            { name: "Без id — відкидається" }, // unusable, dropped
            {
              id: "p3",
              name: "Яблука 3",
              price: 30,
              companyId: "c1",
              branchId: "b1",
            },
            {
              id: "p4",
              name: "Яблука 4",
              price: 40,
              companyId: "c1",
              branchId: "b1",
            },
          ],
        },
      ],
    );
    expect(results[0]?.matches).toHaveLength(3);
    expect(results[0]?.matches.map((m) => m.name)).toEqual([
      "Яблука 1",
      "Яблука 2",
      "Яблука 3",
    ]);
  });
});

// ─────────────────────────────── previewCart ─────────────────────────────────

describe("previewCart", () => {
  it("chunks >30 items into multiple silpo_find_products_batch calls", async () => {
    passThroughAccessToken();
    mocks.resolveBranchContext.mockResolvedValue(BRANCH_CTX);
    mocks.callMcpTool.mockImplementation(
      async ({ args }: { args: { products: string[] } }) => ({
        ok: true,
        data: {
          queries: args.products.map((query: string) => ({
            query,
            totalFound: 0,
            products: [],
          })),
        },
      }),
    );

    const items = Array.from({ length: 35 }, (_, i) => ({
      name: `товар-${i}`,
    }));
    const results = await previewCart("user-1", items);

    expect(results).toHaveLength(35);
    expect(mocks.callMcpTool).toHaveBeenCalledTimes(2); // 30 + 5
  });

  it("propagates a branch-context resolution failure as a mapped AppError (never crashes)", async () => {
    passThroughAccessToken();
    mocks.resolveBranchContext.mockResolvedValue({
      ok: false,
      error: { kind: "schema_drift", message: "no branch context" },
    });

    await expect(
      previewCart("user-1", [{ name: "молоко" }]),
    ).rejects.toMatchObject({ status: 502, code: "SILPO_SCHEMA_DRIFT" });
  });

  it("maps not_connected to a 409 AppError", async () => {
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "not_connected", message: "not connected" },
    });

    await expect(
      previewCart("user-1", [{ name: "молоко" }]),
    ).rejects.toMatchObject({ status: 409, code: "SILPO_NOT_CONNECTED" });
  });
});

// ─────────────────────────────── applyCart ───────────────────────────────────

describe("applyCart", () => {
  it("throws a 400 ValidationError for a malformed lagerId — never calls the MCP", async () => {
    await expect(
      applyCart("user-1", [{ lagerId: "not-a-valid-token", quantity: 1 }]),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION" });
    expect(mocks.callWithFreshAccessToken).not.toHaveBeenCalled();
  });

  it("adds EXACTLY the passed selections (addQuantity: false) and returns the post-write cart", async () => {
    passThroughAccessToken();
    mocks.callMcpTool
      .mockResolvedValueOnce({ ok: true, data: { shoppingCartId: "cart-1" } }) // get_my_shopping_cart
      .mockResolvedValueOnce({ ok: true, data: { success: true } }) // add_or_update
      .mockResolvedValueOnce({
        ok: true,
        data: {
          cart: {
            shipments: [
              {
                products: [
                  { name: "Молоко", price: 45, quantity: 2, subtotal: 90 },
                ],
              },
            ],
            calculation: { totalAfterDiscounts: 90 },
          },
          checkoutWebLink: "https://silpo.ua/checkout/1",
        },
      }); // get_shopping_cart_by_id

    const lagerId = encodeLagerId(REF);
    const cart = await applyCart("user-1", [{ lagerId, quantity: 2 }]);

    expect(cart).toEqual({
      items: [
        { name: "Молоко", quantity: 2, priceKop: 4500, subtotalKop: 9000 },
      ],
      totalKop: 9000,
      cartUrl: "https://silpo.ua/checkout/1",
    });

    const addCall = mocks.callMcpTool.mock.calls[1]?.[0];
    expect(addCall.toolName).toBe("silpo_add_or_update_cart_products");
    expect(addCall.args).toEqual({
      shoppingCartId: "cart-1",
      products: [
        {
          productId: REF.productId,
          companyId: REF.companyId,
          branchId: REF.branchId,
          quantity: 2,
          addQuantity: false,
        },
      ],
    });
  });

  it("maps an upstream MCP failure on add_or_update to a mapped AppError", async () => {
    passThroughAccessToken();
    mocks.callMcpTool
      .mockResolvedValueOnce({ ok: true, data: { shoppingCartId: "cart-1" } })
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: "upstream_unavailable", message: "down" },
      });

    const lagerId = encodeLagerId(REF);
    await expect(
      applyCart("user-1", [{ lagerId, quantity: 1 }]),
    ).rejects.toMatchObject({ status: 502, code: "SILPO_UPSTREAM_ERROR" });
  });

  it("degrades to a mapped AppError (schema_drift) when Silpo returns no shoppingCartId", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValueOnce({ ok: true, data: {} });

    const lagerId = encodeLagerId(REF);
    await expect(
      applyCart("user-1", [{ lagerId, quantity: 1 }]),
    ).rejects.toMatchObject({ status: 502, code: "SILPO_SCHEMA_DRIFT" });
  });
});

// ─────────────────────────────── getCart ─────────────────────────────────────

describe("getCart", () => {
  it("returns an empty cart when the user has no shoppingCartId yet", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValueOnce({ ok: true, data: {} });

    const cart = await getCart("user-1");
    expect(cart).toEqual({ items: [], totalKop: 0, cartUrl: null });
  });

  it("normalizes the full cart on a happy path", async () => {
    passThroughAccessToken();
    mocks.callMcpTool
      .mockResolvedValueOnce({ ok: true, data: { shoppingCartId: "cart-1" } })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          cart: {
            shipments: [
              {
                products: [
                  { name: "Сир", price: 120, quantity: 1, subtotal: 120 },
                ],
              },
            ],
            calculation: { total: 150, totalAfterDiscounts: 120 },
          },
          checkoutWebLink: "https://silpo.ua/checkout/2",
        },
      });

    const cart = await getCart("user-1");
    expect(cart).toEqual({
      items: [
        { name: "Сир", quantity: 1, priceKop: 12000, subtotalKop: 12000 },
      ],
      totalKop: 12000,
      cartUrl: "https://silpo.ua/checkout/2",
    });
  });

  it("maps a reauth_required token error to a 409 AppError", async () => {
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "reauth_required", message: "reauth" },
    });

    await expect(getCart("user-1")).rejects.toMatchObject({
      status: 409,
      code: "SILPO_REAUTH_REQUIRED",
    });
  });
});

// ─────────────────────────────── clearCart ───────────────────────────────────

describe("clearCart", () => {
  it("clears the cart and returns the post-write state", async () => {
    passThroughAccessToken();
    mocks.callMcpTool
      .mockResolvedValueOnce({ ok: true, data: { shoppingCartId: "cart-1" } })
      .mockResolvedValueOnce({ ok: true, data: { success: true } })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          cart: { shipments: [{ products: [] }], calculation: { total: 0 } },
        },
      });

    const cart = await clearCart("user-1");
    expect(cart).toEqual({ items: [], totalKop: 0, cartUrl: null });
    expect(mocks.callMcpTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolName: "silpo_clear_shopping_cart",
        args: { shoppingCartId: "cart-1" },
      }),
    );
  });

  it("is a no-op success when the account has no cart at all", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValueOnce({ ok: true, data: {} });

    const cart = await clearCart("user-1");
    expect(cart).toEqual({ items: [], totalKop: 0, cartUrl: null });
    // Нічого не чистимо — другого виклику немає.
    expect(mocks.callMcpTool).toHaveBeenCalledTimes(1);
  });

  it("maps a reauth_required token error to a 409 AppError", async () => {
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "reauth_required", message: "reauth" },
    });

    await expect(clearCart("user-1")).rejects.toMatchObject({
      status: 409,
      code: "SILPO_REAUTH_REQUIRED",
    });
  });
});
