import { env } from "../../env.js";
import type {
  ChatFirstTurnReasoningEffort,
  ChatSynthesisPremiumReasoningEffort,
} from "../../env/aiRoutingEnv.js";
import { chatViaOpenRouter } from "../../env/chatModels.js";
import type { ProTier } from "./aiQuotaTierModels.js";

/**
 * Глибина міркувань першого ходу чату як поля тіла запиту.
 *
 * Перший хід ходить на Anthropic-сумісний `/api/v1/messages` шлюзу
 * OpenRouter (`lib/anthropic.ts`), а не на chat-completions. Поля
 * `reasoning` (ним користується `OpenRouterProvider`) у цього ендпоінта
 * немає. Шлюз приймає рідну граматику Anthropic і сам перекладає її в
 * уніфікований `reasoning` для будь-якої моделі, не лише Claude
 * (документація OpenRouter, «Reasoning with the Anthropic Messages API»):
 *
 *   `output_config: { effort }`        → `reasoning: { effort }`
 *   `thinking: { type: "disabled" }`   → `reasoning: { enabled: false }`
 *
 * Звідси й переклад нижче: `none` вимикає міркування, решта йде в
 * `output_config.effort`. Модель із обовʼязковими міркуваннями
 * (`google/gemini-3.7-flash`: `mandatory: true`, рівні `high|medium|low`
 * за `GET /api/v1/models` на 2026-11-18) вимкнення не прийме — це
 * властивість моделі, і ми її не маскуємо.
 *
 * Чиста функція окремо від гейту: стенди `tool-selection-eval.ts` і
 * `stream-check.ts` ходять у шлюз напряму й мають слати рівно ту саму форму.
 */
export function firstTurnReasoningFields(
  effort: ChatFirstTurnReasoningEffort | undefined,
): Record<string, unknown> {
  if (!effort) return {};
  if (effort === "none") return { thinking: { type: "disabled" } };
  return { output_config: { effort } };
}

/**
 * Поля для `firstTurnPayload` у `chat.ts`. Лише на шлюзі: прямий Anthropic
 * (`CHAT_VIA_OPENROUTER=false`) з `claude-haiku-4-5` не міркує без явного
 * `thinking`, а `output_config.effort` підтримують не всі його моделі, тож
 * поле там дало б 400. На шлюзі незадана змінна дає дефолт `low`
 * (`CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT`, рішення founder-а 2026-11-18).
 */
export function firstTurnReasoningPayload(): Record<string, unknown> {
  if (!chatViaOpenRouter()) return {};
  return firstTurnReasoningFields(env.CHAT_FIRST_TURN_REASONING_EFFORT);
}

/**
 * Поля глибини туру синтезу. Лише тир Premium: на standard (Free,
 * `deepseek-v4-flash`) і floor глибину не чіпаємо за жодного значення, бо
 * `none` там гірша за дефолт (дослідження 2026-11-19 § 6.4). `default` —
 * полів немає. Інакше та сама граматика, що в першого ходу
 * (`firstTurnReasoningFields`), бо синтез теж іде на `/messages`.
 */
export function synthesisReasoningFields(
  tier: ProTier,
  effort: ChatSynthesisPremiumReasoningEffort | undefined,
): Record<string, unknown> {
  if (tier !== "premium" || !effort || effort === "default") return {};
  return firstTurnReasoningFields(effort);
}

/**
 * Поля для payload туру синтезу в `chat.ts`. Лише на шлюзі, з тієї ж причини,
 * що й `firstTurnReasoningPayload`: на прямому Anthropic поле дало б 400.
 */
export function synthesisReasoningPayload(
  tier: ProTier,
): Record<string, unknown> {
  if (!chatViaOpenRouter()) return {};
  return synthesisReasoningFields(
    tier,
    env.CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT,
  );
}
