import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpToolProbe } from "./mcpClient.js";

const mocks = vi.hoisted(() => ({
  callWithFreshAccessToken: vi.fn(),
  listMcpTools: vi.fn(),
  probeMcpTool: vi.fn(),
}));

vi.mock("./tokenStore.js", () => ({
  callWithFreshAccessToken: mocks.callWithFreshAccessToken,
}));

vi.mock("./mcpClient.js", () => ({
  listMcpTools: mocks.listMcpTools,
  probeMcpTool: mocks.probeMcpTool,
}));

import { diagnoseSilpo } from "./diagnose.js";

// Схеми двох тул, які викликає синк, мусять бути РЕАЛЬНИМИ: вердикт тепер
// звіряє їх із таблицею очікувань (`toolContract.ts`), і голий `{ name }`
// читався б як «аргументи зникли зі схеми» — тобто тест ганяв би шлях
// дрейфу замість того, що перевіряє.
const TOOLS_WITH_SCHEMA: Record<string, unknown> = {
  silpo_get_my_online_orders: {
    properties: { limit: { minimum: 1, maximum: 100 }, offset: { minimum: 0 } },
  },
  silpo_get_my_offline_orders: {
    properties: {
      branchId: {},
      deliveryType: {},
      timeslotStart: {},
      timeslotEnd: {},
      limit: { minimum: 1, maximum: 10 },
      offset: { minimum: 0 },
    },
    required: ["branchId", "deliveryType", "timeslotStart", "timeslotEnd"],
  },
  // `silpo_get_coupon_details` — єдина з шести "loyalty" тул (`benefits.ts`)
  // з обовʼязковим аргументом: `businessCouponId` мусить лишатись у схемі,
  // інакше `diffToolContract` читає це як дрейф.
  silpo_get_coupon_details: {
    properties: { businessCouponId: { type: "number" } },
    required: ["businessCouponId"],
  },
};

const ALL_TOOLS = [
  "silpo_get_my_offline_orders",
  "silpo_get_my_online_orders",
  "silpo_find_products_batch",
  "silpo_get_product_details",
  "silpo_get_my_shopping_cart",
  "silpo_get_shopping_cart_by_id",
  "silpo_list_branches",
  // Шість "loyalty" тул читання (spec § benefits.ts) — жодна не потребує
  // branchContext; лише `silpo_get_coupon_details` несе обовʼязковий
  // аргумент (див. `TOOLS_WITH_SCHEMA` вище).
  "silpo_get_loyalty_info",
  "silpo_get_my_coupons",
  "silpo_get_coupon_details",
  "silpo_get_my_promos",
  "silpo_get_promo_codes",
  "silpo_get_my_certificates",
].map((name) =>
  TOOLS_WITH_SCHEMA[name]
    ? { name, inputSchema: TOOLS_WITH_SCHEMA[name] }
    : { name },
);

const HEALTHY_PROBE: McpToolProbe = {
  transportError: null,
  resultKeys: ["structuredContent", "content", "content:text"],
  isError: false,
  refusal: null,
  payloadExtracted: true,
  payloadKeys: ["success", "summary", "orders", "meta"],
  ordersCount: 1,
};

/** `callWithFreshAccessToken` просто проганяє fn під фейковим токеном. */
function passThroughToken(): void {
  mocks.callWithFreshAccessToken.mockImplementation(
    async (_userId: string, fn: (t: string) => Promise<unknown>) =>
      fn("access-token"),
  );
}

beforeEach(() => {
  mocks.callWithFreshAccessToken.mockReset();
  mocks.listMcpTools.mockReset();
  mocks.probeMcpTool.mockReset();
  passThroughToken();
  mocks.listMcpTools.mockResolvedValue({
    ok: true,
    data: { tools: ALL_TOOLS },
  });
  mocks.probeMcpTool.mockResolvedValue(HEALTHY_PROBE);
});

describe("diagnoseSilpo", () => {
  it("здорова інтеграція: тули на місці, відповідь розбирається", async () => {
    const result = await diagnoseSilpo("u1");

    expect(result).toMatchObject({ missingTools: [], toolsTotal: 13 });
    expect("verdict" in result && result.verdict).toContain("Все справне");
  });

  it("зниклу тулу називає поіменно — це і є «що змінили Сільпо»", async () => {
    mocks.listMcpTools.mockResolvedValue({
      ok: true,
      data: {
        tools: ALL_TOOLS.filter((t) => t.name !== "silpo_get_my_online_orders"),
      },
    });

    const result = await diagnoseSilpo("u1");

    expect(result).toMatchObject({
      missingTools: ["silpo_get_my_online_orders"],
    });
    expect("verdict" in result && result.verdict).toContain(
      "перейменували тули",
    );
  });

  it("відмову тули називає відмовою, а НЕ дрейфом формату", async () => {
    mocks.probeMcpTool.mockResolvedValue({
      ...HEALTHY_PROBE,
      isError: true,
      refusal: "Rate limit exceeded",
      payloadExtracted: false,
      payloadKeys: null,
      ordersCount: null,
    });

    const result = await diagnoseSilpo("u1");

    expect("verdict" in result && result.verdict).toContain("ВІДМОВИЛА");
    expect("verdict" in result && result.verdict).toContain(
      "Rate limit exceeded",
    );
  });

  it("нерозбірний payload називає дрейфом і показує ключі результату", async () => {
    mocks.probeMcpTool.mockResolvedValue({
      ...HEALTHY_PROBE,
      payloadExtracted: false,
      payloadKeys: null,
      ordersCount: null,
      resultKeys: ["content", "content:resource"],
    });

    const result = await diagnoseSilpo("u1");

    expect("verdict" in result && result.verdict).toContain(
      "справжній дрейф формату",
    );
    expect("verdict" in result && result.verdict).toContain("content:resource");
  });

  it("перейменоване поле «orders» видно окремо від решти дрейфу", async () => {
    mocks.probeMcpTool.mockResolvedValue({
      ...HEALTHY_PROBE,
      payloadKeys: ["success", "summary", "receipts", "meta"],
      ordersCount: null,
    });

    const result = await diagnoseSilpo("u1");

    expect("verdict" in result && result.verdict).toContain(
      "перейменування поля",
    );
    expect("verdict" in result && result.verdict).toContain("receipts");
  });

  // Звіт власника 2026-09-14: діагноз сказав «Все справне… у вибірці 1
  // замовлень» рівно тоді, коли синк падав. Причина — проба шукала
  // `limit: 1`, а синк шле 100. Діагностика, яка виконує НЕ те, що
  // зламалось, відводить від причини.
  it("проба шле ТОЙ САМИЙ розмір сторінки, що й синк", async () => {
    await diagnoseSilpo("u1");

    const limits = mocks.probeMcpTool.mock.calls.map((call: unknown[]) => {
      const opts = call[0] as { args?: { limit?: number } } | undefined;
      return opts?.args?.limit;
    });
    expect(limits).toContain(50);
  });

  it("дрібний запит проходить, справжній ні — вердикт називає саме межу", async () => {
    mocks.probeMcpTool
      .mockResolvedValueOnce(HEALTHY_PROBE)
      .mockResolvedValueOnce({
        ...HEALTHY_PROBE,
        payloadExtracted: false,
        payloadKeys: null,
        ordersCount: null,
        resultKeys: ["content", "content:text"],
      });

    const result = await diagnoseSilpo("u1");
    const verdict = "verdict" in result ? result.verdict : "";

    expect(verdict).toContain("1 замовлення");
    expect(verdict).toContain("50");
    expect(verdict).not.toContain("Все справне");
  });

  it("межу видно і коли великий запит дає відмову тули", async () => {
    mocks.probeMcpTool
      .mockResolvedValueOnce(HEALTHY_PROBE)
      .mockResolvedValueOnce({
        ...HEALTHY_PROBE,
        isError: true,
        refusal: "limit must be <= 20",
        payloadExtracted: false,
        ordersCount: null,
      });

    const result = await diagnoseSilpo("u1");
    const verdict = "verdict" in result ? result.verdict : "";

    expect(verdict).toContain("limit must be <= 20");
  });

  it("без підключення віддає unavailable, а не вигаданий діагноз", async () => {
    mocks.callWithFreshAccessToken.mockResolvedValue({
      ok: false,
      error: { kind: "not_connected", message: "Silpo is not connected" },
    });

    expect(await diagnoseSilpo("u1")).toEqual({ unavailable: "not_connected" });
  });

  it("збій tools/list не ховає пробу — обидва шари незалежні", async () => {
    mocks.listMcpTools.mockResolvedValue({
      ok: false,
      error: { kind: "upstream_unavailable", message: "boom" },
    });

    const result = await diagnoseSilpo("u1");

    expect(result).toMatchObject({
      toolsTotal: null,
      toolsError: { kind: "upstream_unavailable" },
      missingTools: [],
    });
    expect("onlineOrdersProbe" in result && result.onlineOrdersProbe).toEqual(
      HEALTHY_PROBE,
    );
  });
});
