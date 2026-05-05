import {
  aiCostEstimateUsd,
  aiRequestDurationMs,
  aiRequestsTotal,
  aiTokensTotal,
  anthropicPromptCacheHitTotal,
  externalHttpDurationMs,
  externalHttpRequestsTotal,
} from "../obs/metrics.js";
import { aiSpan, type AiSpanResultMeta } from "../obs/spans.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicCallOptions {
  timeoutMs?: number;
  endpoint?: string;
  /**
   * Зовнішній AbortSignal (зазвичай — client-disconnect на Express `req`).
   * Комбінується з внутрішнім timeout-signal через `AbortSignal.any`, тому
   * спрацьовує що завгодно: таймаут, клієнт закрив вкладку, або зовнішній
   * caller вирішив перервати.
   */
  signal?: AbortSignal;
  /**
   * Версія system prompt (SYSTEM_PROMPT_VERSION). Якщо передано, `recordUsage`
   * інкрементує `anthropic_prompt_cache_hit_total{version, outcome}` —
   * per-request лічильник cache hit/miss.
   */
  promptVersion?: string;
}

/**
 * Компонує внутрішній timeout-signal з опціональним зовнішнім caller-signal-ом.
 * Використовує `AbortSignal.any` (Node 20+): aборт будь-якого з signals
 * скасовує результатний. Старий шлях (тільки timeout-контролер) залишається
 * для викликів без `external`.
 */
function composeSignal(
  internalController: AbortController,
  external: AbortSignal | undefined,
): AbortSignal {
  if (!external) return internalController.signal;
  try {
    if ("any" in AbortSignal) {
      const anyFn = AbortSignal.any as (signals: AbortSignal[]) => AbortSignal;
      if (typeof anyFn === "function") {
        return anyFn([internalController.signal, external]);
      }
    }
  } catch {
    /* fallthrough to listener-based fallback */
  }
  if (external.aborted) internalController.abort();
  else {
    external.addEventListener("abort", () => internalController.abort(), {
      once: true,
    });
  }
  return internalController.signal;
}

export interface AnthropicMessagesResult {
  response: Response | null;
  data: Record<string, unknown>;
}

export interface AnthropicStreamResult {
  response: Response;
  recordStreamEnd: (outcome?: string) => void;
}

interface RecordOutcomeMeta {
  model: string;
  endpoint: string;
  ms: number | null;
}

function recordOutcome(outcome: string, meta: RecordOutcomeMeta): void {
  const { model, endpoint, ms } = meta;
  try {
    externalHttpRequestsTotal.inc({ upstream: "anthropic", outcome });
    if (ms != null) {
      externalHttpDurationMs.observe({ upstream: "anthropic", outcome }, ms);
    }
    aiRequestsTotal.inc({
      provider: "anthropic",
      model: model || "unknown",
      endpoint: endpoint || "unknown",
      outcome,
    });
    if (ms != null) {
      aiRequestDurationMs.observe(
        {
          provider: "anthropic",
          model: model || "unknown",
          endpoint: endpoint || "unknown",
          outcome,
        },
        ms,
      );
    }
  } catch {
    /* metrics must never break a request */
  }
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  /**
   * Anthropic prompt-caching: токени які були записані в кеш (перший хіт або
   * post-invalidation refresh). `cache_read_input_tokens` — токени які були
   * віддані з кешу без передавання в LLM (основний джерело економії).
   * Див. https://docs.claude.com/en/docs/build-with-claude/prompt-caching.
   */
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicResponseData {
  usage?: AnthropicUsage;
  content?: Array<{ type: string; text?: string }>;
  [key: string]: unknown;
}

/**
 * Anthropic per-million-token pricing (USD). Sources:
 * https://www.anthropic.com/pricing — як на 2025-Q1.
 *
 * Ключі — model-prefix, що матчить `pickPricing()` через `startsWith`. Це
 * стійкіше за повну назву моделі: Anthropic регулярно випускає subversions
 * (`-20240620`, `-20241022` …) з тим самим прайсингом, тому match-имо по
 * сімейству. Невідома модель → cost-counter не інкрементується (краще
 * "невідомо" ніж "0$ — все ок"). Cache prices: write = 1.25× input, read =
 * 0.10× input — це політика Anthropic prompt-caching.
 */
interface ModelPricing {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
  /** USD per 1M cache-write tokens */
  cacheWrite: number;
  /** USD per 1M cache-read tokens */
  cacheRead: number;
}

const ANTHROPIC_PRICING_USD_PER_MTOK: Record<string, ModelPricing> = {
  // Sonnet (3, 3.5, 3.7, 4.x): $3 / $15
  "claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-3-7-sonnet": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-3-5-sonnet": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "claude-3-sonnet": {
    input: 3.0,
    output: 15.0,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  // Haiku 3.5: $0.80 / $4
  "claude-3-5-haiku": {
    input: 0.8,
    output: 4.0,
    cacheWrite: 1.0,
    cacheRead: 0.08,
  },
  // Haiku 3: $0.25 / $1.25
  "claude-3-haiku": {
    input: 0.25,
    output: 1.25,
    cacheWrite: 0.3,
    cacheRead: 0.03,
  },
  // Opus 3 / 4: $15 / $75
  "claude-opus-4": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
  "claude-3-opus": {
    input: 15.0,
    output: 75.0,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
};

function pickPricing(model: string): ModelPricing | null {
  if (!model || model === "unknown") return null;
  for (const [prefix, price] of Object.entries(
    ANTHROPIC_PRICING_USD_PER_MTOK,
  )) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}

/**
 * Public helper для streaming-шляху: chat.ts витягує `usage` з SSE
 * `message_start` події і викликає це безпосередньо. Дублює логіку internal
 * `recordUsage`, але без `data` wrapper-а — той `recordUsage` залишається для
 * non-streaming `anthropicMessages()`-callsites, де usage сидить у JSON-боді.
 */
export function recordAnthropicUsage(
  model: string,
  endpoint: string,
  usage: AnthropicUsage | null | undefined,
  promptVersion?: string,
): void {
  if (!usage) return;
  recordUsage(model, endpoint, { usage }, promptVersion);
}

function recordUsage(
  model: string,
  endpoint: string,
  data: AnthropicResponseData | null,
  promptVersion?: string,
): void {
  try {
    const usage = data?.usage;
    if (!usage) return;
    const ep = endpoint || "unknown";

    // Tokens-counter тепер несе `endpoint` — раніше всі `prompt`-токени всіх
    // endpoint-ів зливались в одну series, тому "котрий endpoint спалив
    // 10M токенів за день" доводилось реконструювати з логів.
    if (Number.isFinite(usage.input_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, endpoint: ep, kind: "prompt" },
        usage.input_tokens,
      );
    }
    if (Number.isFinite(usage.output_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, endpoint: ep, kind: "completion" },
        usage.output_tokens,
      );
    }
    // Prompt-caching: окремі series, щоб в Grafana був явний cache hit/miss
    // без реконструкції з різниці prompt − cache. `cache_write` биває
    // при першому хіті в вікні життя кешу (або після бампу SYSTEM_PROMPT_VERSION),
    // `cache_read` — при кожному наступному хіті.
    if (Number.isFinite(usage.cache_creation_input_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, endpoint: ep, kind: "cache_write" },
        usage.cache_creation_input_tokens,
      );
    }
    if (Number.isFinite(usage.cache_read_input_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, endpoint: ep, kind: "cache_read" },
        usage.cache_read_input_tokens,
      );
    }
    // Per-request cache outcome counter for Grafana dashboards.
    if (promptVersion) {
      const cacheRead = usage.cache_read_input_tokens ?? 0;
      anthropicPromptCacheHitTotal.inc({
        version: promptVersion,
        outcome: cacheRead > 0 ? "hit" : "miss",
      });
    }
    // Cost estimate per request (USD). Безпечно інкрементує counter навіть
    // дробовими значеннями (prom-client це підтримує). Невідома модель →
    // нічого не інкрементуємо.
    const price = pickPricing(model);
    if (price) {
      const inTok = Number.isFinite(usage.input_tokens)
        ? usage.input_tokens!
        : 0;
      const outTok = Number.isFinite(usage.output_tokens)
        ? usage.output_tokens!
        : 0;
      const cwTok = Number.isFinite(usage.cache_creation_input_tokens)
        ? usage.cache_creation_input_tokens!
        : 0;
      const crTok = Number.isFinite(usage.cache_read_input_tokens)
        ? usage.cache_read_input_tokens!
        : 0;
      const usd =
        (inTok * price.input +
          outTok * price.output +
          cwTok * price.cacheWrite +
          crTok * price.cacheRead) /
        1_000_000;
      if (usd > 0) {
        aiCostEstimateUsd.inc(
          { provider: "anthropic", model, endpoint: ep },
          usd,
        );
      }
    }
  } catch {
    /* ignore */
  }
}

export async function anthropicMessages(
  apiKey: string,
  payload: Record<string, unknown>,
  {
    timeoutMs = 20000,
    endpoint = "unknown",
    signal: externalSignal,
    promptVersion,
  }: AnthropicCallOptions = {},
): Promise<AnthropicMessagesResult> {
  const model = (payload?.model as string) || "unknown";
  return aiSpan(
    `anthropic.messages ${endpoint}`,
    () =>
      anthropicMessagesInner(
        apiKey,
        payload,
        { timeoutMs, endpoint, signal: externalSignal, promptVersion },
        model,
      ),
    {
      provider: "anthropic",
      model,
      endpoint,
      promptVersion,
    },
  );
}

async function anthropicMessagesInner(
  apiKey: string,
  payload: Record<string, unknown>,
  {
    timeoutMs = 20000,
    endpoint = "unknown",
    signal: externalSignal,
    promptVersion,
  }: AnthropicCallOptions,
  model: string,
): Promise<[AnthropicMessagesResult, AiSpanResultMeta]> {
  const maxAttempts = 3;
  const retryDelayMs = [0, 250, 750];
  const overallStart = process.hrtime.bigint();

  let lastResponse: Response | null = null;
  let lastData: Record<string, unknown> = {};

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Зовнішній abort (клієнт відвалився) має перервати retry-цикл одразу —
    // немає сенсу ретраїти запит, на який уже ніхто не чекає.
    if (externalSignal?.aborted) {
      const ms = Number(process.hrtime.bigint() - overallStart) / 1e6;
      recordOutcome("timeout", { model, endpoint, ms });
      throw new DOMException("client disconnected", "AbortError");
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const signal = composeSignal(controller, externalSignal);
    try {
      if (retryDelayMs[attempt - 1]) {
        await sleep(retryDelayMs[attempt - 1]);
      }

      const response = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
        signal,
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as AnthropicResponseData;
      lastResponse = response;
      lastData = data;

      // Ретраїмо тільки тимчасові/перевантажені стани.
      if (shouldRetryStatus(response.status) && attempt < maxAttempts) continue;

      const ms = Number(process.hrtime.bigint() - overallStart) / 1e6;
      const meta = buildSpanMeta(data, response.ok, response.status);
      if (response.ok) {
        recordOutcome("ok", { model, endpoint, ms });
        recordUsage(model, endpoint, data, promptVersion);
      } else {
        recordOutcome(response.status === 429 ? "rate_limited" : "error", {
          model,
          endpoint,
          ms,
        });
      }
      return [{ response, data }, meta];
    } catch (e: unknown) {
      // На явний timeout (AbortError) краще не "допалювати" запити.
      if (isAbortError(e) || attempt >= maxAttempts) {
        const ms = Number(process.hrtime.bigint() - overallStart) / 1e6;
        recordOutcome(isAbortError(e) ? "timeout" : "error", {
          model,
          endpoint,
          ms,
        });
        throw e;
      }
      continue;
    } finally {
      clearTimeout(t);
    }
  }

  // На випадок якщо цикл завершився без return (теоретично не має статись).
  return [{ response: lastResponse, data: lastData }, { outcome: "unknown" }];
}

function buildSpanMeta(
  data: AnthropicResponseData,
  ok: boolean,
  status: number,
): AiSpanResultMeta {
  const usage = data?.usage;
  const meta: AiSpanResultMeta = {};
  if (usage) {
    if (Number.isFinite(usage.input_tokens)) {
      meta.tokensIn =
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
    }
    if (Number.isFinite(usage.output_tokens)) {
      meta.tokensOut = usage.output_tokens;
    }
    if (Number.isFinite(usage.cache_read_input_tokens)) {
      meta.promptCacheHit = (usage.cache_read_input_tokens ?? 0) > 0;
    }
  }
  if (!ok) {
    meta.outcome = status === 429 ? "rate_limited" : `http_${status}`;
  }
  return meta;
}

/**
 * Стрімова версія Anthropic Messages API. Викликає fetch з `stream: true`,
 * інструментує outcome/latency (розмір відповіді = час до закриття з'єднання),
 * і повертає `{ response, recordStreamEnd }`. Викликай `recordStreamEnd(outcome?)`
 * коли боді повністю спожите (або з помилкою) щоб закрити latency-вимір.
 *
 * Таймаут (`AbortController`) навмисно НЕ гаситься у `finally`: боді SSE
 * споживається у caller-і після повернення з цієї функції, тому abort-таймер
 * мусить жити до виклику `recordStreamEnd`, щоб захистити stream від зависання.
 */
export async function anthropicMessagesStream(
  apiKey: string,
  payload: Record<string, unknown>,
  opts: AnthropicCallOptions = {},
): Promise<AnthropicStreamResult> {
  const model = (payload?.model as string) || "unknown";
  const endpoint = opts.endpoint ?? "unknown";
  return aiSpan(
    `anthropic.messages.stream ${endpoint}`,
    () => anthropicMessagesStreamInner(apiKey, payload, opts, model),
    {
      provider: "anthropic",
      model,
      endpoint,
      promptVersion: opts.promptVersion,
    },
  );
}

async function anthropicMessagesStreamInner(
  apiKey: string,
  payload: Record<string, unknown>,
  {
    endpoint = "unknown",
    timeoutMs = 60000,
    signal: externalSignal,
  }: AnthropicCallOptions,
  model: string,
): Promise<AnthropicStreamResult> {
  const start = process.hrtime.bigint();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const signal = composeSignal(controller, externalSignal);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...payload, stream: true }),
      signal,
    });
  } catch (e: unknown) {
    clearTimeout(t);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    recordOutcome(isAbortError(e) ? "timeout" : "error", {
      model,
      endpoint,
      ms,
    });
    throw e;
  }

  if (!response.ok) {
    clearTimeout(t);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    recordOutcome(response.status === 429 ? "rate_limited" : "error", {
      model,
      endpoint,
      ms,
    });
    return { response, recordStreamEnd: () => {} };
  }

  let settled = false;
  const recordStreamEnd = (outcome: string = "ok"): void => {
    if (settled) return;
    settled = true;
    clearTimeout(t);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    recordOutcome(outcome, { model, endpoint, ms });
  };

  return { response, recordStreamEnd };
}

export function extractAnthropicText(
  data: AnthropicResponseData | null | undefined,
): string {
  return (data?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();
}

function shouldRetryStatus(status: number): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 529
  );
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string };
  return err.name === "AbortError" || /abort/i.test(String(err.message || ""));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
