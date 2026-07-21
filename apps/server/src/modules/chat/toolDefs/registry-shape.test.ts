import { describe, expect, it } from "vitest";

import { CROSS_MODULE_TOOLS } from "./crossModule.js";
import { FINYK_TOOLS } from "./finyk.js";
import { FIZRUK_TOOLS } from "./fizruk.js";
import { MEMORY_TOOLS } from "./memory.js";
import { NUTRITION_TOOLS } from "./nutrition.js";
import { QUERY_FINYK_TOOLS } from "./queryFinyk.js";
import { QUERY_FIZRUK_TOOLS } from "./queryFizruk.js";
import { QUERY_NUTRITION_TOOLS } from "./queryNutrition.js";
import { QUERY_ROUTINE_TOOLS } from "./queryRoutine.js";
import { ROUTINE_TOOLS } from "./routine.js";
import { UTILITY_TOOLS } from "./utility.js";
import type { AnthropicTool } from "./types.js";

const GROUPS = [
  ["crossModule", CROSS_MODULE_TOOLS],
  ["finyk", FINYK_TOOLS],
  ["fizruk", FIZRUK_TOOLS],
  ["memory", MEMORY_TOOLS],
  ["nutrition", NUTRITION_TOOLS],
  ["queryFinyk", QUERY_FINYK_TOOLS],
  ["queryFizruk", QUERY_FIZRUK_TOOLS],
  ["queryNutrition", QUERY_NUTRITION_TOOLS],
  ["queryRoutine", QUERY_ROUTINE_TOOLS],
  ["routine", ROUTINE_TOOLS],
  ["utility", UTILITY_TOOLS],
] as const satisfies ReadonlyArray<readonly [string, readonly AnthropicTool[]]>;

function allTools(): AnthropicTool[] {
  return GROUPS.flatMap(([, tools]) => [...tools]);
}

function schemaFor(tool: AnthropicTool): Record<string, unknown> {
  return tool.input_schema;
}

describe("chat toolDefs registry shape", () => {
  it("keeps exported tool names unique across all owned toolDef modules", () => {
    const names = allTools().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "create_transaction",
        "log_set",
        "log_meal",
        "mark_habit_done",
        "recall_memory",
        "query_transactions",
        "get_daily_series",
      ]),
    );
  });

  it("exports object input schemas with a properties object", () => {
    for (const [groupName, tools] of GROUPS) {
      expect(tools.length, `${groupName} has tools`).toBeGreaterThan(0);
      for (const tool of tools) {
        const schema = schemaFor(tool);
        expect(tool.name, `${groupName} tool name`).toMatch(
          /^[a-z][a-z0-9_]*$/,
        );
        expect(tool.description, `${tool.name} description`).not.toHaveLength(
          0,
        );
        expect(schema["type"], `${tool.name} schema type`).toBe("object");
        expect(schema["properties"], `${tool.name} schema properties`).toEqual(
          expect.any(Object),
        );
      }
    }
  });

  it("preserves read-only query tools as non-strict to stay under Anthropic strict-tool limits", () => {
    const queryTools = [
      ...QUERY_FINYK_TOOLS,
      ...QUERY_FIZRUK_TOOLS,
      ...QUERY_NUTRITION_TOOLS,
      ...QUERY_ROUTINE_TOOLS,
    ];

    expect(queryTools.map((tool) => tool.name)).toEqual([
      "query_transactions",
      "aggregate_spending",
      "compare_periods",
      "query_workouts",
      "exercise_progress",
      "training_stats",
      "query_nutrition",
      "nutrition_averages",
      "query_habits",
      "habit_correlation",
    ]);
    expect(queryTools.every((tool) => tool.strict !== true)).toBe(true);
  });
});
