/** @status Active */
// AI-CONTEXT: PR-23 (Phase 3 reliability). Зараз код прямо викликає
// `anthropicMessages()` з `lib/anthropic.ts`. Якщо Anthropic падає (5xx,
// circuit-breaker open, мережевий outage) — все що використовує LLM не
// працює. `LLMProvider` — це тонкий interface, що дозволяє pluggable
// fallback на іншого provider-а (OpenRouter, OpenAI) або no-op stub
// для read-only OpenClaw-paths-ів і dev-tests, де живий ключ не потрібен.
//
// Цей PR (PR-23) НЕ міняє call-sites. Він лише вводить interface +
// AnthropicProvider (existing logic) + StubProvider + factory. Wire-up:
// PR-24 (OpenClaw classify → factory) і PR-25 (weekly-digest → factory).
//
// Контракт навмисно тонший за повний Anthropic Messages API: ми моделюємо
// тільки те, що зараз використовують call-sites (single-shot generate з
// system + messages + tools). Streaming — окремий interface майбутнього
// `LLMStreamProvider`, тут не моделюємо, бо streaming-call-sites (chat.ts)
// мають інші вимоги до latency / outcome-tracking.

import { env } from "../../env/env.js";
import {
  aiCostEstimateUsd,
  aiRequestsTotal,
  aiTokensTotal,
  llmProviderInvocationsTotal,
} from "../../obs/metrics.js";
import { logger } from "../../obs/logger.js";
import { estimateAnthropicCostUsd } from "../aiPricing.js";
import { recordAnthropicUsageToDb } from "../anthropicUsageStore.js";
import { Sentry } from "../../sentry.js";
import { anthropicMessages, extractAnthropicText } from "../anthropic.js";
import { getCounterpartyNames } from "../counterpartyNames.js";
import { maskMachineText } from "../llmRedaction.js";

/**
 * Канонічний дискримінатор provider-у. Розширюємо по мірі додавання
 * нових: `openrouter`, `openai`, `groq`, etc. Зберігаємо літерали (а не
 * `string`), щоб TypeScript ловив typo у factory й runtime-config-у.
 */
export type LLMProviderName = "anthropic" | "openrouter" | "stub";

/**
 * Один message у multi-turn діалозі. Mirrors Anthropic Messages API
 * shape — найпростіший common-denominator серед усіх провайдерів
 * (OpenAI/OpenRouter використовують `role: "system"` як message, але
 * у `generate()` system — окреме поле, тому тут лише user/assistant).
 */
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Параметри single-shot generation. Mapping під різні провайдери —
 * відповідальність конкретної реалізації:
 *
 * | LLMGenerateOpts        | Anthropic                | OpenAI/OpenRouter         |
 * | ---------------------- | ------------------------ | ------------------------- |
 * | `model`                | `model`                  | `model`                   |
 * | `system`               | top-level `system`       | first `{role:"system"}`   |
 * | `messages`             | `messages`               | `messages` (без system)   |
 * | `maxTokens`            | `max_tokens`             | `max_tokens`              |
 * | `temperature`          | `temperature`            | `temperature`             |
 * | `endpoint`             | `metadata.endpoint`-аналог | `metadata`-аналог       |
 * | `timeoutMs`            | `AbortSignal` через сетер | те саме                  |
 * | `signal`               | composeSignal             | composeSignal             |
 * | `promptVersion`        | для cache-hit лічильника | (anthropic-specific)      |
 */
export interface LLMGenerateOpts {
  /** Канонічний model-id (e.g. `claude-sonnet-4-6`). Передається `as-is`. */
  model: string;
  /** Optional system prompt (буде проброшений у відповідне поле провайдера). */
  system?: string;
  /** Multi-turn messages (без system — він окремо). */
  messages: LLMMessage[];
  /** Max output tokens. */
  maxTokens: number;
  /** Sampling temperature (`0` для деtermistic, `0.7` typical chat). */
  temperature?: number | undefined;
  /** Endpoint-tag для observability metrics (`day-plan`, `coach`, etc). */
  endpoint?: string | undefined;
  /** Request timeout у мс. Якщо `undefined` — provider вирішує default. */
  timeoutMs?: number | undefined;
  /**
   * Зовнішній AbortSignal (зазвичай client-disconnect). Provider композить
   * його зі своїм внутрішнім timeout-signal через `AbortSignal.any`.
   */
  signal?: AbortSignal | undefined;
  /**
   * Версія system-prompt-у для Anthropic prompt-cache outcome counter.
   * Інші провайдери ігнорують.
   */
  promptVersion?: string | undefined;
  /**
   * Better Auth user-id для per-user cost-ledger. Пишуть обидва провайдери,
   * що ходять по грошах — `AnthropicProvider` і `OpenRouterProvider`; `Stub`
   * ігнорує. Необовʼязковий: без нього в `ai_usage_daily` лягає лише
   * provider-рядок (`provider:anthropic`), а саме його читає денна стеля.
   */
  userId?: string | undefined;
}

/**
 * Результат generate-виклику. Discriminated union на `ok` — caller-у
 * не потрібно перевіряти HTTP-status / parse JSON / витягувати text:
 * provider це робить, фарш-meta повертається уніфіковано.
 *
 * - `ok: true`  — успіх; `text` — стрипнутий content, `usage` — токени
 *                 (якщо provider репортить).
 * - `ok: false` — будь-який не-2xx або thrown error; `error` — короткий
 *                 user-facing message, `status` — HTTP status (якщо є),
 *                 `code` — provider-specific або канонічний (`"timeout"`,
 *                 `"rate_limited"`, etc).
 */
export type LLMGenerateResult =
  | {
      ok: true;
      text: string;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadInputTokens?: number;
        cacheCreationInputTokens?: number;
      };
      /** Сирий response payload — для callers, яким потрібен `content[]` чи tools. */
      raw?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      code?: string;
      raw?: Record<string, unknown>;
    };

/**
 * Канонічний interface — провайдери імплементують `name` (для логування /
 * metrics labels) і `generate()`. `name` — `readonly` literal, щоб
 * `provider.name === "stub"` робив type-narrowing у callers.
 */
export interface LLMProvider {
  readonly name: LLMProviderName;
  generate(opts: LLMGenerateOpts): Promise<LLMGenerateResult>;
}

// ─── AnthropicProvider ──────────────────────────────────────────────
// Existing logic у `lib/anthropic.ts` залишається untouched: цей wrapper
// просто адаптує shape (`payload`/`{response, data}` → `LLMGenerateOpts`/
// `LLMGenerateResult`). Той самий retry/timeout/usage-recording flow.

/**
 * Anthropic-провайдер: бере `ANTHROPIC_API_KEY` з env у конструкторі або
 * через override (тестабельно). Метрики, prompt-caching, DB-ledger —
 * усе в `anthropicMessages()` залишається активним; ми лише адаптуємо
 * shape для callers, що працюють через `LLMProvider`.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;

  constructor(private readonly apiKey: string) {}

  async generate(opts: LLMGenerateOpts): Promise<LLMGenerateResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        error: "ANTHROPIC_API_KEY is not set",
        code: "missing_api_key",
      };
    }
    const payload: Record<string, unknown> = {
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: opts.messages,
    };
    if (opts.system !== undefined) payload["system"] = opts.system;
    if (opts.temperature !== undefined)
      payload["temperature"] = opts.temperature;

    const callOpts: Parameters<typeof anthropicMessages>[2] = {};
    if (opts.timeoutMs !== undefined) callOpts.timeoutMs = opts.timeoutMs;
    if (opts.endpoint !== undefined) callOpts.endpoint = opts.endpoint;
    if (opts.signal !== undefined) callOpts.signal = opts.signal;
    if (opts.promptVersion !== undefined)
      callOpts.promptVersion = opts.promptVersion;
    if (opts.userId !== undefined) callOpts.userId = opts.userId;

    try {
      const { response, data } = await anthropicMessages(
        this.apiKey,
        payload,
        callOpts,
      );
      if (!response || !response.ok) {
        const status = response?.status;
        const errMsg =
          (data as { error?: { message?: string } } | undefined)?.error
            ?.message ||
          (status ? `Anthropic returned HTTP ${status}` : "Anthropic error");
        return {
          ok: false,
          error: errMsg,
          ...(status !== undefined ? { status } : {}),
          code: status === 429 ? "rate_limited" : "anthropic_error",
          raw: data,
        };
      }
      const text = extractAnthropicText(data);
      const usage = (data as { usage?: Record<string, number> } | undefined)
        ?.usage;
      const result: LLMGenerateResult = {
        ok: true,
        text,
        raw: data,
      };
      if (usage) {
        const usageOut: NonNullable<
          Extract<LLMGenerateResult, { ok: true }>["usage"]
        > = {};
        if (typeof usage["input_tokens"] === "number")
          usageOut.inputTokens = usage["input_tokens"];
        if (typeof usage["output_tokens"] === "number")
          usageOut.outputTokens = usage["output_tokens"];
        if (typeof usage["cache_read_input_tokens"] === "number")
          usageOut.cacheReadInputTokens = usage["cache_read_input_tokens"];
        if (typeof usage["cache_creation_input_tokens"] === "number")
          usageOut.cacheCreationInputTokens =
            usage["cache_creation_input_tokens"];
        result.usage = usageOut;
      }
      return result;
    } catch (e: unknown) {
      const isAbort =
        e instanceof Error &&
        (e.name === "AbortError" ||
          (e as { code?: string }).code === "ABORT_ERR");
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: isAbort ? "timeout" : "anthropic_throw",
      };
    }
  }
}

// ─── StubProvider ───────────────────────────────────────────────────
// No-op, повертає hardcoded JSON-обгортку. Призначення:
//   1) read-only OpenClaw paths (наприклад, `before_dispatch` classify
//      коли LLM_PROVIDER=stub в e2e-tests або під час Anthropic outage —
//      caller отримує `{ "class": "chat" }` дефолт через extractor).
//   2) Unit-тести, де не треба викликати справжній HTTP.
//   3) Локальний dev без `ANTHROPIC_API_KEY` — нічого не падає, лише
//      stub-text-and-usage.

/**
 * StubProvider — повертає детерміністичний канонічний text. За замовчуванням:
 * `'{"ok":true,"stub":true}'` (валідний JSON для callers, які `JSON.parse`).
 * Може бути перекритий конструктором для test-specific responses.
 */
export class StubProvider implements LLMProvider {
  readonly name = "stub" as const;

  constructor(
    private readonly response: {
      text?: string;
      inputTokens?: number;
      outputTokens?: number;
    } = {},
  ) {}

  generate(_opts: LLMGenerateOpts): Promise<LLMGenerateResult> {
    return Promise.resolve({
      ok: true,
      text: this.response.text ?? '{"ok":true,"stub":true}',
      usage: {
        inputTokens: this.response.inputTokens ?? 0,
        outputTokens: this.response.outputTokens ?? 0,
      },
    });
  }
}

// ─── OpenRouterProvider ─────────────────────────────────────────────────
// OpenAI-compatible endpoint at openrouter.ai/api/v1/chat/completions.
// 300+ models including free tier (Gemma 4, Kimi K2, NVIDIA Nemotron).
// Does NOT support Anthropic-specific prompt-cache breakpoints — only use
// for non-streaming, non-tool-call paths (classify, digest, weekly-review).
//
// `modelOverride` (from env.OPENROUTER_MODEL) replaces the call-site model
// so ops can route all OpenRouter calls to a free model without touching
// call-site code.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Записує токени й вартість виклику, що пішов через нативний OpenRouter-шлях.
 *
 * WHY окрема функція, а не запис у `invokeLLM`: `AnthropicProvider` ходить
 * через `anthropicMessages`, який ці ж лічильники інкрементує САМ. Спільний
 * запис в обгортці подвоїв би облік Anthropic-шляху. Кожен транспорт пише
 * свій — тут це дзеркало того, що `lib/anthropic.ts` робить для свого.
 *
 * WHY лейбл `provider="anthropic"`, хоч транспорт openrouter: цей лейбл у
 * нашій схемі позначає ПУЛ витрат, а не вендора — під ним уже лежать
 * OpenRouter-моделі (`deepseek`, `glm-5.2`), бо чат ходить у шлюз через
 * Anthropic-сумісний ендпоінт. Головне ж — `anthropicBudgetGuard` сумує
 * рівно `provider="anthropic"`; з будь-яким іншим значенням ця витрата
 * лишилась би поза денною стелею, а саме через це діру й закриваємо.
 */
function recordOpenRouterUsage(
  model: string,
  endpoint: string | undefined,
  usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number },
  userId?: string | undefined,
): void {
  const labels = {
    provider: "anthropic",
    model,
    endpoint: endpoint ?? "unknown",
  };
  try {
    // Разом із токенами й вартістю — інакше три лічильники покривають різні
    // множини ендпоінтів, і `$/виклик` доводиться рахувати то через
    // `ai_requests_total`, то через `llm_provider_invocations_total`.
    aiRequestsTotal.inc({ ...labels, outcome: "ok" });
    if (typeof usage.prompt_tokens === "number")
      aiTokensTotal.inc({ ...labels, kind: "prompt" }, usage.prompt_tokens);
    if (typeof usage.completion_tokens === "number")
      aiTokensTotal.inc(
        { ...labels, kind: "completion" },
        usage.completion_tokens,
      );

    // `usage.cost` від шлюза — факт; таблиця цін — запасний шлях для моделей,
    // яких у ній немає, і тоді `null` означає «не рахуємо», а не «нуль».
    const usd = estimateAnthropicCostUsd(model, {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      cost: usage.cost ?? null,
    });
    if (usd !== null && usd > 0) aiCostEstimateUsd.inc(labels, usd);
  } catch {
    // Метрики — advisory. Збій реєстру не повинен ламати відповідь моделі.
  }

  // Той самий запис у persistent-леджер `ai_usage_daily`. Лічильники вище
  // живуть у памʼяті процесу, тож із кожним деплоєм починаються з нуля —
  // а деплоїв тут кілька на добу. Поки цей рядок не існував, витрати коуча,
  // дайджесту й readonly-шляху не переживали жодного рестарту, і денна
  // стеля `anthropicBudgetGuard` разом із ними починала добу заново.
  //
  // Поза try вище навмисно: збій prom-client-реєстру не має забирати з
  // собою запис у БД. Сам helper fail-open — ковтає власні помилки, тому
  // `void` тут не ховає нічого, що варто було б знати.
  void recordAnthropicUsageToDb(
    model,
    {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      cost: usage.cost ?? null,
    },
    userId,
    endpoint,
    typeof usage.cost === "number" ? usage.cost : undefined,
  );
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter" as const;

  constructor(
    private readonly apiKey: string,
    private readonly modelOverride: string = "",
  ) {}

  async generate(opts: LLMGenerateOpts): Promise<LLMGenerateResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        error: "OPENROUTER_API_KEY is not set",
        code: "missing_api_key",
      };
    }

    const model = this.modelOverride || opts.model;

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    for (const m of opts.messages)
      messages.push({ role: m.role, content: m.content });

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: opts.maxTokens,
      // Просимо шлюз повернути реальну списану суму в `usage.cost`. Без цього
      // прапорця він її не шле, і вартість довелося б оцінювати за
      // прайс-таблицею — а в ній немає половини моделей, якими ми ходимо
      // (`z-ai/glm-5.2`, `deepseek/deepseek-v4-flash`).
      usage: { include: true },
    };
    if (opts.temperature !== undefined) body["temperature"] = opts.temperature;

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (opts.timeoutMs !== undefined) {
      timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs);
      if (typeof (timeoutId as { unref?: () => void }).unref === "function") {
        (timeoutId as { unref: () => void }).unref();
      }
    }

    let signal: AbortSignal = controller.signal;
    if (opts.signal) {
      try {
        if ("any" in AbortSignal) {
          const anyFn = AbortSignal.any as (ss: AbortSignal[]) => AbortSignal;
          if (typeof anyFn === "function") {
            signal = anyFn([controller.signal, opts.signal]);
          }
        }
      } catch {
        if (opts.signal.aborted) controller.abort();
        else
          opts.signal.addEventListener("abort", () => controller.abort(), {
            once: true,
          });
      }
    }

    type OpenRouterData = {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        /**
         * Скільки шлюз реально списав за цей виклик. Приходить лише коли в
         * тілі запиту є `usage: { include: true }` (див. нижче). Це факт, а
         * не оцінка: враховує і націнку OpenRouter, і поточний прайс моделі.
         */
        cost?: number;
      };
      error?: { message?: string };
    };

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://sergeant.app",
          "X-Title": "Sergeant",
        },
        body: JSON.stringify(body),
        signal,
      });
      if (timeoutId) clearTimeout(timeoutId);

      const data = (await response.json()) as OpenRouterData;

      if (!response.ok) {
        return {
          ok: false,
          error: data?.error?.message ?? `OpenRouter HTTP ${response.status}`,
          status: response.status,
          code: response.status === 429 ? "rate_limited" : "openrouter_error",
          raw: data as Record<string, unknown>,
        };
      }

      const text = data?.choices?.[0]?.message?.content ?? "";
      const usage = data?.usage;
      const result: LLMGenerateResult = {
        ok: true,
        text,
        raw: data as Record<string, unknown>,
      };
      if (usage) {
        const usageOut: NonNullable<
          Extract<LLMGenerateResult, { ok: true }>["usage"]
        > = {};
        if (typeof usage.prompt_tokens === "number")
          usageOut.inputTokens = usage.prompt_tokens;
        if (typeof usage.completion_tokens === "number")
          usageOut.outputTokens = usage.completion_tokens;
        result.usage = usageOut;
        recordOpenRouterUsage(model, opts.endpoint, usage, opts.userId);
      }
      return result;
    } catch (e: unknown) {
      if (timeoutId) clearTimeout(timeoutId);
      const isAbort =
        e instanceof Error &&
        (e.name === "AbortError" ||
          (e as { code?: string }).code === "ABORT_ERR");
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: isAbort ? "timeout" : "openrouter_throw",
      };
    }
  }
}

// ─── FallbackProvider ───────────────────────────────────────────────
// Обгортає primary (зазвичай OpenRouter) + fallback (зазвичай Anthropic).
// При `!ok` від primary — автоматично пробує fallback. Метрики рахують
// обидва виклики окремо, щоб у Grafana було видно fallback-rate.
//
// Призначення: надійність — якщо OpenRouter має outage/rate-limit,
// користувач не бачить помилку, бо Anthropic підхоплює. Коли primary
// працює — Anthropic навіть не викликається ($0 fallback cost).

/**
 * Callback для логування fallback-спрацювань. За замовчуванням no-op;
 * у production передається logger/Sentry-emit через DI.
 */
export type FallbackLogFn = (
  level: "debug" | "info" | "warn",
  message: string,
  fields?: Record<string, unknown>,
) => void;

export interface FallbackProviderOptions {
  primary: LLMProvider;
  fallback: LLMProvider;
  log?: FallbackLogFn;
}

export class FallbackProvider implements LLMProvider {
  readonly name: LLMProviderName;
  private readonly primary: LLMProvider;
  private readonly fallback: LLMProvider;
  private readonly log: FallbackLogFn;

  constructor(opts: FallbackProviderOptions) {
    this.primary = opts.primary;
    this.fallback = opts.fallback;
    this.log = opts.log ?? (() => undefined);
    // Name reflects the primary — metrics label stays stable when fallback
    // doesn't fire. Fallback usage tracked via separate counter/breadcrumb.
    this.name = opts.primary.name;
  }

  async generate(opts: LLMGenerateOpts): Promise<LLMGenerateResult> {
    const primaryResult = await this.primary.generate(opts);

    if (primaryResult.ok) {
      return primaryResult;
    }

    // Primary failed — try fallback.
    this.log("warn", "llm.fallback.triggered", {
      primary: this.primary.name,
      fallback: this.fallback.name,
      endpoint: opts.endpoint ?? "unknown",
      code: primaryResult.code,
      status: primaryResult.status,
    });

    try {
      const fallbackResult = await this.fallback.generate(opts);

      if (fallbackResult.ok) {
        this.log("info", "llm.fallback.result", {
          primary: this.primary.name,
          fallback: this.fallback.name,
          endpoint: opts.endpoint ?? "unknown",
          outcome: "ok",
        });
        return fallbackResult;
      }

      // Fallback also failed — return primary's error (more relevant).
      this.log("warn", "llm.fallback.both_failed", {
        primary: this.primary.name,
        fallback: this.fallback.name,
        endpoint: opts.endpoint ?? "unknown",
        primaryCode: primaryResult.code,
        fallbackCode: fallbackResult.code,
      });
      return primaryResult;
    } catch (err) {
      this.log("warn", "llm.fallback.error", {
        primary: this.primary.name,
        fallback: this.fallback.name,
        endpoint: opts.endpoint ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      });
      // Both failed — return primary's error (more relevant).
      return primaryResult;
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Резолвить активний provider за env-config. Правила:
 *
 * 1. `LLM_PROVIDER=stub` → `StubProvider` (для e2e/dev/incident).
 * 2. `LLM_PROVIDER=anthropic` (default) і `ANTHROPIC_API_KEY` задано → `AnthropicProvider`.
 * 3. `LLM_PROVIDER=anthropic` але `ANTHROPIC_API_KEY` ПУСТИЙ → fallback на `StubProvider`
 *    (щоб local-dev / preview-env не падали з 500). У production цей шлях
 *    супроводжується warning-логом у `env.ts` на startup-і.
 *
 * Fallback chain:
 *   Коли `provider === "openrouter"` І `LLM_FALLBACK_ENABLED === true` І
 *   `ANTHROPIC_API_KEY` задано — результат обгортається у `FallbackProvider`,
 *   який при помилці OpenRouter автоматично пробує Anthropic. Це захищає
 *   від OpenRouter outage / rate-limit / free-tier-обмежень.
 *
 * Конкретний key override (для тестів) — через override-аргумент.
 */
export interface GetLLMProviderOverride {
  provider?: LLMProviderName;
  anthropicApiKey?: string;
  stubResponse?: ConstructorParameters<typeof StubProvider>[0];
  /**
   * Per-path OpenRouter model override. Кожен call-site передає свою env
   * (`OPENROUTER_READONLY_MODEL` для classify, `OPENROUTER_DIGEST_MODEL` для
   * digest); порожній → fallback на глобальний `OPENROUTER_MODEL`, далі на
   * model самого виклику. Може бути `@preset/<slug>` (fallback керується
   * пресетом OpenRouter). Ігнорується для не-openrouter провайдерів.
   */
  openrouterModel?: string;
  /**
   * Disable fallback chain for this call-site. Використовується у тестах,
   * де caller хоче точно знати який provider відповів.
   */
  disableFallback?: boolean;
}

/**
 * Продакшн-логер спрацювань фолбека.
 *
 * До 2026-08-07 `getLLMProvider` створював `FallbackProvider` БЕЗ `log`, а
 * дефолт там — `() => undefined`. Тобто підміна провайдера не лишала ані
 * метрики, ані рядка в логах: `invokeLLM` обгортає всю конструкцію й бачить
 * фінальний `ok`, записуючи його з моделлю ФОЛБЕКА. Наслідок був не
 * теоретичний — коуч девʼять викликів із десяти обслуговувався не тією
 * моделлю, що в конфігу, і знайшлось це випадково, звіркою розкладу витрат
 * по моделях, а не сигналом.
 *
 * `llm_provider_invocations_total` тут інкрементиться з ІМЕНЕМ ПЕРВИННОГО
 * провайдера й outcome-ом його ПРОВАЛУ — рівно там, де на нього подивиться
 * той, хто питає «а чи працює шлюз». Успішний результат фолбека `invokeLLM`
 * запише окремо; два записи на один виклик тут не подвійний облік, а два
 * різні факти: «шлюз не зміг» і «відповідь усе-таки отримана».
 */
const productionFallbackLog: FallbackLogFn = (level, msg, fields) => {
  const data = fields ?? {};
  try {
    logger[level]({ msg, ...data });
  } catch {
    /* лог ніколи не ламає запит */
  }
  if (msg !== "llm.fallback.triggered") return;
  try {
    llmProviderInvocationsTotal.inc({
      provider: String(data["primary"] ?? "unknown"),
      endpoint: String(data["endpoint"] ?? "unknown"),
      outcome: typeof data["code"] === "string" ? data["code"] : "error",
    });
  } catch {
    /* метрики ніколи не ламають запит */
  }
};

export function getLLMProvider(
  override: GetLLMProviderOverride = {},
): LLMProvider {
  const provider = override.provider ?? env.LLM_PROVIDER;
  if (provider === "stub") {
    return new StubProvider(override.stubResponse);
  }
  if (provider === "openrouter") {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) return new StubProvider(override.stubResponse);
    // Model precedence: per-path override → global OPENROUTER_MODEL → (empty →
    // OpenRouterProvider forwards the call-site's own model id). Empty strings
    // are falsy, so an unset per-path var falls through to the global default.
    const modelOverride = override.openrouterModel || env.OPENROUTER_MODEL;
    const primary = new OpenRouterProvider(apiKey, modelOverride);

    // Fallback chain: OpenRouter → Anthropic when enabled + key available.
    if (env.LLM_FALLBACK_ENABLED && !override.disableFallback) {
      const anthropicKey = override.anthropicApiKey ?? env.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        return new FallbackProvider({
          primary,
          fallback: new AnthropicProvider(anthropicKey),
          log: productionFallbackLog,
        });
      }
    }
    return primary;
  }
  // provider === "anthropic"
  const apiKey = override.anthropicApiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fail-soft: dev/preview без ключа → stub.
    return new StubProvider(override.stubResponse);
  }
  return new AnthropicProvider(apiKey);
}

// ─── Observability wrapper ───────────────────────────────────────────
// PR-24: wraps `provider.generate()` зі стандартизованими Prometheus +
// Sentry-breadcrumb-сигналами. Це — єдина точка, де провайдер-абстракція
// зустрічається з observability-шаром, тому що `LLMProvider` сам по собі
// має бути pure (jaak-test-able), а instrumentation залежить від
// runtime-side-effects (prom-client registry, Sentry hub).
//
// Виклик через `invokeLLM(provider, opts)` замість прямого `provider.generate(opts)`:
//   - інкрементує `llm_provider_invocations_total{provider, endpoint, outcome}`;
//   - кладе Sentry breadcrumb (`category="llm.provider"`) з outcome/code.
//
// Outcome-мапа:
//   ok            — provider повернув `ok: true`
//   missing_api_key — AnthropicProvider не зміг (apiKey=='')
//   rate_limited  — code='rate_limited' (HTTP 429)
//   timeout       — code='timeout' (AbortError)
//   error         — будь-який інший failure

/**
 * Тип callback-а для тестів — дозволяє підмінити breadcrumb-emitter без
 * stub-ування глобального Sentry. У production — `Sentry.addBreadcrumb`.
 */
export type LLMBreadcrumbFn = (b: {
  category: string;
  level: "info" | "warning" | "error";
  message: string;
  data: Record<string, unknown>;
}) => void;

export interface InvokeLLMOptions {
  /** Override Sentry breadcrumb emitter (for tests). */
  addBreadcrumb?: LLMBreadcrumbFn;
}

function outcomeFromResult(result: LLMGenerateResult): string {
  if (result.ok) return "ok";
  if (result.code === "missing_api_key") return "missing_api_key";
  if (result.code === "rate_limited") return "rate_limited";
  if (result.code === "timeout") return "timeout";
  return "error";
}

/**
 * Маскує промпт перед відправкою за периметр (рішення founder-а #10).
 *
 * AI-DANGER: це **єдина** точка маскування для порад коуча, тижневого
 * звіту, категоризації транзакцій і збагачення Mono — усі чотири шляхи
 * ходять сюди. Прибереш звідси — витече одразу з чотирьох місць, і
 * жоден тип цього не помітить. Гейт, який ловить новий шлях повз маску,
 * живе в `llmRedactionCoverage.test.ts`.
 *
 * `userId` тут уже є для cost-ledger-а, тож клас Б (імена контрагентів)
 * підключається без додаткової проводки в кожного caller-а. Немає
 * `userId` (машинний виклик) → лишається клас А.
 */
async function maskGenerateOpts(
  opts: LLMGenerateOpts,
): Promise<LLMGenerateOpts> {
  const knownValues = await getCounterpartyNames(opts.userId);
  const masked: LLMGenerateOpts = {
    ...opts,
    messages: opts.messages.map((m) => ({
      ...m,
      content: maskMachineText(m.content, knownValues),
    })),
  };
  if (opts.system !== undefined) {
    masked.system = maskMachineText(opts.system, knownValues);
  }
  return masked;
}

/**
 * Wraps `provider.generate(opts)` з Prometheus + Sentry sidecars. Повертає
 * той самий `LLMGenerateResult` — ця функція НЕ змінює бізнес-логіку, лише
 * додає observability **і маскування PII** (див. `maskGenerateOpts`).
 *
 * Виклик ідемпотентний: помилка sidecar-а (Prom-registry / Sentry-hub
 * unavailable) ловиться і не пробивається до caller-а.
 */
export async function invokeLLM(
  provider: LLMProvider,
  opts: LLMGenerateOpts,
  invokeOpts: InvokeLLMOptions = {},
): Promise<LLMGenerateResult> {
  const endpoint = opts.endpoint ?? "unknown";
  const result = await provider.generate(await maskGenerateOpts(opts));
  const outcome = outcomeFromResult(result);

  try {
    llmProviderInvocationsTotal.inc({
      provider: provider.name,
      endpoint,
      outcome,
    });
  } catch {
    /* metrics never break a request */
  }

  const breadcrumb: Parameters<LLMBreadcrumbFn>[0] = {
    category: "llm.provider",
    level: result.ok ? "info" : "warning",
    message: `llm_provider_invocation provider=${provider.name} endpoint=${endpoint} outcome=${outcome}`,
    data: {
      provider: provider.name,
      endpoint,
      outcome,
      model: opts.model,
      ...(result.ok ? {} : { code: result.code, error: result.error }),
    },
  };
  const emit =
    invokeOpts.addBreadcrumb ??
    ((b) => {
      try {
        Sentry.addBreadcrumb(b);
      } catch {
        /* Sentry не ініціалізований у деяких env — no-op */
      }
    });
  emit(breadcrumb);

  return result;
}
