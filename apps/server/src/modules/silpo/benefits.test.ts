import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callWithFreshAccessToken: vi.fn(),
  callMcpTool: vi.fn(),
  dbQuery: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("./tokenStore.js", () => ({
  callWithFreshAccessToken: mocks.callWithFreshAccessToken,
}));

vi.mock("./mcpClient.js", () => ({
  callMcpTool: mocks.callMcpTool,
}));

vi.mock("../../db.js", () => ({ query: mocks.dbQuery }));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() },
}));

import {
  getCouponDetails,
  getLoyaltyInfo,
  getMyCertificates,
  getMyCoupons,
  getMyPromos,
  getPromoCodes,
} from "./benefits.js";

beforeEach(() => {
  mocks.callWithFreshAccessToken.mockReset();
  mocks.callMcpTool.mockReset();
  mocks.dbQuery.mockReset();
  mocks.loggerWarn.mockReset();
});

/** Mirrors `cart.test.ts`'s helper — makes `callWithFreshAccessToken` actually invoke the passed `fn`. */
function passThroughAccessToken() {
  mocks.callWithFreshAccessToken.mockImplementation(
    async (_userId: string, fn: (token: string) => Promise<unknown>) =>
      fn("fake-access-token"),
  );
}

const USER_ID = "user-1";

// ────────────────────────────── getLoyaltyInfo ──────────────────────────────

describe("getLoyaltyInfo", () => {
  it("normalizes card + balance on success", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        loyalty: {
          card: {
            barcode: "1234567890",
            typeName: "Власна картка",
            memberId: 42,
          },
          balance: {
            total: 15.5,
            currency: "UAH",
            accounts: [{ type: "bonus", amount: 15.5 }],
          },
        },
      },
    });

    const result = await getLoyaltyInfo(USER_ID);

    expect(result).toEqual({
      cardBarcode: "1234567890",
      cardTypeName: "Власна картка",
      balanceTotal: 15.5,
      balanceCurrency: "UAH",
      balanceAccounts: [{ type: "bonus", amount: 15.5 }],
    });
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "silpo_get_loyalty_info", args: {} }),
    );
  });

  it("degrades null card/balance to null fields, not a crash", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { loyalty: { card: null, balance: null } },
    });

    const result = await getLoyaltyInfo(USER_ID);
    expect(result.cardBarcode).toBeNull();
    expect(result.balanceTotal).toBeNull();
    expect(result.balanceAccounts).toEqual([]);
  });

  it("maps a tool_error refusal to a mapped AppError, not a raw throw", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: false,
      error: { kind: "tool_error", message: "Silpo tool returned isError" },
    });

    await expect(getLoyaltyInfo(USER_ID)).rejects.toMatchObject({
      code: "SILPO_TOOL_ERROR",
    });
  });
});

// ──────────────────────────────── getMyCoupons ──────────────────────────────

describe("getMyCoupons", () => {
  const VALID_COUPON = {
    id: 1,
    active: true,
    useWay: "cashier",
    beginDate: "2026-01-01",
    endDate: "2026-12-31",
    description: "Знижка 10%",
    limitText: null,
    warningText: null,
    image: null,
  };

  it("returns every valid coupon on success", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { coupons: [VALID_COUPON] },
    });

    const result = await getMyCoupons(USER_ID);
    expect(result).toEqual([VALID_COUPON]);
  });

  it("skips exactly the one unparseable element, keeps the rest", async () => {
    passThroughAccessToken();
    const brokenCoupon = { id: 2 }; // missing required `active`
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { coupons: [VALID_COUPON, brokenCoupon] },
    });

    const result = await getMyCoupons(USER_ID);
    expect(result).toEqual([VALID_COUPON]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "silpo_benefits_item_unparseable",
        tool: "silpo_get_my_coupons",
        index: 1,
      }),
    );
  });

  it("never logs coupon content on a skipped element — Hard Rule #21", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { coupons: [{ id: 2 }] },
    });

    await getMyCoupons(USER_ID);
    const [warnArg] = mocks.loggerWarn.mock.calls[0]!;
    expect(JSON.stringify(warnArg)).not.toContain("Знижка");
  });

  it("propagates a tool_error refusal as a mapped AppError", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: false,
      error: { kind: "tool_error", message: "Silpo tool returned isError" },
    });

    await expect(getMyCoupons(USER_ID)).rejects.toMatchObject({
      code: "SILPO_TOOL_ERROR",
    });
  });

  it("degrades a missing `coupons` array to an empty list, not a crash", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({ ok: true, data: {} });

    const result = await getMyCoupons(USER_ID);
    expect(result).toEqual([]);
  });
});

// ────────────────────────────── getCouponDetails ────────────────────────────

describe("getCouponDetails", () => {
  it("passes businessCouponId through and returns the parsed coupon", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        coupon: {
          id: 7,
          active: true,
          state: "active",
          useWay: "cashier",
          beginDate: null,
          endDate: null,
          usedCount: 0,
          description: null,
          limitText: null,
          warningText: null,
          rewardText: null,
          rewardValue: null,
          image: null,
        },
      },
    });

    const result = await getCouponDetails(USER_ID, 7);
    expect(result.id).toBe(7);
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "silpo_get_coupon_details",
        args: { businessCouponId: 7 },
      }),
    );
  });

  it("degrades to a mapped AppError (schema_drift) when a required field is missing", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: false,
      error: {
        kind: "schema_drift",
        message:
          'Silpo MCP tool "silpo_get_coupon_details" response did not match the expected (provisional) schema',
      },
    });

    await expect(getCouponDetails(USER_ID, 7)).rejects.toMatchObject({
      code: "SILPO_SCHEMA_DRIFT",
    });
  });
});

// ──────────────────────────────── getMyPromos ───────────────────────────────

describe("getMyPromos", () => {
  const VALID_PROMO = {
    promoId: 10,
    selected: false,
    beginDate: null,
    endDate: null,
    description: "Знижка на молочку",
    rewardText: null,
    rewardValue: null,
    limitText: null,
    warningText: null,
    addressListText: null,
    image: null,
  };

  it("returns promos + meta on success", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        promos: [VALID_PROMO],
        meta: { total: 1, minSelect: 0, maxSelect: 3 },
      },
    });

    const result = await getMyPromos(USER_ID);
    expect(result.promos).toEqual([VALID_PROMO]);
    expect(result.meta).toEqual({ total: 1, minSelect: 0, maxSelect: 3 });
  });

  it("skips one unparseable promo (missing `selected`), keeps the valid one", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        promos: [VALID_PROMO, { promoId: 11 }],
        meta: { total: 2, minSelect: 0, maxSelect: 3 },
      },
    });

    const result = await getMyPromos(USER_ID);
    expect(result.promos).toEqual([VALID_PROMO]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "silpo_get_my_promos", index: 1 }),
    );
  });

  it("degrades missing meta to nulls, not a crash", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({ ok: true, data: { promos: [] } });

    const result = await getMyPromos(USER_ID);
    expect(result.meta).toEqual({
      total: null,
      minSelect: null,
      maxSelect: null,
    });
  });
});

// ─────────────────────────────── getPromoCodes ──────────────────────────────

describe("getPromoCodes", () => {
  it("returns every valid promo code on success", async () => {
    passThroughAccessToken();
    const validCode = {
      id: "pc-1",
      code: "SUMMER10",
      title: null,
      active: true,
    };
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { promoCodes: [validCode] },
    });

    const result = await getPromoCodes(USER_ID);
    expect(result).toEqual([validCode]);
  });

  it("skips one unparseable promo code (missing `code`), keeps the rest", async () => {
    passThroughAccessToken();
    const validCode = {
      id: "pc-1",
      code: "SUMMER10",
      title: null,
      active: true,
    };
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { promoCodes: [validCode, { id: "pc-2", active: true }] },
    });

    const result = await getPromoCodes(USER_ID);
    expect(result).toEqual([validCode]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "silpo_get_promo_codes", index: 1 }),
    );
  });
});

// ────────────────────────────── getMyCertificates ───────────────────────────

describe("getMyCertificates", () => {
  const VALID_CERT = {
    id: 1,
    createdAt: "2026-01-01T00:00:00Z",
    totalPrice: 500,
    barcode: "9900011122",
    pincode: "4321",
    expireDate: "2027-01-01",
    title: null,
    image: null,
  };

  it("returns every valid certificate and forwards limit/offset args", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { certificates: [VALID_CERT] },
    });

    const result = await getMyCertificates(USER_ID, { limit: 10, offset: 5 });
    expect(result).toEqual([VALID_CERT]);
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "silpo_get_my_certificates",
        args: { limit: 10, offset: 5 },
      }),
    );
  });

  it("sends no args when limit/offset are omitted", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: { certificates: [] },
    });

    await getMyCertificates(USER_ID);
    expect(mocks.callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({ args: {} }),
    );
  });

  it("skips one unparseable certificate (missing `barcode`), keeps the rest", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        certificates: [
          VALID_CERT,
          {
            id: 2,
            createdAt: "2026-01-02T00:00:00Z",
            totalPrice: 250,
            // barcode missing
            pincode: null,
            expireDate: null,
            title: null,
            image: null,
          },
        ],
      },
    });

    const result = await getMyCertificates(USER_ID);
    expect(result).toEqual([VALID_CERT]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "silpo_get_my_certificates", index: 1 }),
    );
  });

  it("never logs barcode/pincode of a skipped certificate — Hard Rule #21", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: true,
      data: {
        certificates: [
          {
            id: 2,
            createdAt: "2026-01-02T00:00:00Z",
            totalPrice: 250,
            pincode: "9999",
            expireDate: null,
            title: null,
            image: null,
          },
        ],
      },
    });

    await getMyCertificates(USER_ID);
    const [warnArg] = mocks.loggerWarn.mock.calls[0]!;
    expect(JSON.stringify(warnArg)).not.toContain("9999");
  });

  it("propagates a rate_limited failure as a mapped AppError", async () => {
    passThroughAccessToken();
    mocks.callMcpTool.mockResolvedValue({
      ok: false,
      error: { kind: "rate_limited", message: "Silpo MCP rate limit" },
    });

    await expect(getMyCertificates(USER_ID)).rejects.toMatchObject({
      code: "SILPO_RATE_LIMITED",
    });
  });
});

// ─────────────────────────── not-connected propagation ──────────────────────

describe("connection-state propagation (shared across all six reads)", () => {
  it("maps `not_connected` from callWithFreshAccessToken to a mapped AppError", async () => {
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "not_connected", message: "Silpo is not connected" },
    });

    await expect(getLoyaltyInfo(USER_ID)).rejects.toMatchObject({
      code: "SILPO_NOT_CONNECTED",
    });
    expect(mocks.callMcpTool).not.toHaveBeenCalled();
  });
});
