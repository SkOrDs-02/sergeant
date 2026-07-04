import type { Request } from "express";
import { env } from "../../env.js";
import type { WithAiQuotaRefund } from "./aiQuota.js";

// Anthropic upstream-виклики повертають web/fetch `Response`, а Express також
// експортує тип з ім'ям `Response`. Розрізняємо явно через alias, інакше TS
// підставляє Express-type у віддалені від HTTP-ендпоінту місця.
export type FetchResponse = globalThis.Response;

/**
 * Форма content-блоків Anthropic Messages API (Claude 4 sonnet, tool-use).
 * `text` для `type="text"`, `id/name/input` для `type="tool_use"`. Решту полів
 * лишаємо як index signature — SDK додає нові типи (`thinking`, `citations` тощо).
 */
export interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
}

export interface AnthropicMessagesResponseData {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  error?: { message?: string };
  [key: string]: unknown;
}

export interface StreamUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Максимум авто-continuation викликів при `stop_reason: "max_tokens"`. Кожен
 * continuation — це окремий upstream-виклик до Anthropic з partial assistant-text-ом,
 * доклеєним як останнє повідомлення — модель продовжить рівно з обриву.
 *
 * Чому cap: якщо модель вперто хоче писати більше за N × max_tokens — це баг у промпті
 * (або рунавай generation), і краще віддати юзеру обрізану відповідь, ніж спалити квоту
 * на нескінченний stream. 3 × 1.5–2.5k ≈ 5–7k токенів виходу — це вже повний брифінг
 * + великий weekly digest. Env-override — для тестів.
 */
export const MAX_TEXT_CONTINUATIONS = env.CHAT_MAX_TEXT_CONTINUATIONS;

/**
 * Якщо Anthropic повернув не-2xx або виклик упав (timeout/abort), викликаємо
 * прикріплений `assertAiQuota` refund closure, щоб не списувати квоту за
 * неуспішний запит. Після першого виклику closure no-op (ідемпотентно).
 */
export async function refundQuotaOnUpstreamFailure(
  req: Request,
): Promise<void> {
  try {
    await (req as Request & WithAiQuotaRefund).aiQuotaRefund?.();
  } catch {
    /* refund saving is best-effort, ніколи не ламає response */
  }
}
