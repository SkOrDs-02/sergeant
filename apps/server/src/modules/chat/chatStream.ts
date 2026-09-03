import type { Request, Response } from "express";
import { env } from "../../env.js";
import { chatViaOpenRouter } from "../../env/chatModels.js";
import {
  type AnthropicStreamResult,
  anthropicMessagesStream,
  recordAnthropicUsage,
} from "../../lib/anthropic.js";
import type { AiProvider } from "../../lib/posthogAi.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { logger } from "../../obs/logger.js";
import { aiFirstTokenMs } from "../../obs/metrics.js";
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
   * OpenRouter розкладає usage інакше: у `message_start` вхідні токени
   * приходять нулем, а справжнє значення (і `cost`) — теж у фінальному
   * `message_delta`. Тому обидві події зливаються через `mergeStreamUsage`.
   *
   * Доку з SSE-схемою: https://docs.anthropic.com/en/api/messages-streaming
   * (секція "Event types" → message_delta).
   */
  usage?: StreamUsage;

  /**
   * In-stream error event. Anthropic і OpenRouter однаково шлють
   * `event: error` / `data: {"type":"error","error":{...}}` ПІСЛЯ того, як
   * тіло вже відкрито 200-кою — тобто тоді, коли HTTP-статус уже нічого не
   * розкаже, а ретраї в `lib/anthropic.ts` вже не діють (вони живуть до
   * відправки заголовків).
   *
   * Знахідка B46 (`docs/90-work/audits/ai-testing-2026-08-25.md`): доки цієї
   * гілки не було, подія просто провалювалась крізь цикл — `outcome`
   * лишався `"ok"`, текст порожнім, `stop_reason` — `null`. Наслідок:
   * користувач бачив мовчання, метрика рахувала успіх, квота не поверталась,
   * у Sentry не йшло нічого. Заміряна частота на прод-формі виклику
   * (floor-модель + 78 інструментів + стрім) — 7 зривів із 12.
   */
  error?: { type?: string; message?: string };
}

const USAGE_KEYS = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
  "cost",
] as const satisfies ReadonlyArray<keyof StreamUsage>;

/**
 * Зливає usage із кількох SSE-подій одного стріму, беручи по кожному полю
 * БІЛЬШЕ зі значень.
 *
 * WHY максимум, а не «останнє виграє»: провайдери розкладають usage
 * по-різному (Anthropic — input у `message_start`, output у `message_delta`;
 * OpenRouter — нулі у `message_start` і повна картина у `message_delta`), і
 * жоден із них у межах одного стріму не зменшує вже повідомлене число. Отже
 * нуль ніколи не затре реальне значення, а порядок подій перестає мати
 * значення. Без цього після переїзду на шлюз у `ai_usage_daily` писались би
 * нульові вхідні токени, і `anthropicBudgetGuard` втратив би стелю вартості.
 */
function mergeStreamUsage(
  prev: StreamUsage | null,
  next: StreamUsage,
): StreamUsage {
  const merged: StreamUsage = { ...(prev ?? {}) };
  for (const key of USAGE_KEYS) {
    const incoming = next[key];
    if (typeof incoming !== "number" || !Number.isFinite(incoming)) continue;
    const current = merged[key];
    if (typeof current !== "number" || incoming > current) {
      merged[key] = incoming;
    }
  }
  return merged;
}

/**
 * Як часто слати SSE-коментар ": ping\n\n", коли upstream мовчить.
 *
 * Контекст: Vercel/Railway/Cloudflare закривають idle HTTP-зʼєднання приблизно
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
  /** Деталь збою для лога/метрики; клієнту НЕ віддається (B33/B46). */
  streamErrorReason: string | null;
  /** `Date.now()` першої текстової дельти, або null якщо тексту не було. */
  firstTextAtMs: number | null;
}

/**
 * Єдиний текст помилки, який бачить клієнт у SSE-потоці.
 *
 * Політика та сама, що в `makeAiProviderError` для pre-SSE помилок: сирий
 * провайдерний рядок назовні не йде ніколи. Тримаємо константою, щоб гілки
 * не розʼїхались формулюваннями (як розʼїхались до B33).
 */
const SSE_GENERIC_ERROR = "Асистент тимчасово недоступний";

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
      streamErrorReason: "empty_body",
      firstTextAtMs: null,
    };
  }

  const decoder = new TextDecoder();
  let lineBuf = "";
  let accumulatedText = "";
  let stopReason: string | null = null;
  let outcome: "ok" | "error" = "ok";
  let usage: StreamUsage | null = null;
  let streamErrorReason: string | null = null;
  let firstTextAtMs: number | null = null;

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
          // TTFT: перший текстовий фрагмент цієї ітерації. Оркестратор
          // рахує метрику лише для ПЕРШОЇ ітерації — continuation-и
          // стартують з уже теплого зʼєднання і межу SLO не характеризують.
          if (firstTextAtMs === null) firstTextAtMs = Date.now();
          accumulatedText += ev.delta.text;
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ t: ev.delta.text })}\n\n`);
          }
        } else if (ev.type === "message_delta") {
          if (ev.delta?.stop_reason) {
            stopReason = ev.delta.stop_reason;
          }
          // Фінальний `message_delta` несе output-токени (Anthropic) і, за
          // OpenRouter-ом, ще й реальні input-токени з `cost` — див.
          // `mergeStreamUsage`.
          if (ev.usage) usage = mergeStreamUsage(usage, ev.usage);
        } else if (ev.type === "message_start" && ev.message?.usage) {
          usage = mergeStreamUsage(usage, ev.message.usage);
        } else if (ev.type === "error") {
          // B46. Провайдер обірвав уже відкритий стрім. Єдине місце, де це
          // можна зловити: HTTP-статус був 200, ретраї відпрацювали до
          // заголовків, а `stop_reason` не прийде взагалі.
          //
          // Провайдерний текст (`ev.error.message`) НЕ віддаємо клієнту —
          // та сама політика, що в `!firstResponse.ok` вище: назовні йде
          // generic-рядок, деталь лишається в лозі й метриці.
          outcome = "error";
          streamErrorReason = ev.error?.message || ev.error?.type || "unknown";
          if (!res.writableEnded) {
            res.write(
              `data: ${JSON.stringify({ err: SSE_GENERIC_ERROR })}\n\n`,
            );
          }
          // Далі читати нема сенсу: після `error` провайдер тіло закриває.
          break;
        }
      }
      if (outcome === "error") break;
    }
  } catch (e: unknown) {
    outcome = "error";
    // B33. Тут стояв сирий `e.message` — будь-яке повідомлення undici/zlib/
    // fetch доїжджало до браузера. Двома гілками нижче той самий файл
    // свідомо шле generic-текст; уніфікуємо.
    streamErrorReason = e instanceof Error ? e.message : String(e);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ err: SSE_GENERIC_ERROR })}\n\n`);
    }
  }

  return {
    outcome,
    stopReason,
    accumulatedText,
    usage,
    streamErrorReason,
    firstTextAtMs,
  };
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
  let firstStream: AnthropicStreamResult;
  try {
    firstStream = await anthropicMessagesStream(apiKey, payload, {
      endpoint,
      timeoutMs: 60000,
      signal: abortSignal,
      allowOpenRouter: chatViaOpenRouter(),
      userId,
    });
  } catch (e) {
    await refundQuotaOnUpstreamFailure(req);
    throw e;
  }
  const firstResponse: FetchResponse = firstStream.response;
  const firstRecordEnd = firstStream.recordStreamEnd;

  if (!firstResponse.ok) {
    // Селтл першого стріму ДО ретрів/кидання: без цього телеметрійний
    // recordStreamEnd не фіксує terminal-outcome і не чистить свій timeout.
    firstRecordEnd("error");
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

  // Heartbeat: чистий SSE-коментар кожні N мс, поки живе зʼєднання.
  // `res.writableEnded` — щоб не писати у вже закритий потік (клієнт відвалився).
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, SSE_HEARTBEAT_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  const baseMessages = (payload["messages"] as Array<unknown>) ?? [];
  // Точка відліку TTFT — момент, коли upstream уже відповів заголовками і ми
  // почали віддавати SSE. Ретраї/бекоф до цього моменту вимірює
  // `ai_request_duration_ms`; тут нас цікавить саме очікування людини перед
  // порожнім екраном.
  const streamStartedAtMs = Date.now();
  let firstTokenObserved = false;
  let accumulatedAllText = "";
  let currentResponse: FetchResponse = firstResponse;
  let currentRecordEnd = firstRecordEnd;
  // Транспорт і таймер поточного стріму — для `$ai_generation` (0025).
  // Optional-читання навмисно: тестові стаби `anthropicMessagesStream`
  // повертають лише `{ response, recordStreamEnd }`.
  let currentProvider = firstStream.provider as AiProvider | undefined;
  let currentElapsedMs = firstStream.elapsedMs as (() => number) | undefined;
  let continuationsLeft = MAX_TEXT_CONTINUATIONS;

  try {
    while (true) {
      const iter = await streamOneIterationToSse(res, currentResponse);
      currentRecordEnd(iter.outcome);
      if (iter.accumulatedText) accumulatedAllText += iter.accumulatedText;

      if (!firstTokenObserved && iter.firstTextAtMs !== null) {
        firstTokenObserved = true;
        aiFirstTokenMs.observe(
          {
            provider: chatViaOpenRouter() ? "openrouter" : "anthropic",
            model: (payload["model"] as string) || "unknown",
            endpoint,
          },
          iter.firstTextAtMs - streamStartedAtMs,
        );
      }

      // B46. Стрім обірвався, не віддавши ЖОДНОГО символу — для користувача
      // це те саме, що upstream-помилка до заголовків, тож і поводимось
      // однаково: повертаємо квоту й лишаємо слід у лозі.
      //
      // Умова саме `!accumulatedAllText`, а не `iter.outcome === "error"`:
      // якщо частина тексту вже дострімилась, людина щось отримала, і
      // повертати квоту за напів-успішний запит було б неправильно (та сама
      // логіка, що в continuation-гілці нижче — там partial-текст лишається
      // без refund).
      if (iter.outcome === "error" && !accumulatedAllText) {
        await refundQuotaOnUpstreamFailure(req);
        logger.warn({
          msg: "chat_stream_failed_empty",
          endpoint,
          model: (payload["model"] as string) || "unknown",
          reason: iter.streamErrorReason ?? "unknown",
        });
      }

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
          {
            provider: currentProvider,
            latencyMs:
              typeof currentElapsedMs === "function"
                ? currentElapsedMs()
                : undefined,
          },
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
        const nextStream: AnthropicStreamResult = await anthropicMessagesStream(
          apiKey,
          { ...payload, messages: nextMessages },
          {
            endpoint: `${endpoint}-cont`,
            timeoutMs: 60000,
            signal: abortSignal,
            allowOpenRouter: chatViaOpenRouter(),
            userId,
          },
        );
        const nextResponse = nextStream.response;
        const nextRecordEnd = nextStream.recordStreamEnd;
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
        currentProvider = nextStream.provider as AiProvider | undefined;
        currentElapsedMs = nextStream.elapsedMs as (() => number) | undefined;
        continuationsLeft -= 1;
      } catch {
        // Той самий принцип, що й у pre-SSE гілці: сирий провайдерний/мережевий
        // текст не витікає клієнту — лише generic-повідомлення.
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({ err: "AI continuation failed" })}\n\n`,
          );
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
