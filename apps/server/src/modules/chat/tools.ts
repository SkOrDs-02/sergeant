/**
 * Anthropic tool-use definitions + system-prompt префікс для `/api/chat`.
 *
 * Tool-дефініції розбиті по доменних файлах у `toolDefs/`, щоб кожен домен
 * можна було редагувати незалежно. Цей файл збирає їх у єдиний масив `TOOLS`
 * і реекспортує `SYSTEM_PREFIX` — публічний контракт, який імпортує `chat.ts`.
 *
 * Всі tool-результати виконуються клієнтом, сервер лише пересилає `tool_use`-
 * блоки від моделі й отримує назад `tool_results` — тому змінювати сигнатури
 * tools треба синхронно з frontend-виконавцями (`src/core/lib/hubChatActions.ts`).
 *
 * INCIDENT 2026-05-16: `applyStrictModeToAll` (PR 830c1342) обгортав весь
 * масив у Anthropic Strict tool use. Anthropic API має жорсткий ліміт
 * **20 strict tools на запит**, а в нас 66 — тож кожен `/api/chat` падав
 * із 400 `Too many strict tools (66)`. Unit-тести верифікували `strict: true`
 * на кожному tool, але не били реальний Anthropic — регресія пройшла повз.
 * Strict-режим знятий до того моменту, як ми переробимо стратегію
 * (opt-in per-tool на ≤20 high-value tools, або waivers від Anthropic).
 */

export type { AnthropicTool } from "./toolDefs/types.js";

import { FINYK_TOOLS } from "./toolDefs/finyk.js";
import { FIZRUK_TOOLS } from "./toolDefs/fizruk.js";
import { ROUTINE_TOOLS } from "./toolDefs/routine.js";
import { NUTRITION_TOOLS } from "./toolDefs/nutrition.js";
import { CROSS_MODULE_TOOLS } from "./toolDefs/crossModule.js";
import { UTILITY_TOOLS } from "./toolDefs/utility.js";
import { MEMORY_TOOLS } from "./toolDefs/memory.js";

import type { AnthropicTool } from "./toolDefs/types.js";

export const TOOLS: AnthropicTool[] = [
  ...FINYK_TOOLS,
  ...ROUTINE_TOOLS,
  ...FIZRUK_TOOLS,
  ...NUTRITION_TOOLS,
  ...CROSS_MODULE_TOOLS,
  ...UTILITY_TOOLS,
  ...MEMORY_TOOLS,
];

/**
 * Validate tool registry at startup:
 * - Tool names are unique
 * - Strict tools ≤ 20 (Anthropic limit)
 * - Required fields exist (name, description, input_schema)
 */
function validateToolRegistry(tools: AnthropicTool[]): void {
  const names = new Set<string>();
  let strictCount = 0;

  for (const tool of tools) {
    // Check required fields
    if (!tool.name) {
      throw new Error("Tool missing name");
    }
    if (!tool.description) {
      throw new Error(`Tool ${tool.name} missing description`);
    }
    if (!tool.input_schema || typeof tool.input_schema !== "object") {
      throw new Error(`Tool ${tool.name} missing input_schema`);
    }

    // Check uniqueness
    if (names.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    names.add(tool.name);

    // Count strict tools
    if (tool.strict) {
      strictCount++;
    }
  }

  if (strictCount > 20) {
    throw new Error(
      `Too many strict tools (${strictCount}). Anthropic API limit is 20. ` +
        "Remove strict:true from some tools or implement tool subset strategy.",
    );
  }

  console.log(
    `[chat/tools] Registry validated: ${tools.length} tools, ${strictCount} strict`,
  );
}

// Run validation on module load
validateToolRegistry(TOOLS);

export {
  SYSTEM_PREFIX,
  SYSTEM_PROMPT_VERSION,
} from "./toolDefs/systemPrompt.js";
