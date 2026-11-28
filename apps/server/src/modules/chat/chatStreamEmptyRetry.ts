import { env } from "../../env.js";
import { chatViaOpenRouter } from "../../env/chatModels.js";
import { logger } from "../../obs/logger.js";
import { chatSynthesisEmptyRetryTotal } from "../../obs/metrics.js";
import { firstTurnReasoningFields } from "./chatReasoning.js";

/**
 * Страховка-перезапит порожнього туру синтезу (рішення власника 2026-11-19).
 *
 * Модель на шлюзі OpenRouter інколи пише готову відповідь у блок `thinking` і
 * закриває стрім `end_turn` без жодного текстового блока. Замір того дня на
 * `deepseek/deepseek-v4-flash` (стрім, `/messages`): Fireworks 9 порожніх з
 * 30, StreamLake 3 з 30; без міркувань 0 з 30 і 0 з 12
 * (`docs/work/research/2026-11-19-openrouter-new-models.md` § 6.4). Тому
 * перша спроба лишається з міркуваннями (без них модель пропускала пастку
 * «розбіжність у сумах»), а на порожню відповідь сервер РІВНО ОДИН раз
 * перепитує той самий payload без міркувань у ту саму SSE-відповідь. Той самий
 * перезапит робить і тур синтезу без стріму (`chatSynthesisJson.ts`).
 *
 * Лише шлюз: на прямому Anthropic `thinking` у синтезі не шлеться, і
 * порожнечі такого виду там не спостерігалось.
 */
export function emptySynthesisRetryEnabled(): boolean {
  return env.CHAT_SYNTHESIS_EMPTY_RETRY === "on" && chatViaOpenRouter();
}

/**
 * Той самий payload з вимкненими міркуваннями. `output_config` (глибина
 * Premium, `chatReasoning.ts`) прибирається: шлюз перекладає його в
 * `reasoning.effort`, і разом із `thinking: disabled` це суперечлива пара.
 */
export function withoutReasoning(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  delete next["output_config"];
  return { ...next, ...firstTurnReasoningFields("none") };
}

/**
 * Тур синтезу не має права на нові виклики інструментів: `tool_use` звідси
 * нікуди не доїжджає (стрім форвардить лише `text_delta`, JSON віддає лише
 * текст), тож хід, який модель закрила викликом, для людини порожній
 * (FULL-20261126-AI-2: `remember` без згоди на дані про здоровʼя, 8 з 8
 * відповідей glm-5.2 були `stop_reason: tool_use` без тексту, перезапит без
 * міркувань теж). `tool_choice: none` лишає схеми в запиті (розмова несе
 * `tool_use`/`tool_result`), але забороняє новий виклик; заміряно на шлюзі
 * 2026-11-26. Лише шлюз: прямий Anthropic цим шляхом не перевірявся.
 */
export function synthesisToolChoiceFields(): Record<string, unknown> {
  return chatViaOpenRouter() ? { tool_choice: { type: "none" } } : {};
}

export type EmptyRetryOutcome = "recovered" | "still_empty" | "error";

/**
 * Лічильник і лог одного перезапиту. Жодного тексту відповіді й чисел
 * користувача (Hard Rule #21): лише результат, ендпоінт, модель і шлях у лозі.
 * Спільний для стріму (`chatStream.ts`) і JSON-синтезу (`chatSynthesisJson.ts`):
 * лічильник один, шлях розрізняє лише поле `mode` у лозі (`stream` | `json`),
 * бо сусідні метрики чату транспорт міткою не ділять.
 */
export function noteEmptyRetry(
  outcome: EmptyRetryOutcome,
  ctx: {
    endpoint: string;
    model: string;
    reason?: string;
    mode?: "stream" | "json";
  },
): void {
  chatSynthesisEmptyRetryTotal.inc({ outcome });
  const entry = {
    msg: "chat_stream_empty_retry",
    outcome,
    mode: ctx.mode ?? "stream",
    endpoint: ctx.endpoint,
    model: ctx.model,
    ...(ctx.reason ? { reason: ctx.reason } : {}),
  };
  if (outcome === "recovered") logger.info(entry);
  else logger.warn(entry);
}
