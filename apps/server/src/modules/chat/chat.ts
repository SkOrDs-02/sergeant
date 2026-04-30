import type { Request, Response } from "express";

// Anthropic upstream-виклики повертають web/fetch `Response`, а Express також
// експортує тип з ім'ям `Response`. Розрізняємо явно через alias, інакше TS
// підставляє Express-type у віддалені від HTTP-ендпоінту місця.
type FetchResponse = globalThis.Response;
import { validateBody } from "../../http/validate.js";
import { ChatRequestSchema } from "../../http/schemas.js";
import {
  anthropicMessages,
  anthropicMessagesStream,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import type { WithAiQuotaRefund } from "./aiQuota.js";
import { TOOLS, SYSTEM_PREFIX, SYSTEM_PROMPT_VERSION } from "./tools.js";
import { recordToolProposals, recordToolExecutions } from "./toolMetrics.js";
import { truncateToolResults } from "./toolResultTruncation.js";
import { anthropicPromptCacheHitTotal } from "../../obs/metrics.js";
import { als } from "../../obs/requestContext.js";

type WithAnthropicKey = Request & { anthropicKey?: string };

/**
 * Anthropic prompt-caching, дві кажові точки (cache breakpoints):
 *
 * 1. **SYSTEM_PREFIX** як окремий `text`-блок з `cache_control`. Сьогодні сам префікс
 *    ~987 токенів — рівно під мінімумом Anthropic 1024 для Sonnet, тому слот
 *    фактично не реєструється. Позначаємо forward-looking: як тільки
 *    SYSTEM_PREFIX виросте понад поріг — кеш ввімкнеться автоматично.
 *
 * 2. **Останній tool** в `tools` (див. `applyToolsCacheBreakpoint`). Оскільки cache
 *    breakpoint охоплює все ДО себе в порядку system → tools → messages, це
 *    реально кешує ~6000+ токенів (system + всі 19+ tools). TTL ephemeral = 5хв.
 *
 * Per-user `context` рендериться другим блоком system — **без** `cache_control`,
 * щоб не створювати власного cache slot per-user-ом. Але оскільки cache key
 * охоплює весь system, різний context між юзерами все одно фрагментує кеш (один слот
 * на user). Це ОК: юзер в межах своєї сесії (5хв) отримує багато cache_read.
 *
 * Коли `context` порожній, Anthropic API відхиляє `text`-блоки з empty `text`,
 * тому під cap-ом повертаємо лише самий cached prefix.
 */
interface AnthropicSystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

function buildSystem(context: string): AnthropicSystemBlock[] {
  const cached: AnthropicSystemBlock = {
    type: "text",
    text: SYSTEM_PREFIX,
    cache_control: { type: "ephemeral" },
  };
  if (!context) return [cached];
  return [cached, { type: "text", text: context }];
}

/**
 * Клонує `TOOLS` і додає `cache_control: ephemeral` до останнього tool. Не
 * мутує імпортований масив, бо він реєкспортиться в інших місцях.
 *
 * Anthropic бачить останній cache_control в порядку system → tools → messages
 * як "кешуй все до цього блоку включно". Це реальний вин кешування сьогодні — без
 * цього cache_control на SYSTEM_PREFIX самостійно не ввімкнеться.
 */
function applyToolsCacheBreakpoint(
  tools: typeof TOOLS,
): Array<(typeof TOOLS)[number] & { cache_control?: { type: "ephemeral" } }> {
  if (tools.length === 0) return tools;
  const cloned = tools.slice();
  const last = cloned[cloned.length - 1];
  cloned[cloned.length - 1] = {
    ...last,
    cache_control: { type: "ephemeral" },
  } as typeof last & { cache_control: { type: "ephemeral" } };
  return cloned as Array<
    (typeof TOOLS)[number] & { cache_control?: { type: "ephemeral" } }
  >;
}

const TOOLS_WITH_CACHE = applyToolsCacheBreakpoint(TOOLS);

/**
 * Якщо Anthropic повернув не-2xx або виклик упав (timeout/abort), викликаємо
 * прикріплений `assertAiQuota` refund closure, щоб не списувати квоту за
 * неуспішний запит. Після першого виклику closure no-op (ідемпотентно).
 */
async function refundQuotaOnUpstreamFailure(req: Request): Promise<void> {
  try {
    await (req as Request & WithAiQuotaRefund).aiQuotaRefund?.();
  } catch {
    /* refund saving is best-effort, ніколи не ламає response */
  }
}

/**
 * Форма content-блоків Anthropic Messages API (Claude 4 sonnet, tool-use).
 * `text` для `type="text"`, `id/name/input` для `type="tool_use"`. Решту полів
 * лишаємо як index signature — SDK додає нові типи (`thinking`, `citations` тощо).
 */
interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
}

interface AnthropicMessagesResponseData {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  error?: { message?: string };
  [key: string]: unknown;
}

interface ClientChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface StreamEvent {
  type: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  message?: { usage?: StreamUsage };
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
const MAX_TEXT_CONTINUATIONS =
  Number(process.env.CHAT_MAX_TEXT_CONTINUATIONS) || 3;

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
async function callAnthropicWithContinuation(
  apiKey: string,
  basePayload: Record<string, unknown>,
  options: {
    timeoutMs?: number;
    endpoint: string;
    signal?: AbortSignal;
    promptVersion?: string;
  },
): Promise<{
  response: FetchResponse | null;
  data: AnthropicMessagesResponseData;
  continued: boolean;
}> {
  const baseMessages = (basePayload.messages as Array<unknown>) ?? [];
  let currentMessages: Array<unknown> = baseMessages.slice();
  const mergedTextChunks: string[] = [];
  let lastResponse: FetchResponse | null = null;
  let lastData: AnthropicMessagesResponseData = {};
  let lastNonTextBlocks: AnthropicContentBlock[] = [];
  let continued = false;

  for (let i = 0; i <= MAX_TEXT_CONTINUATIONS; i++) {
    if (options.signal?.aborted) break;

    const { response, data } = await anthropicMessages(
      apiKey,
      { ...basePayload, messages: currentMessages },
      options,
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

function buildMergedContent(
  mergedText: string,
  nonTextBlocks: AnthropicContentBlock[],
): AnthropicContentBlock[] {
  const out: AnthropicContentBlock[] = [];
  if (mergedText) out.push({ type: "text", text: mergedText });
  out.push(...nonTextBlocks);
  return out;
}

/**
 * POST /api/chat — основний чат з AI-асистентом з tool-calling та SSE-стрімом.
 * Middleware-и роутера гарантують ключ у `req.anthropicKey` і валідну квоту.
 */
export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;

  // AbortController мапить client-disconnect (Express `req.close`) на
  // Anthropic-виклик, щоб upstream не дограв запит, на який уже ніхто не чекає
  // (і не спалив токени). Прокидається у всі виклики anthropicMessages*.
  const clientAbort = new AbortController();
  if (typeof req.on === "function") {
    req.on("close", () => {
      if (!res.writableEnded) clientAbort.abort();
    });
  }

  const parsed = validateBody(ChatRequestSchema, req, res);
  if (!parsed.ok) return;

  const {
    context = "",
    messages = [],
    tool_results,
    tool_calls_raw,
    stream,
  } = parsed.data;

  // Другий крок: клієнт виконав tool calls і повертає результати
  if (tool_results && tool_calls_raw) {
    recordToolExecutions(tool_results, tool_calls_raw);
    // Великі `tool_result`-блоби (брифінги, місячні digest-и) з'їдають
    // бюджет вхідних токенів і зривають continuation. Truncate на сервері,
    // повний blob — у Sentry breadcrumb для debug-у.
    const requestId = als.getStore()?.requestId ?? undefined;
    const normalizedToolResults = truncateToolResults(tool_results, {
      requestId,
    });
    const toolResultMessages = normalizedToolResults.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.tool_use_id,
      content: r.content,
    }));

    // Беремо лише останнє user-повідомлення (питання що спричинило tool call)
    const lastUserMsg = [...(Array.isArray(messages) ? messages : [])]
      .reverse()
      .find(
        (m) =>
          m?.role === "user" &&
          typeof m?.content === "string" &&
          m.content.trim(),
      );

    const fullMessages = [
      ...(lastUserMsg ? [{ role: "user", content: lastUserMsg.content }] : []),
      { role: "assistant", content: tool_calls_raw },
      { role: "user", content: toolResultMessages },
    ];

    // AI-CONTEXT: cap на tool-result відповідь — це фінальний текст для
    // юзера після того як модель отримала дані з tool_result (брифінги,
    // підсумки, аналіз бюджету). Markdown-таблиці + кілька секцій по-українськи
    // легко займають 1.5–2k токенів; нижчі значення обрізали відповідь
    // посеред речення. Тримаємо із запасом — модель сама зупиниться раніше,
    // якщо контент закінчився.
    const payload = {
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: buildSystem(context),
      tools: TOOLS_WITH_CACHE,
      messages: fullMessages,
    };

    if (stream) {
      await streamAnthropicToSse(
        req,
        res,
        apiKey,
        payload,
        "chat-tool-result",
        clientAbort.signal,
        SYSTEM_PROMPT_VERSION,
      );
      return;
    }

    let response, data;
    try {
      ({ response, data } = await callAnthropicWithContinuation(
        apiKey,
        payload,
        {
          timeoutMs: 30000,
          endpoint: "chat-tool-result",
          signal: clientAbort.signal,
          promptVersion: SYSTEM_PROMPT_VERSION,
        },
      ));
    } catch (e) {
      await refundQuotaOnUpstreamFailure(req);
      throw e;
    }

    if (!response?.ok) {
      await refundQuotaOnUpstreamFailure(req);
      res
        .status(response?.status || 500)
        .json({ error: data?.error?.message || "AI error" });
      return;
    }

    const text = extractAnthropicText(data);
    res.status(200).json({ text: text || "Готово." });
    return;
  }

  // Перший запит — може повернути tool_use або текст
  const cleaned = sanitizeMessages(messages);
  if (cleaned.length === 0) {
    res.status(400).json({ error: "Немає повідомлень" });
    return;
  }

  let response, data;
  try {
    ({ response, data } = await callAnthropicWithContinuation(
      apiKey,
      // AI-CONTEXT: перший крок чату — модель може повернути text або tool_use.
      // Direct-text відповіді на питання типу «що з фінансами?» потребують
      // більше за 600 токенів, бо це часто структуровані пояснення з
      // markdown-форматуванням. Тримаємо нижче за tool-result cap, бо тут
      // зазвичай немає таблиць/брифінгів.
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: buildSystem(context),
        tools: TOOLS_WITH_CACHE,
        messages: cleaned,
      },
      {
        timeoutMs: 30000,
        endpoint: "chat",
        signal: clientAbort.signal,
        promptVersion: SYSTEM_PROMPT_VERSION,
      },
    ));
  } catch (e) {
    await refundQuotaOnUpstreamFailure(req);
    throw e;
  }

  if (!response?.ok) {
    await refundQuotaOnUpstreamFailure(req);
    res
      .status(response?.status || 500)
      .json({ error: data?.error?.message || "AI error" });
    return;
  }

  const content: AnthropicContentBlock[] = data?.content || [];
  const toolUses = content.filter((b) => b.type === "tool_use");
  const textParts = content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");

  if (toolUses.length > 0) {
    recordToolProposals(content);
    res.status(200).json({
      text: textParts || null,
      tool_calls: toolUses.map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input,
      })),
      tool_calls_raw: content,
    });
    return;
  }

  res.status(200).json({ text: textParts || "Немає відповіді від AI." });
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
const SSE_HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS) || 15_000;

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
        } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
          stopReason = ev.delta.stop_reason;
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
async function streamAnthropicToSse(
  req: Request,
  res: Response,
  apiKey: string,
  payload: Record<string, unknown>,
  endpoint: string = "chat",
  abortSignal?: AbortSignal,
  promptVersion?: string,
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
    res.status(firstResponse.status).json({ error: errMsg });
    return;
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

  const baseMessages = (payload.messages as Array<unknown>) ?? [];
  let accumulatedAllText = "";
  let currentResponse: FetchResponse = firstResponse;
  let currentRecordEnd = firstRecordEnd;
  let continuationsLeft = MAX_TEXT_CONTINUATIONS;

  try {
    while (true) {
      const iter = await streamOneIterationToSse(res, currentResponse);
      currentRecordEnd(iter.outcome);
      if (iter.accumulatedText) accumulatedAllText += iter.accumulatedText;

      if (promptVersion && iter.usage) {
        const cacheRead = iter.usage.cache_read_input_tokens ?? 0;
        try {
          anthropicPromptCacheHitTotal.inc({
            version: promptVersion,
            outcome: cacheRead > 0 ? "hit" : "miss",
          });
        } catch {
          /* metrics must never break a request */
        }
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

function sanitizeMessages(messages: unknown): ClientChatMessage[] {
  const cleaned = (Array.isArray(messages) ? messages : [])
    .filter(
      (m): m is ClientChatMessage =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-12);

  // Anthropic вимагає чергування user/assistant і початок з user
  const result: ClientChatMessage[] = [];
  for (const m of cleaned) {
    if (result.length > 0 && result[result.length - 1].role === m.role)
      continue;
    result.push(m);
  }
  while (result.length > 0 && result[0].role !== "user") result.shift();
  while (result.length > 0 && result[result.length - 1].role !== "user")
    result.pop();

  return result;
}
