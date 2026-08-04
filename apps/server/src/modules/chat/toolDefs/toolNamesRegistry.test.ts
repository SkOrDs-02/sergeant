/**
 * Parity gate for audit gap #2 (2026-08): the canonical HubChat tool-name
 * registry in `@sergeant/shared` (`packages/shared/src/hubchat/toolNames.ts`)
 * must stay byte-for-byte in sync with the tool names actually declared in
 * `toolDefs/*.ts` (and therefore offered to Anthropic via `../tools.ts`
 * `TOOLS`).
 *
 * This test is intentionally symmetric:
 *   - every name a `toolDefs/*.ts` module declares must exist in the
 *     matching registry group (catches "added a tool, forgot the registry");
 *   - every name the registry lists must exist in the matching toolDef
 *     module (catches "registered a tool name, never wired the toolDef" —
 *     which would otherwise silently promise a client executor nothing on
 *     the server ever asks the model to call).
 *
 * Add a new tool ⇒ this test fails until BOTH the registry group in
 * `packages/shared/src/hubchat/toolNames.ts` AND the `toolDefs/*.ts` entry
 * exist. The web side is expected to run an equivalent parity check against
 * its `chatActions/*.ts` dispatchers using the same registry import.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_HUBCHAT_TOOL_NAMES,
  CROSS_MODULE_TOOL_NAMES as REGISTRY_CROSS_MODULE,
  FINYK_TOOL_NAMES as REGISTRY_FINYK,
  FIZRUK_TOOL_NAMES as REGISTRY_FIZRUK,
  MEMORY_TOOL_NAMES as REGISTRY_MEMORY,
  NUTRITION_TOOL_NAMES as REGISTRY_NUTRITION,
  QUERY_FINYK_TOOL_NAMES as REGISTRY_QUERY_FINYK,
  QUERY_FIZRUK_TOOL_NAMES as REGISTRY_QUERY_FIZRUK,
  QUERY_NUTRITION_TOOL_NAMES as REGISTRY_QUERY_NUTRITION,
  QUERY_ROUTINE_TOOL_NAMES as REGISTRY_QUERY_ROUTINE,
  ROUTINE_TOOL_NAMES as REGISTRY_ROUTINE,
  UTILITY_TOOL_NAMES as REGISTRY_UTILITY,
} from "@sergeant/shared";

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
import { TOOLS } from "../tools.js";
import type { AnthropicTool } from "./types.js";

type NamedGroup = {
  readonly label: string;
  readonly toolDefNames: readonly string[];
  readonly registryNames: readonly string[];
};

const toNames = (tools: readonly AnthropicTool[]): string[] =>
  tools.map((tool) => tool.name);

const GROUPS: readonly NamedGroup[] = [
  {
    label: "finyk",
    toolDefNames: toNames(FINYK_TOOLS),
    registryNames: REGISTRY_FINYK,
  },
  {
    label: "queryFinyk",
    toolDefNames: toNames(QUERY_FINYK_TOOLS),
    registryNames: REGISTRY_QUERY_FINYK,
  },
  {
    label: "fizruk",
    toolDefNames: toNames(FIZRUK_TOOLS),
    registryNames: REGISTRY_FIZRUK,
  },
  {
    label: "queryFizruk",
    toolDefNames: toNames(QUERY_FIZRUK_TOOLS),
    registryNames: REGISTRY_QUERY_FIZRUK,
  },
  {
    label: "routine",
    toolDefNames: toNames(ROUTINE_TOOLS),
    registryNames: REGISTRY_ROUTINE,
  },
  {
    label: "queryRoutine",
    toolDefNames: toNames(QUERY_ROUTINE_TOOLS),
    registryNames: REGISTRY_QUERY_ROUTINE,
  },
  {
    label: "nutrition",
    toolDefNames: toNames(NUTRITION_TOOLS),
    registryNames: REGISTRY_NUTRITION,
  },
  {
    label: "queryNutrition",
    toolDefNames: toNames(QUERY_NUTRITION_TOOLS),
    registryNames: REGISTRY_QUERY_NUTRITION,
  },
  {
    label: "crossModule",
    toolDefNames: toNames(CROSS_MODULE_TOOLS),
    registryNames: REGISTRY_CROSS_MODULE,
  },
  {
    label: "utility",
    toolDefNames: toNames(UTILITY_TOOLS),
    registryNames: REGISTRY_UTILITY,
  },
  {
    label: "memory",
    toolDefNames: toNames(MEMORY_TOOLS),
    registryNames: REGISTRY_MEMORY,
  },
];

describe("HubChat tool-name registry parity (@sergeant/shared/hubchat/toolNames)", () => {
  it.each(GROUPS)(
    "$label: every toolDef name is registered",
    ({ toolDefNames, registryNames }) => {
      const registrySet = new Set(registryNames);
      for (const name of toolDefNames) {
        expect(
          registrySet.has(name),
          `toolDefs declares "${name}" but it is missing from the matching ` +
            "group in packages/shared/src/hubchat/toolNames.ts",
        ).toBe(true);
      }
    },
  );

  it.each(GROUPS)(
    "$label: every registered name has a toolDef",
    ({ toolDefNames, registryNames }) => {
      const toolDefSet = new Set(toolDefNames);
      for (const name of registryNames) {
        expect(
          toolDefSet.has(name),
          `registry lists "${name}" but no toolDefs/*.ts module for this ` +
            "group declares a tool with that name",
        ).toBe(true);
      }
    },
  );

  it("registry groups have no cross-group duplicates", () => {
    const seen = new Set<string>();
    for (const name of ALL_HUBCHAT_TOOL_NAMES) {
      expect(seen.has(name), `duplicate registry tool name: ${name}`).toBe(
        false,
      );
      seen.add(name);
    }
  });

  it("the flattened registry exactly matches the live Anthropic TOOLS payload (set equality)", () => {
    const liveNameList = toNames(TOOLS);
    const liveNames = new Set(liveNameList);
    const registryNames = new Set<string>(ALL_HUBCHAT_TOOL_NAMES);

    // Set-рівність не ловить дублікати всередині TOOLS — Anthropic їх відхиляє.
    expect(liveNames.size, "TOOLS оголошує дубльовані tool-імена").toBe(
      liveNameList.length,
    );

    for (const name of liveNames) {
      expect(
        registryNames.has(name),
        `TOOLS exposes "${name}" to Anthropic but it is absent from ` +
          "ALL_HUBCHAT_TOOL_NAMES",
      ).toBe(true);
    }
    for (const name of registryNames) {
      expect(
        liveNames.has(name),
        `registry lists "${name}" but it never reaches the live TOOLS array`,
      ).toBe(true);
    }
    expect(registryNames.size).toBe(liveNames.size);
  });
});
