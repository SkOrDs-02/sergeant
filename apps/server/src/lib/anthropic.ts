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
import { estimateAnthropicCostUsd, pickAnthropicPricing } from "./aiPricing.js";
import { recordAnthropicUsageToDb } from "./anthropicUsageStore.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export interface AnthropicCallOptions {
  timeoutMs?: number | undefined;
  endpoint?: string | undefined;
  /**
   * Зовнішній AbortSignal (зазвичай — client-disconnect на Express `req`).
   * Комбінується з внутрішнім timeout-signal через `AbortSignal.any`, тому
   * спрацьовує що завгодно: таймаут, клієнт закрив вкладку, або зовнішній
   * caller вирішив перервати.
   */
  signal?: AbortSignal | undefined;
  /**
   * Версія system prompt (SYSTEM_PROMPT_VERSION). Якщо передано, `recordUsage`
   * інкрементує `anthropic_prompt_cache_hit_total{version, outcome}` —
   * per-request лічильник cache hit/miss.
   */
  promptVersion?: string | undefined;
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

// AI-NOTE: per-million-token pricing live in `./aiPricing.ts` (extracted у
// PR-12, щоб DB-ledger і Prometheus-counter могли шарити one source of
// truth). `pickAnthropicPricing()` повертає той самий ModelPricing-shape
// (input/output/cacheWrite/cacheRead per MTok).

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
    if (pickAnthropicPricing(model)) {
      const usd = estimateAnthropicCostUsd(model, usage) ?? 0;
      if (usd > 0) {
        aiCostEstimateUsd.inc(
          { provider: "anthropic", model, endpoint: ep },
          usd,
        );
      }
    }
    // PR-12: persistent USD ledger у `ai_usage_daily` (паралельно з
    // Prometheus). Fire-and-forget — fail-open усередині helper-а, тому
    // ledger-failure НЕ ламає Anthropic-flow. `void` навмисно, щоб eslint
    // no-floating-promises не репортив (recordAnthropicUsageToDb сам
    // ковтає рантайм-помилки).
    void recordAnthropicUsageToDb(model, usage);
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
  const model = (payload?.["model"] as string) || "unknown";
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
      ...(promptVersion ? { promptVersion } : {}),
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
  // T2 audit finding #9 — jitterless `[0, 250, 750]` ms cascade ignored
  // the upstream `retry-after` hint and stamped concurrent users at the
  // same retry timestamp (thundering herd). Static fallbacks now carry
  // ±25% jitter; the `retry-after` header (or Anthropic-specific
  // `anthropic-ratelimit-*-reset`) is preferred when the previous
  // response was a 429.
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
      const baseDelay = retryDelayMs[attempt - 1] ?? 0;
      if (baseDelay) {
        await sleep(
          computeRetryDelayMs({
            baseMs: baseDelay,
            timeoutMs,
            previousResponse: lastResponse,
          }),
        );
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
      meta.tokensOut = usage.output_tokens ?? 0;
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
  const model = (payload?.["model"] as string) || "unknown";
  const endpoint = opts.endpoint ?? "unknown";
  return aiSpan(
    `anthropic.messages.stream ${endpoint}`,
    () => anthropicMessagesStreamInner(apiKey, payload, opts, model),
    {
      provider: "anthropic",
      model,
      endpoint,
      ...(opts.promptVersion ? { promptVersion: opts.promptVersion } : {}),
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

/**
 * T2 audit finding #9 — choose the actual sleep window before the next
 * retry. Prefers the upstream `retry-after` header (or Anthropic-specific
 * `anthropic-ratelimit-*-reset`) when the previous response was a 429,
 * falls back to a jittered `baseMs`, and clamps to `timeoutMs` to keep
 * retries inside the overall request budget. Exported for unit testing.
 */
export function computeRetryDelayMs(input: {
  baseMs: number;
  timeoutMs: number;
  previousResponse: Response | null;
}): number {
  const { baseMs, timeoutMs, previousResponse } = input;
  const max = Math.max(0, timeoutMs);
  if (previousResponse && previousResponse.status === 429) {
    const hinted = readUpstreamRetryAfterMs(previousResponse);
    if (hinted !== null) return Math.min(hinted, max);
  }
  // ±25% jitter around `baseMs` to avoid thundering-herd retries from
  // concurrent users that all hit 429 at the same instant.
  const jitter = baseMs * 0.25 * (Math.random() * 2 - 1);
  return Math.min(Math.max(0, Math.round(baseMs + jitter)), max);
}

function readUpstreamRetryAfterMs(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const asInt = Number.parseInt(retryAfter, 10);
    if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
    const asDate = Date.parse(retryAfter);
    if (Number.isFinite(asDate)) {
      const delta = asDate - Date.now();
      if (delta > 0) return delta;
    }
  }
  // Anthropic also ships `anthropic-ratelimit-{tokens,requests}-reset` —
  // RFC 3339 timestamps for when each bucket refills.
  const candidates = [
    "anthropic-ratelimit-tokens-reset",
    "anthropic-ratelimit-requests-reset",
    "anthropic-ratelimit-input-tokens-reset",
    "anthropic-ratelimit-output-tokens-reset",
  ];
  let earliestMs: number | null = null;
  for (const header of candidates) {
    const value = response.headers.get(header);
    if (!value) continue;
    const at = Date.parse(value);
    if (!Number.isFinite(at)) continue;
    const delta = at - Date.now();
    if (delta > 0 && (earliestMs === null || delta < earliestMs)) {
      earliestMs = delta;
    }
  }
  return earliestMs;
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; message?: string };
  return err.name === "AbortError" || /abort/i.test(String(err.message || ""));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
