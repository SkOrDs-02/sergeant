import { describe, expect, it } from "vitest";
import toolsListFixture from "./__fixtures__/tools-list.json";
import { McpToolsListSchema } from "./mcpClient.js";

/**
 * Contract-drift belt (spec § Рішення дизайну "Дрейф схеми tools —
 * контрактний пояс"): pins the exact tool names + shape we depend on so a
 * silent Silpo-side rename shows up as a CI failure instead of a runtime
 * surprise.
 *
 * `__fixtures__/tools-list.json` is a PLACEHOLDER until spike §0 runs
 * against the live `https://mcp.silpo.ua/mcp` endpoint (see the fixture's
 * own `_note` field) — this suite intentionally SKIPS until then rather
 * than asserting against invented data. Once the fixture is replaced with
 * a real capture, flip `_placeholder` to `false` (or delete the field) and
 * this test starts enforcing it.
 */
const isPlaceholderFixture =
  (toolsListFixture as { _placeholder?: boolean })._placeholder === true;

describe.skipIf(isPlaceholderFixture)(
  "silpo tools/list contract snapshot",
  () => {
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
      ]) {
        expect(names.has(required)).toBe(true);
      }
    });
  },
);

it("fixture is still a placeholder — remove this guard once spike §0 replaces it", () => {
  // Fails loudly (instead of silently skipping forever) the day someone
  // updates the fixture but forgets this file exists.
  expect(isPlaceholderFixture).toBe(true);
});
