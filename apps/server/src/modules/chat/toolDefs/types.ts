/**
 * Anthropic tool-definition типи для `apps/server/src/modules/chat`.
 *
 * `strict` — opt-in flag з Anthropic API ("Strict tool use"), що вмикає
 * grammar-constrained sampling: модель НЕ може згенерувати invalid JSON Schema
 * output для `tool_use`. Усуває retry через зіпсований JSON / некоректні типи
 * (`"2"` замість `2`) і покриває кейс TR-2026-05 §9 (issue #261). Anthropic
 * вимагає `additionalProperties: false` на кожному nested `type: "object"`
 * schema разом зі `strict: true`.
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict?: boolean;
}
