import { describe, expect, it } from "vitest";
import toolsListFixture from "./__fixtures__/tools-list.json";
import { McpToolsListSchema } from "./mcpClient.js";

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
});
