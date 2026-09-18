import { describe, expect, it } from "vitest";
import {
  ALL_HUBCHAT_TOOL_NAMES,
  CROSS_MODULE_TOOL_NAMES,
  FINYK_TOOL_NAMES,
  FIZRUK_TOOL_NAMES,
  HUBCHAT_TOOL_NAME_SET,
  MEMORY_TOOL_NAMES,
  NUTRITION_TOOL_NAMES,
  QUERY_FINYK_TOOL_NAMES,
  QUERY_FIZRUK_TOOL_NAMES,
  QUERY_NUTRITION_TOOL_NAMES,
  QUERY_ROUTINE_TOOL_NAMES,
  ROUTINE_TOOL_NAMES,
  UTILITY_TOOL_NAMES,
  isHubChatToolName,
} from "./toolNames";

// Order mirrors `ALL_HUBCHAT_TOOL_NAMES` concatenation order in
// `toolNames.ts` (which mirrors `apps/server/.../chat/tools.ts` import
// order) — the exact-concatenation test below is order-sensitive.
const GROUPS = [
  FINYK_TOOL_NAMES,
  QUERY_FINYK_TOOL_NAMES,
  ROUTINE_TOOL_NAMES,
  QUERY_ROUTINE_TOOL_NAMES,
  FIZRUK_TOOL_NAMES,
  QUERY_FIZRUK_TOOL_NAMES,
  NUTRITION_TOOL_NAMES,
  QUERY_NUTRITION_TOOL_NAMES,
  CROSS_MODULE_TOOL_NAMES,
  UTILITY_TOOL_NAMES,
  MEMORY_TOOL_NAMES,
];

describe("hubchat/toolNames registry", () => {
  it("has no duplicate names across any group", () => {
    const flat = GROUPS.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(ALL_HUBCHAT_TOOL_NAMES.length);
  });

  it("ALL_HUBCHAT_TOOL_NAMES is the exact concatenation of every group", () => {
    expect(ALL_HUBCHAT_TOOL_NAMES).toEqual(GROUPS.flat());
  });

  it("every name is snake_case (matches Anthropic tool-name schema constraint)", () => {
    for (const name of ALL_HUBCHAT_TOOL_NAMES) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("HUBCHAT_TOOL_NAME_SET mirrors ALL_HUBCHAT_TOOL_NAMES", () => {
    expect(HUBCHAT_TOOL_NAME_SET.size).toBe(ALL_HUBCHAT_TOOL_NAMES.length);
    for (const name of ALL_HUBCHAT_TOOL_NAMES) {
      expect(HUBCHAT_TOOL_NAME_SET.has(name)).toBe(true);
    }
  });

  it("isHubChatToolName narrows correctly", () => {
    expect(isHubChatToolName("create_transaction")).toBe(true);
    expect(isHubChatToolName("not_a_real_tool")).toBe(false);
  });

  it("is non-empty (sanity — registry should never accidentally go blank)", () => {
    expect(ALL_HUBCHAT_TOOL_NAMES.length).toBeGreaterThan(0);
  });
});
