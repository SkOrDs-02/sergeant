import { chatViaOpenRouter } from "../../env/chatModels.js";
import { anthropicMessages } from "../../lib/anthropic.js";
import {
  type AnthropicContentBlock,
  type AnthropicMessagesResponseData,
  type FetchResponse,
  MAX_TEXT_CONTINUATIONS,
} from "./chatShared.js";

// Винесено з `chat.ts` (2026-11-18, стрім першого ходу): `chat.ts` стояв рівно
// на стелі `max-lines` (Hard Rule #18). Поведінка не змінена ні на рядок.

/**
 * Викликає `anthropicMessages` у циклі: якщо відповідь обірвалася на max_tokens
 * і в content-і лише text-блоки (без tool_use), доклеює partial текст як
 * assistant-повідомлення і робить ще один виклик. Повертає останню response/data,
 * але з content, де вся накопичена текстова частина зібрана в один text-блок.
 *
 * Якщо в content-і є tool_use — НЕ продовжуємо: tool_use завжди має йти
 * парою з tool_result, який буде робити клієнт. Без cap-а на max_tokens в моделі,
 * що пише tool_use+text разом — рідкісний варіант; якщо трапляється, пропускаємо без
 * continuation — клієнт обробить tool_use, а якщо text при цьому обрізаний — це прийнятно.
 */
export async function callAnthropicWithContinuation(
  apiKey: string,
  basePayload: Record<string, unknown>,
  options: {
    timeoutMs?: number;
    endpoint: string;
    signal?: AbortSignal;
    promptVersion?: string;
    userId?: string;
    /** `$ai_trace_id` — ініціатива 0025, Фаза 2 (`AnthropicCallOptions.traceId`). */
    traceId?: string;
    /** Стеля на весь логічний виклик — див. `AnthropicCallOptions.maxTotalMs`. */
    maxTotalMs?: number;
    /** Один ретрай після таймауту — див. `AnthropicCallOptions.retryOnTimeout`. */
    retryOnTimeout?: boolean;
  },
): Promise<{
  response: FetchResponse | null;
  data: AnthropicMessagesResponseData;
  continued: boolean;
}> {
  const baseMessages = (basePayload["messages"] as Array<unknown>) ?? [];
  let currentMessages: Array<unknown> = baseMessages.slice();
  const mergedTextChunks: string[] = [];
  let lastResponse: FetchResponse | null = null;
  let lastData: AnthropicMessagesResponseData = {};
  let lastNonTextBlocks: AnthropicContentBlock[] = [];
  let continued = false;

  // AI-DANGER: do not remove this continuation loop as an "optimization". When
  // Anthropic returns `stop_reason: "max_tokens"` with text-only content, this
  // re-issues the call with the partial text appended so the model resumes
  // exactly where it cut off — it is the safety net that hides short-capped
  // replies (parity with a manual "продовж"). Capped at MAX_TEXT_CONTINUATIONS.
  // (domain-invariants.md — PR #813.)
  for (let i = 0; i <= MAX_TEXT_CONTINUATIONS; i++) {
    if (options.signal?.aborted) break;

    const { response, data } = await anthropicMessages(
      apiKey,
      { ...basePayload, messages: currentMessages },
      // Умову приносить сам чат: `chatViaOpenRouter()` перевіряє і прапорець,
      // і наявність ключа. Зорові шляхи мають власний прапорець.
      { ...options, allowOpenRouter: chatViaOpenRouter() },
    );
    lastResponse = response;
    lastData = data as AnthropicMessagesResponseData;

    if (!response?.ok) {
      // Якщо вже є partial-текст з попередніх успішних викликів — повертаємо його
      // як успішний результат (graceful degradation): юзер бачить часткову
      // відповідь замість 5xx, квоту не рефандимо (перші виклики легітимно
      // обслужені). Без partial-у — помилку віддаємо caller-у на refund.
      // Синтезуємо ok-response, щоб caller-и (які роблять `if (!response.ok)`)
      // потрапили у success-гілку.
      if (continued && mergedTextChunks.length > 0) {
        return {
          response: new Response(null, { status: 200 }) as FetchResponse,
          data: {
            content: buildMergedContent(
              mergedTextChunks.join(""),
              lastNonTextBlocks,
            ),
          },
          continued,
        };
      }
      return { response, data: lastData, continued };
    }

    const content: AnthropicContentBlock[] = lastData?.content ?? [];
    const textParts = content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (textParts) mergedTextChunks.push(textParts);
    lastNonTextBlocks = content.filter((b) => b.type !== "text");

    const stopReason = lastData?.stop_reason;
    const hasToolUse = lastNonTextBlocks.some((b) => b.type === "tool_use");

    if (
      stopReason !== "max_tokens" ||
      hasToolUse ||
      i === MAX_TEXT_CONTINUATIONS ||
      !textParts
    ) {
      const mergedContent = buildMergedContent(
        mergedTextChunks.join(""),
        lastNonTextBlocks,
      );
      return {
        response,
        data: { ...lastData, content: mergedContent },
        continued,
      };
    }

    // Продовжуємо: rebuild з baseMessages + ОДИН assistant-msg з усім склеєним
    // текстом. Anthropic Messages API вимагає user/assistant alternation —
    // якщо просто .push-ити новий assistant-msg на кожній ітерації, на 2-му
    // continuation-і отримаємо два assistant-and-row → 400 від upstream.
    currentMessages = [
      ...baseMessages,
      { role: "assistant", content: mergedTextChunks.join("") },
    ];
    continued = true;
  }

  // Захисний fallback (не досяжний у нормальному флоу).
  return {
    response: lastResponse,
    data: {
      ...lastData,
      content: buildMergedContent(mergedTextChunks.join(""), lastNonTextBlocks),
    },
    continued,
  };
}

export function buildMergedContent(
  mergedText: string,
  nonTextBlocks: AnthropicContentBlock[],
): AnthropicContentBlock[] {
  const out: AnthropicContentBlock[] = [];
  if (mergedText) out.push({ type: "text", text: mergedText });
  out.push(...nonTextBlocks);
  return out;
}
