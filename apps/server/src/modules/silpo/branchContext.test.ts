import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callMcpTool: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("./mcpClient.js", () => ({
  callMcpTool: mocks.callMcpTool,
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn() },
}));

import {
  resolveBranchContext,
  __silpoBranchContextTestHooks,
} from "./branchContext.js";

beforeEach(() => {
  mocks.callMcpTool.mockReset();
  mocks.loggerWarn.mockReset();
  __silpoBranchContextTestHooks().clearCache();
});

const CART_CHAIN: Record<string, unknown> = {
  silpo_get_my_shopping_cart: {
    ok: true,
    data: { success: true, shoppingCartId: "cart-uuid-1" },
  },
  silpo_get_shopping_cart_by_id: {
    ok: true,
    data: {
      success: true,
      cart: {
        deliveryType: "DeliveryHome",
        shipments: [{ branchId: "branch-uuid-1" }],
      },
    },
  },
};

describe("resolveBranchContext", () => {
  it("щасливий шлях: кошик → cart_by_id → branchId + deliveryType, порожні timeslot-и", async () => {
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => CART_CHAIN[toolName],
    );

    const ctx = await resolveBranchContext("user-1", "token");

    expect(ctx).toEqual({
      ok: true,
      data: {
        branchId: "branch-uuid-1",
        deliveryType: "DeliveryHome",
        timeslotStart: "",
        timeslotEnd: "",
      },
    });
  });

  it("кешує контекст: другий виклик того ж користувача без нових MCP-викликів", async () => {
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => CART_CHAIN[toolName],
    );

    await resolveBranchContext("user-1", "token");
    const callsAfterFirst = mocks.callMcpTool.mock.calls.length;
    const second = await resolveBranchContext("user-1", "token");

    expect(second.ok).toBe(true);
    expect(mocks.callMcpTool.mock.calls.length).toBe(callsAfterFirst);
  });

  it("fallback: без кошика бере першу філію з silpo_list_branches + SelfPickup", async () => {
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => {
        if (toolName === "silpo_get_my_shopping_cart") {
          return { ok: true, data: { success: true } }; // без shoppingCartId
        }
        if (toolName === "silpo_list_branches") {
          return {
            ok: true,
            data: { success: true, branches: [{ branchId: "branch-uuid-2" }] },
          };
        }
        throw new Error(`unexpected tool: ${toolName}`);
      },
    );

    const ctx = await resolveBranchContext("user-1", "token");

    expect(ctx).toEqual({
      ok: true,
      data: {
        branchId: "branch-uuid-2",
        deliveryType: "SelfPickup",
        timeslotStart: "",
        timeslotEnd: "",
      },
    });
  });

  it("обидва шляхи мертві → ok:false + warn, без throw", async () => {
    mocks.callMcpTool.mockResolvedValue({
      ok: false,
      error: { kind: "upstream_unavailable", message: "down" },
    });

    const ctx = await resolveBranchContext("user-1", "token");

    expect(ctx.ok).toBe(false);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "silpo_branch_context_unavailable" }),
    );
  });

  // ── Стеля кешу (аудит 2026-09-16) ───────────────────────────────────────
  // TTL сам собою пам'ять не звільняє: протермінований запис лежав у `Map`,
  // доки той самий `userId` не прийде знову, а sweep-у тут немає. Без стелі
  // це монотонне зростання з кожним новим користувачем Сільпо.
  it("кеш не росте понад стелю при потоці нових користувачів", async () => {
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => CART_CHAIN[toolName],
    );

    for (let i = 0; i < 600; i++) {
      await resolveBranchContext(`user-${i}`, "token");
    }

    expect(__silpoBranchContextTestHooks().cacheSize()).toBeLessThanOrEqual(
      500,
    );
  });

  it("витісняє найстаріший запис, лишаючи найсвіжіший", async () => {
    mocks.callMcpTool.mockImplementation(
      async ({ toolName }: { toolName: string }) => CART_CHAIN[toolName],
    );

    for (let i = 0; i < 600; i++) {
      await resolveBranchContext(`user-${i}`, "token");
    }

    mocks.callMcpTool.mockClear();
    // Найсвіжіший лишився — попадання в кеш, апстрім не смикаємо.
    await resolveBranchContext("user-599", "token");
    expect(mocks.callMcpTool).not.toHaveBeenCalled();

    // Найстаріший витіснений — резолв іде наново.
    await resolveBranchContext("user-0", "token");
    expect(mocks.callMcpTool).toHaveBeenCalled();
  });
});
