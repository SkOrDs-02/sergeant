import {
  aiCostEstimateUsd,
  aiRequestDurationMs,
  aiRequestsTotal,
  aiTokensTotal,
  anthropicPromptCacheHitTotal,
  externalHttpDurationMs,
  externalHttpRequestsTotal,
} from "../obs/metrics.js";
import { env } from "../env.js";
import { estimateAnthropicCostUsd } from "./aiPricing.js";
import { recordAnthropicUsageToDb } from "./anthropicUsageStore.js";
import { elapsedMs, sleep } from "./timing.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/messages";

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
  /**
   * Better Auth user-id для per-user cost-ledger у `ai_usage_daily`. Якщо
   * передано — `recordUsage` пише додатковий per-user рядок поряд із global
   * aggregate. `undefined` (anon / machine-caller) → лише global.
   */
  userId?: string | undefined;
  /**
   * Рішення виклику піти через OpenRouter — уже обчислене, не прапорець
   * «можна». Opt-in навмисно per-callsite: `anthropic.ts` спільний для digest,
   * nutrition, mono й classify, і їхній прямий шлях в `api.anthropic.com` має
   * лишатись незмінним. Без цього поля транспорт не перемикається взагалі.
   *
   * WHY рішення, а не дозвіл: гейт колись жив усередині `pickTransport` і
   * читав `CHAT_VIA_OPENROUTER`. Щойно на шлюз знадобилось перевести другий
   * незалежний шлях (зір), спільний прапорець зробив би відкат одного
   * відкатом обох. Тепер кожен шлях приносить власну умову.
   */
  allowOpenRouter?: boolean | undefined;
  /**
   * Сумарна стеля на ОДИН логічний виклик, включно зі сном між ретраями
   * (B42). За замовчуванням `timeoutMs * 2`. `timeoutMs` лишається бюджетом
   * однієї спроби — плутати їх не можна: саме через це 429 з довгим
   * `retry-after` міг розтягнути «20-секундний» виклик на дві хвилини.
   */
  maxTotalMs?: number | undefined;
}

/**
 * Обирає URL + заголовки авторизації для одного запиту.
 *
 * Тіло запиту однакове для обох шлюзів: OpenRouter віддає Anthropic-сумісний
 * Messages API — та сама граматика SSE-подій, ті самі `tool_use` /
 * `input_json_delta`. Різниця лише в ендпоінті й схемі авторизації.
 *
 * Немає ключа шлюзу → тихо лишаємось на прямому Anthropic: краще деградувати
 * до робочого транспорту, ніж віддати 401. Про відсутній ключ попереджає
 * `assertStartupEnv()` на старті.
 */
function pickTransport(
  apiKey: string,
  allowOpenRouter: boolean | undefined,
): { url: string; headers: Record<string, string> } {
  if (allowOpenRouter && env.OPENROUTER_API_KEY) {
    return {
      url: OPENROUTER_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "anthropic-version": "2023-06-01",
      },
    };
  }
  return {
    url: ANTHROPIC_URL,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  };
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
  /**
   * OpenRouter-only: сума в USD, яку шлюз реально списав за цей виклик.
   * Дзеркалить `StreamUsage.cost` у `modules/chat/chatShared.ts` — без цього
   * поля тип мовчки розходився з тим, що реально прилітає зі стріму, і
   * cost-шлях виглядав «мертвим» для читача.
   */
  cost?: number;
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
  userId?: string,
): void {
  if (!usage) return;
  recordUsage(model, endpoint, { usage }, promptVersion, userId);
}

function recordUsage(
  model: string,
  endpoint: string,
  data: AnthropicResponseData | null,
  promptVersion?: string,
  userId?: string,
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
    // дробовими значеннями (prom-client це підтримує).
    //
    // AI-DANGER: НЕ повертай сюди гейт `if (pickAnthropicPricing(model))`.
    // `estimateAnthropicCostUsd` сам віддає `null` для невідомої моделі, але
    // ПЕРЕД тим бере `usage.cost` — фактичну суму від OpenRouter. Гейт
    // відсікав рівно той випадок, заради якого cost-поле й існує: моделі
    // шлюзу (`deepseek/deepseek-v4-flash`, `z-ai/glm-5.2`) у таблиці цін
    // відсутні, тож під `CHAT_VIA_OPENROUTER=true` лічильник стояв на нулі —
    // а `anthropicBudgetGuard` читає саме його, тобто стеля $3/$5 не бачила
    // найдорожчої поверхні взагалі. Знахідка B1,
    // `docs/90-work/audits/ai-pipeline-2026-08-05.md`.
    const usd = estimateAnthropicCostUsd(model, usage) ?? 0;
    if (usd > 0) {
      aiCostEstimateUsd.inc(
        { provider: "anthropic", model, endpoint: ep },
        usd,
      );
    }
    // PR-12: persistent USD ledger у `ai_usage_daily` (паралельно з
    // Prometheus). Fire-and-forget — fail-open усередині helper-а, тому
    // ledger-failure НЕ ламає Anthropic-flow. `void` навмисно, щоб eslint
    // no-floating-promises не репортив (recordAnthropicUsageToDb сам
    // ковтає рантайм-помилки).
    //
    // `ep` і `usage.cost` раніше сюди не доїжджали, хоч на два рядки вище
    // обидва вже пораховані для Prometheus. Наслідок був у тому, що леджер
    // складав усі кроки в один рядок `endpoint='legacy'` і знав лише
    // оцінку за прайс-таблицею — тобто на питання «скільки коштує цей
    // конкретний конвеєр» відповідав лише лічильник у памʼяті, який не
    // переживає деплой.
    void recordAnthropicUsageToDb(
      model,
      usage,
      userId,
      ep,
      typeof usage.cost === "number" ? usage.cost : undefined,
    );
  } catch {
    /* ignore */
  }
}

export async function anthropicMessages(
  apiKey: string,
  payload: Record<string, unknown>,
  opts: AnthropicCallOptions = {},
): Promise<AnthropicMessagesResult> {
  const model = (payload?.["model"] as string) || "unknown";
  // WHY передаємо `opts` цілим, а не перезбираємо по полях: попередня версія
  // перелічувала поля вручну, і кожне нове мовчки губилось по дорозі в inner
  // (без помилки типів — просто не діяло). Дефолти лишаються в inner.
  return anthropicMessagesInner(apiKey, payload, opts, model);
}

async function anthropicMessagesInner(
  apiKey: string,
  payload: Record<string, unknown>,
  {
    timeoutMs = 20000,
    endpoint = "unknown",
    signal: externalSignal,
    promptVersion,
    userId,
    allowOpenRouter,
    maxTotalMs: maxTotalMsOpt,
  }: AnthropicCallOptions,
  model: string,
): Promise<AnthropicMessagesResult> {
  const transport = pickTransport(apiKey, allowOpenRouter);
  const maxAttempts = 3;
  // T2 audit finding #9 — jitterless `[0, 250, 750]` ms cascade ignored
  // the upstream `retry-after` hint and stamped concurrent users at the
  // same retry timestamp (thundering herd). Static fallbacks now carry
  // ±25% jitter; the `retry-after` header (or Anthropic-specific
  // `anthropic-ratelimit-*-reset`) is preferred when the previous
  // response was a 429.
  const retryDelayMs = [0, 250, 750];
  const overallStart = process.hrtime.bigint();

  // B42 (`docs/90-work/audits/ai-testing-2026-08-25.md`) — сумарний бюджет.
  //
  // `computeRetryDelayMs` клампить сон до `timeoutMs`, але це бюджет ОДНІЄЇ
  // спроби, не запиту. 429 з `retry-after: 60` при `timeoutMs=60000` давав
  // 60 с сну плюс свіжий 60-секундний fetch — понад 120 с на один логічний
  // виклик, тобто рівно за глобальний 120-с ліміт `http/timeout.ts`.
  //
  // Дефолт `timeoutMs * 2` — це «одна повна спроба плюс одна повторна»:
  // більше все одно не встигне, бо далі рубає глобальний таймаут.
  const maxTotalMs = maxTotalMsOpt ?? timeoutMs * 2;
  // Нижче цього спроба безглузда: TLS+запит не встигнуть, і ми лише
  // спалимо квоту провайдера, щоб отримати власний abort.
  const MIN_USEFUL_ATTEMPT_MS = 1_000;
  const elapsedMs = () => Number(process.hrtime.bigint() - overallStart) / 1e6;

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
    // Сон ПЕРЕД тим, як озброїти таймер спроби. Доти таймер стартував
    // раніше за сон, тож довгий `retry-after` зʼїдав увесь бюджет самої
    // спроби — fetch відрубувався майже одразу після пробудження.
    const baseDelay = retryDelayMs[attempt - 1] ?? 0;
    if (baseDelay) {
      const delay = computeRetryDelayMs({
        baseMs: baseDelay,
        timeoutMs,
        previousResponse: lastResponse,
      });
      // Немає бюджету на сон І корисну спробу після нього — далі не йдемо.
      // Повертаємо останню відповідь (як правило, 429), а не власний abort:
      // caller побачить справжню причину від провайдера.
      if (delay + MIN_USEFUL_ATTEMPT_MS > maxTotalMs - elapsedMs()) break;
      await sleep(delay);
    }

    // Таймаут спроби не може виходити за сумарний бюджет.
    //
    // Перевірка залишку СТОЇТЬ ОКРЕМО від `Math.min` навмисно. Перша версія
    // писала `Math.max(MIN_USEFUL_ATTEMPT_MS, Math.min(timeoutMs, залишок))`
    // — і цим РОЗТЯГУВАЛА вичерпаний бюджет: при залишку 1 мс спроба все
    // одно стартувала з таймаутом 1000 мс, тобто `maxTotalMs` переставав
    // бути стелею рівно там, де він потрібен (ревʼю CodeRabbit 2026-08-26).
    // Гілка `break` вище ловила лише випадок зі сном, а перша спроба має
    // `baseDelay === 0` і крізь неї проходила.
    const remainingMs = maxTotalMs - elapsedMs();
    if (remainingMs < MIN_USEFUL_ATTEMPT_MS) break;
    const attemptTimeoutMs = Math.min(timeoutMs, remainingMs);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), attemptTimeoutMs);
    const signal = composeSignal(controller, externalSignal);
    try {
      const response = await fetch(transport.url, {
        method: "POST",
        headers: transport.headers,
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
        recordUsage(model, endpoint, data, promptVersion, userId);
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
 * інструментує outcome/latency (розмір відповіді = час до закриття зʼєднання),
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
  return anthropicMessagesStreamInner(apiKey, payload, opts, model);
}

async function anthropicMessagesStreamInner(
  apiKey: string,
  payload: Record<string, unknown>,
  {
    endpoint = "unknown",
    timeoutMs = 60000,
    signal: externalSignal,
    allowOpenRouter,
  }: AnthropicCallOptions,
  model: string,
): Promise<AnthropicStreamResult> {
  const transport = pickTransport(apiKey, allowOpenRouter);
  const start = process.hrtime.bigint();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const signal = composeSignal(controller, externalSignal);

  let response: Response;
  try {
    response = await fetch(transport.url, {
      method: "POST",
      headers: transport.headers,
      body: JSON.stringify({ ...payload, stream: true }),
      signal,
    });
  } catch (e: unknown) {
    clearTimeout(t);
    const ms = elapsedMs(start);
    recordOutcome(isAbortError(e) ? "timeout" : "error", {
      model,
      endpoint,
      ms,
    });
    throw e;
  }

  if (!response.ok) {
    clearTimeout(t);
    const ms = elapsedMs(start);
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
    const ms = elapsedMs(start);
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
