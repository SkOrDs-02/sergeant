import { describe, expect, it } from "vitest";
import toolsListFixture from "./__fixtures__/tools-list.json";
import { McpToolsListSchema } from "./mcpClient.js";
import { diffToolContract } from "./toolContract.js";

/**
 * Contract-drift belt (spec § Рішення дизайну "Дрейф схеми tools —
 * контрактний пояс"): pins the exact tool names + shape we depend on so a
 * silent Silpo-side rename shows up as a CI failure instead of a runtime
 * surprise.
 *
 * `__fixtures__/tools-list.json` — РЕАЛЬНИЙ капчур `tools/list` зі спайку
 * §0 (2026-08-18, serverInfo `silpo-mcp-service 1.108.0`), без jsonrpc-
 * обгортки. Персональних даних не містить (лише описи 39 tools). Щоб
 * оновити після дрейфу Сільпо — перезняти живим викликом `tools/list` і
 * перегенерувати снапшот (`vitest -u`).
 */
describe("silpo tools/list contract snapshot", () => {
  it("matches the pinned tools/list fixture", () => {
    const parsed = McpToolsListSchema.parse(toolsListFixture);
    expect(parsed).toMatchSnapshot();
  });

  it("still exposes the tools this integration depends on", () => {
    const names = new Set(
      McpToolsListSchema.parse(toolsListFixture).tools.map((t) => t.name),
    );
    for (const required of [
      "silpo_get_my_offline_orders",
      "silpo_get_my_online_orders",
      "silpo_find_products_batch",
      "silpo_get_product_details",
      "silpo_get_my_shopping_cart",
      "silpo_get_shopping_cart_by_id",
      "silpo_list_branches",
      "silpo_get_loyalty_info",
      "silpo_get_my_coupons",
      "silpo_get_coupon_details",
      "silpo_get_my_promos",
      "silpo_get_promo_codes",
      "silpo_get_my_certificates",
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });

  it("offline orders tool still requires the branch-context arguments our sync supplies", () => {
    const tool = McpToolsListSchema.parse(toolsListFixture).tools.find(
      (t) => t.name === "silpo_get_my_offline_orders",
    ) as { inputSchema?: { required?: string[] } } | undefined;
    expect(tool?.inputSchema?.required ?? []).toEqual([
      "branchId",
      "deliveryType",
      "timeslotStart",
      "timeslotEnd",
    ]);
  });

  // Друга половина пояса. Снапшот вище звіряє код із ЗАПИСОМ; цей тест
  // звіряє з тим самим записом ТАБЛИЦЮ ОЧІКУВАНЬ, якою в рантаймі
  // перевіряється ЖИВИЙ сервер (`toolContract.ts`).
  //
  // Без нього таблиця могла б розійтися з фікстурою тихо — і рантайм-звірка
  // почала б рапортувати дрейф там, де його немає, або мовчати там, де він
  // є. Тобто зламався б сам детектор, і помітили б це найпізніше.
  it("таблиця очікувань узгоджена із зафіксованою специфікацією", () => {
    const tools = McpToolsListSchema.parse(toolsListFixture);

    expect(diffToolContract(tools)).toEqual([]);
  });

  it("детектор реагує на знижену стелю — саме той випадок, що стався 2026-09-14", () => {
    const tools = McpToolsListSchema.parse(toolsListFixture);
    // Відтворюємо зміну Сільпо: максимум `limit` онлайн-тули 100 → 10.
    const lowered = {
      tools: tools.tools.map((tool) =>
        tool.name === "silpo_get_my_online_orders"
          ? {
              ...tool,
              inputSchema: {
                ...(tool as { inputSchema?: Record<string, unknown> })
                  .inputSchema,
                properties: { limit: { minimum: 1, maximum: 10 }, offset: {} },
              },
            }
          : tool,
      ),
    };

    const drift = diffToolContract(lowered as never);

    expect(drift).toHaveLength(1);
    expect(drift[0]).toContain("стеля тепер 10");
  });

  it("детектор реагує на НОВИЙ обовʼязковий аргумент", () => {
    const tools = McpToolsListSchema.parse(toolsListFixture);
    const withNewRequired = {
      tools: tools.tools.map((tool) =>
        tool.name === "silpo_get_my_online_orders"
          ? {
              ...tool,
              inputSchema: {
                properties: { limit: { maximum: 100 }, offset: {} },
                required: ["storeId"],
              },
            }
          : tool,
      ),
    };

    const drift = diffToolContract(withNewRequired as never);

    expect(drift[0]).toContain("storeId");
  });
});
