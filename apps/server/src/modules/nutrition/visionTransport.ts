import { env } from "../../env/env.js";

/**
 * Транспорт і модель для зорових шляхів (`analyze-photo`, `refine-photo`).
 *
 * WHY окремий модуль. Ці два ендпоінти єдині в нутриції, що НЕ ходять через
 * `getLLMProvider()`: їм потрібен `image`-блок у тілі повідомлення, тож вони
 * кличуть `anthropicMessages` напряму. Через це `LLM_NUTRITION_PROVIDER` і
 * `OPENROUTER_NUTRITION_MODEL` — які вже давно тримають решту нутриції на
 * `gemini-2.5-flash-lite` — їх просто не стосуються, і зір лишався єдиним
 * шляхом на `claude-sonnet-4-6`.
 *
 * Рішення й модель тримаються разом навмисно: розійшовшись, вони дають той
 * самий половинчастий стан, від якого вже страждав чат — транспорт
 * повертається на Anthropic, а model-id лишається OpenRouter-івським, і кожен
 * запит отримує 404 на неіснуючу для Anthropic модель.
 */
export function visionViaOpenRouter(): boolean {
  return env.VISION_VIA_OPENROUTER && Boolean(env.OPENROUTER_API_KEY);
}

/** Model-id під обраний транспорт. */
export function visionModel(): string {
  return visionViaOpenRouter()
    ? env.OPENROUTER_VISION_MODEL
    : env.NUTRITION_MODEL;
}
