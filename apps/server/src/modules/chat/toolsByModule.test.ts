/**
 * Status: Active
 *
 * Звуження реєстру tools під увімкнені модулі — див.
 * `filterToolsByActiveModules` у `tools.ts`.
 */
import { describe, expect, it } from "vitest";
import { TOOLS, filterToolsByActiveModules } from "./tools.js";
import { NUTRITION_TOOLS } from "./toolDefs/nutrition.js";
import { FINYK_TOOLS } from "./toolDefs/finyk.js";
import { UTILITY_TOOLS } from "./toolDefs/utility.js";
import { MEMORY_TOOLS } from "./toolDefs/memory.js";
import { CROSS_MODULE_TOOLS } from "./toolDefs/crossModule.js";

const names = (tools: ReadonlyArray<{ name: string }>) =>
  new Set(tools.map((t) => t.name));

describe("filterToolsByActiveModules", () => {
  it("keeps the full registry when the choice is unknown or empty", () => {
    // `null` — онбординг не пройдено; `[]` — «вимкнула все». В обох
    // випадках здогад дорожчий за зайві токени.
    expect(filterToolsByActiveModules(TOOLS, null)).toBe(TOOLS);
    expect(filterToolsByActiveModules(TOOLS, [])).toBe(TOOLS);
    expect(
      filterToolsByActiveModules(TOOLS, [
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
      ]),
    ).toBe(TOOLS);
  });

  it("drops the domain tools of modules the user did not enable", () => {
    const kept = names(filterToolsByActiveModules(TOOLS, ["finyk"]));

    for (const t of FINYK_TOOLS) expect(kept.has(t.name)).toBe(true);
    for (const t of NUTRITION_TOOLS) expect(kept.has(t.name)).toBe(false);
  });

  it("never drops cross-module, utility or memory tools", () => {
    const kept = names(filterToolsByActiveModules(TOOLS, ["finyk"]));

    for (const t of [
      ...CROSS_MODULE_TOOLS,
      ...UTILITY_TOOLS,
      ...MEMORY_TOOLS,
    ]) {
      expect(kept.has(t.name)).toBe(true);
    }
  });

  it("cuts a measurable slice of the payload for a single-module user", () => {
    const full = JSON.stringify(TOOLS).length;
    const oneModule = JSON.stringify(
      filterToolsByActiveModules(TOOLS, ["finyk"]),
    ).length;

    // Не точне число (реєстр росте) — лише що економія суттєва, а не
    // косметична: заради косметики цей фільтр не вартий свого ризику.
    expect(oneModule).toBeLessThan(full * 0.75);
  });
});
