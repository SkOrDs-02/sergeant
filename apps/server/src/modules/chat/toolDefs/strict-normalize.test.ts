import { describe, expect, it } from "vitest";
import { TOOLS } from "../tools.js";
import { normalizeStrictTools } from "./strict.js";
import type { AnthropicTool } from "./types.js";

function objectSchemas(
  schema: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj["type"] === "object") out.push(obj);
    for (const value of Object.values(obj)) walk(value);
  };
  walk(schema);
  return out;
}

function optionalParameterCount(schema: Record<string, unknown>): number {
  let count = 0;

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;

    if (
      obj["type"] === "object" &&
      obj["properties"] !== null &&
      typeof obj["properties"] === "object" &&
      !Array.isArray(obj["properties"])
    ) {
      const required = new Set(
        Array.isArray(obj["required"]) ? obj["required"] : [],
      );
      for (const [key, value] of Object.entries(
        obj["properties"] as Record<string, unknown>,
      )) {
        if (!required.has(key)) count += 1;
        walk(value);
      }
    }

    if (obj["type"] === "array") walk(obj["items"]);
  };

  walk(schema);
  return count;
}

describe("normalizeStrictTools", () => {
  it("normalizes only tools that explicitly opted into strict mode", () => {
    const tools: AnthropicTool[] = [
      {
        name: "strict_tool",
        description: "strict",
        strict: true,
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "regular_tool",
        description: "regular",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const result = normalizeStrictTools(tools);

    expect(result[0]!.strict).toBe(true);
    expect(result[0]!.input_schema["additionalProperties"]).toBe(false);
    expect(result[1]).toBe(tools[1]);
    expect(result[1]!.strict).toBeUndefined();
    expect(result[1]!.input_schema).not.toHaveProperty("additionalProperties");
  });

  it("does not mutate the input array", () => {
    const tools: AnthropicTool[] = [
      {
        name: "strict_tool",
        description: "strict",
        strict: true,
        input_schema: { type: "object", properties: {} },
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(tools));

    normalizeStrictTools(tools);

    expect(JSON.parse(JSON.stringify(tools))).toEqual(snapshot);
  });
});

describe("TOOLS strict-mode Anthropic contract", () => {
  it("keeps strict tools under Anthropic's 20-tool cap", () => {
    const strictTools = TOOLS.filter((tool) => tool.strict === true);

    expect(
      strictTools.length,
      `strict tools (${strictTools.length}): ${strictTools
        .map((tool) => tool.name)
        .join(", ")}`,
    ).toBeLessThanOrEqual(20);
  });

  it("keeps strict optional parameters within Anthropic's grammar budget", () => {
    const strictTools = TOOLS.filter((tool) => tool.strict === true);
    const total = strictTools.reduce(
      (sum, tool) => sum + optionalParameterCount(tool.input_schema),
      0,
    );

    expect(
      total,
      strictTools
        .map(
          (tool) => `${tool.name}:${optionalParameterCount(tool.input_schema)}`,
        )
        .join(", "),
    ).toBeLessThanOrEqual(24);
  });

  it("sets additionalProperties=false on every strict object schema", () => {
    for (const tool of TOOLS.filter((item) => item.strict === true)) {
      for (const schema of objectSchemas(tool.input_schema)) {
        expect(
          schema["additionalProperties"],
          `strict tool "${tool.name}" has an object schema without additionalProperties=false: ${JSON.stringify(
            schema,
          ).slice(0, 160)}`,
        ).toBe(false);
      }
    }
  });
});
