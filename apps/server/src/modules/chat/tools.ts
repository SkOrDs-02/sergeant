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
 * `applyStrictModeToAll` обгортає весь масив у Anthropic Strict tool use —
 * grammar-constrained sampling гарантує, що `tool_use.input` від моделі завжди
 * матчить наш JSON Schema. Це усуває retry через invalid JSON (TR-2026-05 §9,
 * issue #261). Сирі domain-арeі залишаються без `strict`/`additionalProperties`,
 * щоб одна точка вмикала/вимикала режим (toggle тут, не в 8 файлах).
 */

export type { AnthropicTool } from "./toolDefs/types.js";

import { FINYK_TOOLS } from "./toolDefs/finyk.js";
import { FIZRUK_TOOLS } from "./toolDefs/fizruk.js";
import { ROUTINE_TOOLS } from "./toolDefs/routine.js";
import { NUTRITION_TOOLS } from "./toolDefs/nutrition.js";
import { CROSS_MODULE_TOOLS } from "./toolDefs/crossModule.js";
import { UTILITY_TOOLS } from "./toolDefs/utility.js";
import { MEMORY_TOOLS } from "./toolDefs/memory.js";
import { applyStrictModeToAll } from "./toolDefs/strict.js";

import type { AnthropicTool } from "./toolDefs/types.js";

export const TOOLS: AnthropicTool[] = applyStrictModeToAll([
  ...FINYK_TOOLS,
  ...ROUTINE_TOOLS,
  ...FIZRUK_TOOLS,
  ...NUTRITION_TOOLS,
  ...CROSS_MODULE_TOOLS,
  ...UTILITY_TOOLS,
  ...MEMORY_TOOLS,
]);

export {
  SYSTEM_PREFIX,
  SYSTEM_PROMPT_VERSION,
} from "./toolDefs/systemPrompt.js";
