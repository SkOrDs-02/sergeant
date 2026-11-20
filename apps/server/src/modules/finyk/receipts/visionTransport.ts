import { env } from "../../../env.js";
import { firstTurnReasoningFields } from "../../chat/chatReasoning.js";

/**
 * Транспорт і модель для `POST /api/finyk/receipts/analyze`.
 *
 * Дзеркалить `modules/nutrition/visionTransport.ts` (WHY окремий модуль:
 * той самий — обидва зорові шляхи мусять уміти вимикатись незалежно один
 * від одного), але на ВЛАСНІЙ env-парі (`LLM_RECEIPT_PROVIDER` /
 * `OPENROUTER_RECEIPT_MODEL`, `env/aiRoutingEnv.ts`) — розділяти прапорці
 * означає, що відкат зору nutrition чи чату не чіпає чек-скан, і навпаки.
 *
 * `LLM_RECEIPT_PROVIDER=openrouter` (дефолт) вмикає OpenRouter лише коли
 * `OPENROUTER_API_KEY` реально задано — інакше `visionClient.ts` тихо
 * деградує до прямого Anthropic (`allowOpenRouter: false` у
 * `anthropicMessages`), той самий "деградуй до робочого транспорту, а не
 * віддай 401" принцип, що `lib/anthropic.ts#pickTransport`.
 * `LLM_RECEIPT_PROVIDER=stub` обробляється в `visionClient.ts` ДО
 * виклику транспорту (без мережі взагалі) — сюди він не доходить.
 */
export function receiptVisionViaOpenRouter(): boolean {
  return (
    env.LLM_RECEIPT_PROVIDER === "openrouter" && Boolean(env.OPENROUTER_API_KEY)
  );
}

/**
 * Модель для прямого Anthropic-шляху (`LLM_RECEIPT_PROVIDER=anthropic`
 * АБО OpenRouter-ключ відсутній). Той самий дешевий vision-здатний id, що
 * вже в проді для mono-збагачення (`MONO_ENRICHMENT_MODEL`) — чек-скан не
 * потребує Sonnet-рівня міркування, лише читання цифр з фото.
 */
export const RECEIPT_ANTHROPIC_FALLBACK_MODEL = "claude-haiku-4-5-20251001";

export function receiptVisionModel(): string {
  return receiptVisionViaOpenRouter()
    ? env.OPENROUTER_RECEIPT_MODEL
    : RECEIPT_ANTHROPIC_FALLBACK_MODEL;
}

/**
 * Моделі, для яких `thinking: {type: "disabled"}` перевірено наживо через
 * `/messages` шлюзу (2026-11-19): Luna і Haiku 5.5 міряли з ним на зоровому
 * стенді, `gemini-2.5-flash-lite` (модель відкату) відповіла 200 на пробний
 * виклик. Моделі з обовʼязковими міркуваннями (`google/gemini-3.5-flash-lite`,
 * `google/gemini-3.7-flash`) на нього відповідають 400 «Reasoning is
 * mandatory for this endpoint and cannot be disabled».
 *
 * AI-DANGER: тому `none` шлеться лише моделям зі списку. Нова модель через
 * env отримує запит без поля (глибину ставить шлюз): повільніше, але не
 * зламано. Додаєш модель сюди — спершу живий виклик із полем.
 */
export const RECEIPT_REASONING_NONE_VERIFIED_MODELS: ReadonlySet<string> =
  new Set([
    "openai/gpt-6-luna",
    "anthropic/claude-haiku-5.5",
    "google/gemini-2.5-flash-lite",
  ]);

/**
 * Поле глибини міркувань для тіла чека й виписки
 * (`RECEIPT_VISION_REASONING_EFFORT`). Граматика — `firstTurnReasoningFields`
 * першого ходу чату (`none` → `thinking: {type: "disabled"}`, решта →
 * `output_config.effort`), лише через шлюз: прямий Anthropic-фолбек
 * (`claude-haiku-4-5`) без явного `thinking` не міркує, а
 * `output_config.effort` у нього дав би 400.
 */
export function receiptVisionReasoningFields(
  model: string,
): Record<string, unknown> {
  if (!receiptVisionViaOpenRouter()) return {};
  const effort = env.RECEIPT_VISION_REASONING_EFFORT;
  if (effort === "default") return {};
  if (effort === "none" && !RECEIPT_REASONING_NONE_VERIFIED_MODELS.has(model)) {
    return {};
  }
  return firstTurnReasoningFields(effort);
}
