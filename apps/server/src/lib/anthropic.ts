import {
  aiRequestDurationMs,
  aiRequestsTotal,
  aiTokensTotal,
  anthropicPromptCacheHitTotal,
  externalHttpDurationMs,
  externalHttpRequestsTotal,
} from "../obs/metrics.js";

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

function recordUsage(
  model: string,
  data: AnthropicResponseData | null,
  promptVersion?: string,
): void {
  try {
    const usage = data?.usage;
    if (!usage) return;
    if (Number.isFinite(usage.input_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, kind: "prompt" },
        usage.input_tokens,
      );
    }
    if (Number.isFinite(usage.output_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, kind: "completion" },
        usage.output_tokens,
      );
    }
    // Prompt-caching: окремі series, щоб в Grafana був явний cache hit/miss
    // без реконструкції з різниці prompt − cache. `cache_write` биває
    // при першому хіті в вікні життя кешу (або після бампу SYSTEM_PROMPT_VERSION),
    // `cache_read` — при кожному наступному хіті.
    if (Number.isFinite(usage.cache_creation_input_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, kind: "cache_write" },
        usage.cache_creation_input_tokens,
      );
    }
    if (Number.isFinite(usage.cache_read_input_tokens)) {
      aiTokensTotal.inc(
        { provider: "anthropic", model, kind: "cache_read" },
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
  const maxAttempts = 3;
  const retryDelayMs = [0, 250, 750];
  const model = (payload?.model as string) || "unknown";
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
      if (response.ok) {
        recordOutcome("ok", { model, endpoint, ms });
        recordUsage(model, data, promptVersion);
      } else {
        recordOutcome(response.status === 429 ? "rate_limited" : "error", {
          model,
          endpoint,
          ms,
        });
      }
      return { response, data };
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
  return { response: lastResponse, data: lastData };
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
  {
    endpoint = "unknown",
    timeoutMs = 60000,
    signal: externalSignal,
  }: AnthropicCallOptions = {},
): Promise<AnthropicStreamResult> {
  const model = (payload?.model as string) || "unknown";
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
