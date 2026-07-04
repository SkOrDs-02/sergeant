import type { Request, Response } from "express";
import { env } from "../../env.js";
import {
  anthropicMessagesStream,
  recordAnthropicUsage,
} from "../../lib/anthropic.js";
import { makeAiProviderError } from "../../obs/errors.js";
import {
  type AnthropicMessagesResponseData,
  type FetchResponse,
  type StreamUsage,
  MAX_TEXT_CONTINUATIONS,
  refundQuotaOnUpstreamFailure,
} from "./chatShared.js";

interface StreamEvent {
  type: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  message?: { usage?: StreamUsage };
  /**
   * Anthropic надсилає `output_tokens` НЕ у `message_start` (там лише
   * `input_tokens` + cache-токени), а у фінальному `message_delta` подію
   * як top-level `usage.output_tokens`. Без цього merge cost-метрика
   * систематично занижує `output`-вартість (для Sonnet — ~70-80% бюджету,
   * бо output $15/Mtok vs input $3/Mtok).
   *
   * Доку з SSE-схемою: https://docs.anthropic.com/en/api/messages-streaming
   * (секція "Event types" → message_delta).
   */
  usage?: StreamUsage;
}

/**
 * Як часто слати SSE-коментар ": ping\n\n", коли upstream мовчить.
 *
 * Контекст: Vercel/Railway/Cloudflare закривають idle HTTP-з'єднання приблизно
 * через 30-60с. Якщо Anthropic довго генерує першу токен-дельту (reasoning,
 * великий prompt, rate-limit backoff), проксі обірве SSE-сокет раніше, ніж
 * ми встигнемо щось записати — клієнт побачить "зависло" замість відповіді.
 * Heartbeat тримає сокет активним, не засмічуючи потік видимими даними
 * (коментарі `:` EventSource мовчки ігнорує).
 *
 * Env-override `SSE_HEARTBEAT_MS` — для тестів і тюнінгу під конкретний proxy.
 */
const SSE_HEARTBEAT_MS = env.SSE_HEARTBEAT_MS;

interface StreamIterationResult {
  outcome: "ok" | "error";
  stopReason: string | null;
  accumulatedText: string;
  usage: StreamUsage | null;
}

/**
 * Читає одну upstream-відповідь Anthropic (SSE) і форвардить text-дельти у `res`.
 * Повертає накопичений текст і `stop_reason` з `message_delta`-події — це потрібно
 * для авто-continuation (див. `streamAnthropicToSse`).
 *
 * НЕ пише `[DONE]` і НЕ закриває `res`: оркестратор може запустити ще одну
 * ітерацію (continuation) у той самий SSE-потік.
 */
async function streamOneIterationToSse(
  res: Response,
  upstream: FetchResponse,
): Promise<StreamIterationResult> {
  const reader = upstream.body?.getReader();
  if (!reader) {
    // Edge-case: 200 OK без `body`/`getReader()` — Anthropic не повинен
    // такого віддавати, але Cloudflare/edge-проксі іноді стрипають body.
    // SSE-заголовки тут ВЖЕ виставлені (caller — `streamAnthropicToSse`
    // ставить їх до першого виклику цієї функції), тому ми НЕ можемо
    // упасти у JSON через `errorHandler`. Натомість пишемо явну err-подію,
    // щоб клієнт побачив помилку, а не тиху [DONE]-закриватку.
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ err: "AI upstream returned empty body" })}\n\n`,
      );
    }
    return {
      outcome: "error",
      stopReason: null,
      accumulatedText: "",
      usage: null,
    };
  }

  const decoder = new TextDecoder();
  let lineBuf = "";
  let accumulatedText = "";
  let stopReason: string | null = null;
  let outcome: "ok" | "error" = "ok";
  let usage: StreamUsage | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineBuf += decoder.decode(value, { stream: true });
      for (;;) {
        const nl = lineBuf.indexOf("\n");
        if (nl === -1) break;
        const line = lineBuf.slice(0, nl).replace(/\r$/, "");
        lineBuf = lineBuf.slice(nl + 1);
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        let ev: StreamEvent;
        try {
          ev = JSON.parse(raw) as StreamEvent;
        } catch {
          continue;
        }
        if (
          ev.type === "content_block_delta" &&
          ev.delta?.type === "text_delta" &&
          ev.delta.text
        ) {
          accumulatedText += ev.delta.text;
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ t: ev.delta.text })}\n\n`);
          }
        } else if (ev.type === "message_delta") {
          if (ev.delta?.stop_reason) {
            stopReason = ev.delta.stop_reason;
          }
          // Top-level `usage.output_tokens` приходить ЛИШЕ тут (див.
          // коментар біля `StreamEvent.usage`). Merge у `usage`, що ми
          // зібрали з `message_start`, інакше кост рахується тільки на
          // input + cache, і `kind=completion` лічильник лишається порожнім.
          if (ev.usage?.output_tokens != null) {
            usage = { ...(usage ?? {}), output_tokens: ev.usage.output_tokens };
          }
        } else if (ev.type === "message_start" && ev.message?.usage) {
          usage = ev.message.usage;
        }
      }
    }
  } catch (e: unknown) {
    outcome = "error";
    const message = e instanceof Error ? e.message : String(e);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ err: message })}\n\n`);
    }
  }

  return { outcome, stopReason, accumulatedText, usage };
}

/**
 * Anthropic Messages API stream → SSE для клієнта (data: {"t":"фрагмент"}).
 *
 * Підтримує авто-continuation: якщо upstream закінчив `message_delta` зі
 * `stop_reason: "max_tokens"` і ми зібрали partial-text, відкриваємо ще один
 * upstream-стрім з тим самим payload + `{role:"assistant", content: partial}`
 * як останнім повідомленням. Anthropic продовжить рівно з обриву; клієнт
 * бачить безперервний потік `data: {"t":"..."}` подій без жодної маркеровки.
 *
 * Cap на кількість continuation — `MAX_TEXT_CONTINUATIONS`.
 */
export async function streamAnthropicToSse(
  req: Request,
  res: Response,
  apiKey: string,
  payload: Record<string, unknown>,
  endpoint: string = "chat",
  abortSignal?: AbortSignal,
  promptVersion?: string,
  userId?: string,
): Promise<void> {
  let firstResponse: FetchResponse;
  let firstRecordEnd: (outcome?: string) => void;
  try {
    ({ response: firstResponse, recordStreamEnd: firstRecordEnd } =
      await anthropicMessagesStream(apiKey, payload, {
        endpoint,
        timeoutMs: 60000,
        signal: abortSignal,
      }));
  } catch (e) {
    await refundQuotaOnUpstreamFailure(req);
    throw e;
  }

  if (!firstResponse.ok) {
    await refundQuotaOnUpstreamFailure(req);
    // Body — одноразовий стрім: `await response.json()` його консьюмить, тож
    // `response.text()` після failed-`.json()` нічого не поверне (тіло вже
    // прочитане). Робимо `clone()` ДО першої спроби, щоб мати можливість
    // прочитати raw text fallback-ом для не-JSON 5xx (наприклад "Service
    // Unavailable" від Cloudflare/Railway-edge без application/json
    // content-type).
    const errClone = firstResponse.clone();
    let errMsg = "AI error";
    try {
      const j = (await firstResponse.json()) as AnthropicMessagesResponseData;
      errMsg = j?.error?.message || errMsg;
    } catch {
      try {
        const text = await errClone.text();
        if (text) errMsg = text;
      } catch {
        /* ignore */
      }
    }
    // Pre-SSE Anthropic upstream-помилка: жодних SSE-заголовків ще не
    // виставлено, тож кидаємо через `makeAiProviderError`, щоб
    // `errorHandler` уніфіковано додав `code: ANTHROPIC_ERROR`,
    // `requestId`, інкрементнув `app_errors_total{kind=operational}` і
    // не витік сирий провайдерний текст у відповідь клієнту.
    throw makeAiProviderError({
      rawProviderMessage: errMsg,
      status: firstResponse.status,
    });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");

  // Heartbeat: чистий SSE-коментар кожні N мс, поки живе з'єднання.
  // `res.writableEnded` — щоб не писати у вже закритий потік (клієнт відвалився).
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, SSE_HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  const baseMessages = (payload["messages"] as Array<unknown>) ?? [];
  let accumulatedAllText = "";
  let currentResponse: FetchResponse = firstResponse;
  let currentRecordEnd = firstRecordEnd;
  let continuationsLeft = MAX_TEXT_CONTINUATIONS;

  try {
    while (true) {
      const iter = await streamOneIterationToSse(res, currentResponse);
      currentRecordEnd(iter.outcome);
      if (iter.accumulatedText) accumulatedAllText += iter.accumulatedText;

      // Streaming path раніше пропускав tokens/cost-метрики (єдина точка
      // лічильника була в non-streaming `recordUsage`). Тепер витягнутий з
      // SSE `message_start` usage прокидаємо у спільний emit-helper —
      // `aiTokensTotal{kind=prompt|completion|cache_*}`, `cache-hit` лічильник
      // та `ai_cost_estimate_usd_total` тепер заповнюються і для chat-стріму.
      // Якщо upstream не повернув `message_start.usage` взагалі (стрім впав
      // ще до першої події) — лишаємо контракт як був: жодних метрик не
      // інкрементимо, щоб не давати fake-сигналу.
      if (iter.usage) {
        const iterModel = (payload["model"] as string) || "unknown";
        const iterEndpoint =
          continuationsLeft === MAX_TEXT_CONTINUATIONS
            ? endpoint
            : `${endpoint}-cont`;
        recordAnthropicUsage(
          iterModel,
          iterEndpoint,
          iter.usage,
          promptVersion,
          userId,
        );
      }

      if (
        iter.outcome === "error" ||
        iter.stopReason !== "max_tokens" ||
        continuationsLeft <= 0 ||
        !iter.accumulatedText ||
        abortSignal?.aborted ||
        res.writableEnded
      ) {
        break;
      }

      // Continuation: rebuild з baseMessages + ОДИН assistant-msg з усім склеєним
      // текстом (Anthropic API вимагає user/assistant alternation — два
      // assistant-msg-и поспіль → 400).
      const nextMessages = [
        ...baseMessages,
        { role: "assistant", content: accumulatedAllText },
      ];
      try {
        const { response: nextResponse, recordStreamEnd: nextRecordEnd } =
          await anthropicMessagesStream(
            apiKey,
            { ...payload, messages: nextMessages },
            {
              endpoint: `${endpoint}-cont`,
              timeoutMs: 60000,
              signal: abortSignal,
            },
          );
        if (!nextResponse.ok) {
          // Upstream-помилка на continuation: лишаємо вже стрімнутий текст,
          // юзер бачить partial відповідь + помилку.
          nextRecordEnd("error");
          if (!res.writableEnded) {
            res.write(
              `data: ${JSON.stringify({ err: "AI continuation failed" })}\n\n`,
            );
          }
          break;
        }
        currentResponse = nextResponse;
        currentRecordEnd = nextRecordEnd;
        continuationsLeft -= 1;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ err: message })}\n\n`);
        }
        break;
      }
    }
  } finally {
    clearInterval(heartbeat);
  }

  if (!res.writableEnded) {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}
