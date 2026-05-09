import { describe, expect, it } from "vitest";
import { TOOLS } from "../tools.js";
import { applyStrictMode, applyStrictModeToAll } from "./strict.js";
import type { AnthropicTool } from "./types.js";

/**
 * Regression suite для `applyStrictMode` / `applyStrictModeToAll` + invariant
 * перевірки на агрегованому `TOOLS` exporto-вi (Anthropic Strict tool use).
 *
 * Якщо хтось додасть новий tool у `toolDefs/*.ts` зі складною nested-схемою,
 * ці тести впадуть, поки `applyStrictModeToAll` не покриє всі вкладені
 * `type: "object"` через `additionalProperties: false` — strict-режим Anthropic
 * відмовляє схему 400-кою, якщо хоч один nested object без цього поля.
 */

function objectsInSchema(
  schema: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj["type"] === "object") {
      out.push(obj);
    }
    for (const value of Object.values(obj)) {
      walk(value);
    }
  }
  walk(schema);
  return out;
}

describe("applyStrictMode (одиничний tool)", () => {
  it("додає `strict: true` без мутації input-у", () => {
    const tool: AnthropicTool = {
      name: "test_tool",
      description: "Test",
      input_schema: {
        type: "object",
        properties: { x: { type: "string" } },
        required: ["x"],
      },
    };
    const result = applyStrictMode(tool);
    expect(result.strict).toBe(true);
    expect(tool.strict).toBeUndefined();
    expect(tool.input_schema).not.toHaveProperty("additionalProperties");
  });

  it("ставить `additionalProperties: false` на root-об'єкті", () => {
    const tool: AnthropicTool = {
      name: "t",
      description: "d",
      input_schema: {
        type: "object",
        properties: { a: { type: "string" } },
      },
    };
    const result = applyStrictMode(tool);
    expect(result.input_schema["additionalProperties"]).toBe(false);
  });

  it("рекурсивно ставить `additionalProperties: false` на nested objects (через `properties`)", () => {
    const tool: AnthropicTool = {
      name: "t",
      description: "d",
      input_schema: {
        type: "object",
        properties: {
          inner: {
            type: "object",
            properties: { x: { type: "number" } },
          },
        },
      },
    };
    const result = applyStrictMode(tool);
    const inner = (
      result.input_schema["properties"] as Record<string, unknown>
    )["inner"] as Record<string, unknown>;
    expect(inner["additionalProperties"]).toBe(false);
  });

  it("рекурсивно ставить `additionalProperties: false` на nested objects через `items` array", () => {
    const tool: AnthropicTool = {
      name: "t",
      description: "d",
      input_schema: {
        type: "object",
        properties: {
          parts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category_id: { type: "string" },
                amount: { type: "number" },
              },
              required: ["category_id", "amount"],
            },
          },
        },
        required: ["parts"],
      },
    };
    const result = applyStrictMode(tool);
    const parts = (
      result.input_schema["properties"] as Record<string, unknown>
    )["parts"] as Record<string, unknown>;
    const items = parts["items"] as Record<string, unknown>;
    expect(items["additionalProperties"]).toBe(false);
  });

  it("respect-ить явне `strict: false` (opt-out не модифікується)", () => {
    const tool: AnthropicTool = {
      name: "skip",
      description: "skip",
      input_schema: { type: "object", properties: {} },
      strict: false,
    };
    const result = applyStrictMode(tool);
    expect(result).toBe(tool);
    expect(result.strict).toBe(false);
    expect(result.input_schema).not.toHaveProperty("additionalProperties");
  });

  it("preserve існуюче `additionalProperties` (не overwrite-ить з false)", () => {
    const tool: AnthropicTool = {
      name: "with_dict",
      description: "д",
      input_schema: {
        type: "object",
        properties: {
          metadata: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
      },
    };
    const result = applyStrictMode(tool);
    const metadata = (
      result.input_schema["properties"] as Record<string, unknown>
    )["metadata"] as Record<string, unknown>;
    expect(metadata["additionalProperties"]).toEqual({ type: "string" });
  });
});

describe("applyStrictModeToAll (масив)", () => {
  it("обгортає кожен tool у масиві", () => {
    const tools: AnthropicTool[] = [
      {
        name: "a",
        description: "a",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "b",
        description: "b",
        input_schema: { type: "object", properties: {} },
      },
    ];
    const result = applyStrictModeToAll(tools);
    expect(result).toHaveLength(2);
    for (const tool of result) {
      expect(tool.strict).toBe(true);
      expect(tool.input_schema["additionalProperties"]).toBe(false);
    }
  });

  it("не мутує input масив", () => {
    const tools: AnthropicTool[] = [
      {
        name: "t",
        description: "t",
        input_schema: { type: "object", properties: {} },
      },
    ];
    const snapshot = JSON.parse(JSON.stringify(tools));
    applyStrictModeToAll(tools);
    expect(JSON.parse(JSON.stringify(tools))).toEqual(snapshot);
  });
});

describe("TOOLS (агрегований Anthropic-payload)", () => {
  it("є непорожній", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
  });

  it("кожен tool має `strict: true` (Anthropic Strict tool use)", () => {
    for (const tool of TOOLS) {
      expect(tool.strict, `tool "${tool.name}" повинен мати strict: true`).toBe(
        true,
      );
    }
  });

  it('кожен `type: "object"` (root + nested) має `additionalProperties: false`', () => {
    for (const tool of TOOLS) {
      const objects = objectsInSchema(tool.input_schema);
      for (const obj of objects) {
        expect(
          obj["additionalProperties"],
          `tool "${tool.name}" має nested object без additionalProperties: ${JSON.stringify(
            obj,
          ).slice(0, 120)}`,
        ).toBe(false);
      }
    }
  });

  it('кожен `type: "object"` має `properties` (Anthropic вимагає для strict mode)', () => {
    for (const tool of TOOLS) {
      const objects = objectsInSchema(tool.input_schema);
      for (const obj of objects) {
        expect(
          obj["properties"],
          `tool "${tool.name}" має object без properties: ${JSON.stringify(obj).slice(0, 120)}`,
        ).toBeTypeOf("object");
      }
    }
  });

  it("input_schema root `type` завжди `object`", () => {
    for (const tool of TOOLS) {
      expect(tool.input_schema["type"]).toBe("object");
    }
  });
});
