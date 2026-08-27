import { describe, expect, it } from "vitest";

import { MEMORY_TOOLS } from "./memory.js";
import { TOOLS } from "../tools.js";
import type { AnthropicTool } from "./types.js";

/**
 * Канонічні категорії памʼяті. Свідомо продубльовані літералом, а не
 * імпортовані з `memory.ts`: тест має ловити мовчазний дрейф enum-а, а
 * імпорт із того ж модуля перевіряв би значення саме на себе.
 *
 * Другий бік дзеркала — `CATEGORY_META` у
 * `apps/web/src/core/profile/memoryBank.ts`. Розійдуться — записи осядуть у
 * групі з сирим ключем замість людської назви та іконки.
 */
const EXPECTED_CATEGORIES = [
  "allergy",
  "diet",
  "goal",
  "training",
  "health",
  "preference",
  "other",
];

function toolNamed(name: string): AnthropicTool {
  const tool = MEMORY_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`MEMORY_TOOLS не містить "${name}"`);
  return tool;
}

function propertyOf(
  tool: AnthropicTool,
  property: string,
): Record<string, unknown> {
  const properties = tool.input_schema["properties"] as
    Record<string, Record<string, unknown>> | undefined;
  const schema = properties?.[property];
  if (!schema) throw new Error(`${tool.name} не має поля "${property}"`);
  return schema;
}

describe("remember tool schema", () => {
  const remember = toolNamed("remember");

  // v18: до цього `category` була optional, і модель її здебільшого не
  // передавала — усе осідало в «Інше», а групування секції «Памʼять ШІ»
  // фактично не працювало.
  it("вимагає і fact, і category", () => {
    expect(remember.input_schema["required"]).toEqual(["fact", "category"]);
  });

  it("обмежує category канонічним enum-ом", () => {
    expect(propertyOf(remember, "category")["enum"]).toEqual(
      EXPECTED_CATEGORIES,
    );
  });

  // Без strict-режиму `required` для tool-а лишається проханням до моделі —
  // саме воно тут і не спрацювало.
  it("іде в strict-режимі", () => {
    expect(remember.strict).toBe(true);
  });

  it("просить один факт на виклик, а не склеєний абзац", () => {
    expect(remember.description).toMatch(/ОДИН факт/);
    expect(remember.description).toMatch(/кілька разів/);
  });
});

describe("Anthropic strict-tools budget", () => {
  // Anthropic ріже запит із 400, якщо strict-tools > 20. `validateToolRegistry`
  // у `tools.ts` кидає на старті, але той throw читається як «сервер не
  // піднявся»; тут видно, скільки саме слотів лишилось.
  it("тримається під лімітом у 20 strict-tools", () => {
    const strictCount = TOOLS.filter((tool) => tool.strict === true).length;
    expect(strictCount).toBeLessThanOrEqual(20);
  });
});
