import type { AnthropicTool } from "./types.js";

/**
 * Anthropic Strict tool use decorator.
 *
 * `applyStrictMode(tool)` повертає **нову** копію tool definition зі
 * `strict: true` та рекурсивно проставленим `additionalProperties: false`
 * на кожному `type: "object"` schema (root + nested через `properties` чи
 * `items`). Не мутує input.
 *
 * Anthropic API ("Strict tool use",
 * https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use)
 * приймає `strict: true` тільки коли:
 *   1. Кожен nested `type: "object"` має `additionalProperties: false`.
 *   2. Schema лежить у підтримуваному JSON Schema subset.
 *
 * Цей декоратор робить п. 1 автоматично — domain tool defs у `toolDefs/*.ts`
 * лишаються чистими (без шуму `additionalProperties: false`), а strict-режим
 * вмикається/вимикається в одному місці (`tools.ts`).
 *
 * Контракт:
 *   - Сирі tool defs **НЕ мутуються** (можна спокійно реекспортувати масиви
 *     з `toolDefs/*.ts` далі — наприклад, у `coach.ts`, який не передає їх
 *     в Anthropic).
 *   - Tools, які вже мають `strict: false` (явний opt-out), не модифікуються —
 *     прохід обходить їх.
 *   - Schema-нормалізація йде через рекурсивний клон, тому жоден shared
 *     reference не «перетікає» між tools.
 */

const OBJECT_TYPE = "object";

export function applyStrictMode(tool: AnthropicTool): AnthropicTool {
  if (tool.strict === false) {
    return tool;
  }
  return {
    ...tool,
    strict: true,
    input_schema: addAdditionalPropertiesFalse(tool.input_schema),
  };
}

export function applyStrictModeToAll(tools: AnthropicTool[]): AnthropicTool[] {
  return tools.map(applyStrictMode);
}

/**
 * Recursively clone a JSON Schema fragment and ensure every `type: "object"`
 * has `additionalProperties: false`. Walks both `properties.*` (object members)
 * and `items` / `items[i]` (array element schemas). Pre-existing
 * `additionalProperties` (true / false / schema) is preserved on nested nodes
 * — we only ADD `additionalProperties: false` when missing on object schemas.
 */
function addAdditionalPropertiesFalse(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return walk(schema) as Record<string, unknown>;
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(walk);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const obj = node as Record<string, unknown>;
  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    cloned[key] = walk(value);
  }
  if (cloned["type"] === OBJECT_TYPE && !("additionalProperties" in cloned)) {
    cloned["additionalProperties"] = false;
  }
  return cloned;
}
