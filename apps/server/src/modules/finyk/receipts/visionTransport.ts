import { env } from "../../../env.js";

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
