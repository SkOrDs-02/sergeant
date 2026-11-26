import type { Request } from "express";
import { extractAnthropicText } from "../../lib/anthropic.js";
import { replaceLongDash } from "../../lib/modelText.js";
import { logger } from "../../obs/logger.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { refundQuotaOnUpstreamFailure } from "./chatShared.js";
import {
  type EmptyRetryOutcome,
  emptySynthesisRetryEnabled,
  noteEmptyRetry,
  withoutReasoning,
} from "./chatStreamEmptyRetry.js";
import { callAnthropicWithContinuation } from "./chatUpstream.js";

/**
 * Тур синтезу без стріму (JSON-відповідь `/api/chat` після tool-результатів).
 *
 * AI-CONTEXT: до 2026-11-19 тут була заглушка `text || "Готово."`: модель
 * лишала відповідь у міркуваннях, людина бачила «Готово.» як нібито відповідь,
 * квота списувалась, у метриках і логах це був успіх. На турі синтезу
 * порожній текст ніколи не норма: `tool_use` звідси нікуди не доїжджає
 * (клієнт не виконує другого кола інструментів), тож без тексту людина не
 * отримує нічого. Легітимний «хід без тексту» живе лише на ПЕРШОМУ турі
 * (`text: null` поряд із `tool_calls`), і його цей модуль не стосується.
 *
 * Поведінка та сама, що в стрімі (`chatStream.ts` + `chatStreamEmptyRetry.ts`,
 * рішення власника 2026-11-19): на порожню успішну відповідь через шлюз рівно
 * один перезапит того самого payload без міркувань; не допомогло, впало, або
 * перезапиту не було (прямий Anthropic, вимикач `off`) — повернення квоти і
 * та сама 502 `ANTHROPIC_ERROR`, якою хендлер віддає збій upstream.
 *
 * Повертає непорожній фінальний текст або кидає помилку (квоту вже повернуто).
 */
export async function callSynthesisJson(
  req: Request,
  apiKey: string,
  payload: Record<string, unknown>,
  opts: {
    endpoint: string;
    timeoutMs: number;
    maxTotalMs: number;
    signal?: AbortSignal;
    promptVersion?: string;
    traceId?: string;
    userId?: string;
    /** Детермінована відповідь замість 502, коли синтез порожній і після перезапиту. */
    emptyFallbackText?: string;
  },
): Promise<string> {
  const { endpoint, userId, emptyFallbackText, ...rest } = opts;
  const call = (p: Record<string, unknown>, ep: string) =>
    callAnthropicWithContinuation(apiKey, p, {
      ...rest,
      endpoint: ep,
      retryOnTimeout: true,
      ...(userId !== undefined ? { userId } : {}),
    });

  let response, data;
  try {
    ({ response, data } = await call(payload, endpoint));
  } catch (e) {
    await refundQuotaOnUpstreamFailure(req);
    throw e;
  }
  if (!response?.ok) {
    await refundQuotaOnUpstreamFailure(req);
    throw makeAiProviderError({
      rawProviderMessage: data?.error?.message,
      status: response?.status,
    });
  }

  const text = replaceLongDash(extractAnthropicText(data));
  if (text) return text;

  const model = (payload["model"] as string) || "unknown";
  let retry: EmptyRetryOutcome | "none" = "none";
  if (emptySynthesisRetryEnabled() && !opts.signal?.aborted) {
    const ctx = { endpoint, model, mode: "json" as const };
    try {
      const again = await call(withoutReasoning(payload), `${endpoint}-retry`);
      if (again.response?.ok) {
        const retryText = replaceLongDash(extractAnthropicText(again.data));
        retry = retryText ? "recovered" : "still_empty";
        noteEmptyRetry(retry, ctx);
        if (retryText) return retryText;
      } else {
        retry = "error";
        noteEmptyRetry(retry, {
          ...ctx,
          reason: `status_${again.response?.status ?? "none"}`,
        });
      }
    } catch (e) {
      retry = "error";
      noteEmptyRetry(retry, {
        ...ctx,
        reason: e instanceof Error ? e.name : "unknown",
      });
    }
  }

  // Без тексту відповіді й чисел користувача (Hard Rule #21).
  logger.warn({
    msg: "chat_json_empty_ok",
    endpoint,
    model,
    retry,
    fallback: !!emptyFallbackText,
  });
  if (emptyFallbackText) return emptyFallbackText;
  await refundQuotaOnUpstreamFailure(req);
  throw makeAiProviderError({
    rawProviderMessage: `empty synthesis (retry: ${retry})`,
    status: response.status,
  });
}
