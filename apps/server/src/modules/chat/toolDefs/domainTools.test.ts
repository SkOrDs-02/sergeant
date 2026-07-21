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

type ToolModule = {
  readonly label: string;
  readonly tools: readonly AnthropicTool[];
  readonly sentinelNames: readonly string[];
};

const DOMAIN_TOOL_MODULES: readonly ToolModule[] = [
  {
    label: "finyk",
    tools: FINYK_TOOLS,
    sentinelNames: [
      "change_category",
      "create_transaction",
      "delete_transaction",
      "import_monobank_range",
    ],
  },
  {
    label: "fizruk",
    tools: FIZRUK_TOOLS,
    sentinelNames: ["plan_workout", "log_set", "start_workout", "log_weight"],
  },
  {
    label: "routine",
    tools: ROUTINE_TOOLS,
    sentinelNames: [
      "mark_habit_done",
      "create_habit",
      "set_habit_schedule",
      "pause_habit",
    ],
  },
  {
    label: "nutrition",
    tools: NUTRITION_TOOLS,
    sentinelNames: [
      "log_water",
      "log_meal",
      "add_recipe",
      "plan_meals_for_day",
    ],
  },
  {
    label: "cross-module",
    tools: CROSS_MODULE_TOOLS,
    sentinelNames: ["morning_briefing", "get_daily_series", "compare_weeks"],
  },
  {
    label: "utility",
    tools: UTILITY_TOOLS,
    sentinelNames: ["calculate_1rm", "convert_units", "export_module_data"],
  },
  {
    label: "memory",
    tools: MEMORY_TOOLS,
    sentinelNames: ["remember", "forget", "my_profile", "recall_memory"],
  },
];

const QUERY_TOOL_MODULES: readonly ToolModule[] = [
  {
    label: "query-finyk",
    tools: QUERY_FINYK_TOOLS,
    sentinelNames: [
      "query_transactions",
      "aggregate_spending",
      "compare_periods",
    ],
  },
  {
    label: "query-fizruk",
    tools: QUERY_FIZRUK_TOOLS,
    sentinelNames: ["query_workouts", "exercise_progress", "training_stats"],
  },
  {
    label: "query-nutrition",
    tools: QUERY_NUTRITION_TOOLS,
    sentinelNames: ["query_nutrition", "nutrition_averages"],
  },
  {
    label: "query-routine",
    tools: QUERY_ROUTINE_TOOLS,
    sentinelNames: ["query_habits", "habit_correlation"],
  },
];

const ALL_TOOL_MODULES = [...DOMAIN_TOOL_MODULES, ...QUERY_TOOL_MODULES];

const getToolNames = (tools: readonly AnthropicTool[]): string[] =>
  tools.map((tool) => tool.name);

describe("chat domain tool definitions", () => {
  it.each(ALL_TOOL_MODULES)(
    "$label exposes the expected sentinel tools",
    ({ tools, sentinelNames }) => {
      const names = getToolNames(tools);

      for (const sentinelName of sentinelNames) {
        expect(names).toContain(sentinelName);
      }
    },
  );

  it.each(ALL_TOOL_MODULES)(
    "$label keeps every tool Anthropic-compatible",
    ({ tools }) => {
      expect(tools.length).toBeGreaterThan(0);

      for (const tool of tools) {
        const schema = tool.input_schema;
        const properties = schema["properties"];
        const required = schema["required"];

        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(tool.description.trim().length).toBeGreaterThan(20);
        expect(schema["type"]).toBe("object");
        expect(properties).toEqual(expect.any(Object));

        if (Array.isArray(required)) {
          for (const requiredProperty of required) {
            expect(properties).toHaveProperty(String(requiredProperty));
          }
        }
      }
    },
  );

  it("keeps tool names unique across owned toolDef modules", () => {
    const names = ALL_TOOL_MODULES.flatMap(({ tools }) => getToolNames(tools));

    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps read-only query tools out of strict mode", () => {
    for (const { tools } of QUERY_TOOL_MODULES) {
      for (const tool of tools) {
        expect(tool.strict).not.toBe(true);
        expect(tool.description.toLowerCase()).toContain("read-only");
      }
    }
  });
});
