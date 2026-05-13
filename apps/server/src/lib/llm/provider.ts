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
import { llmProviderInvocationsTotal } from "../../obs/metrics.js";
import { Sentry } from "../../sentry.js";
import { anthropicMessages, extractAnthropicText } from "../anthropic.js";

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
  /** Endpoint-tag для observability metrics (`day-hint`, `coach`, etc). */
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
 * Конкретний key override (для тестів) — через override-аргумент.
 */
export interface GetLLMProviderOverride {
  provider?: LLMProviderName;
  anthropicApiKey?: string;
  stubResponse?: ConstructorParameters<typeof StubProvider>[0];
}

export function getLLMProvider(
  override: GetLLMProviderOverride = {},
): LLMProvider {
  const provider = override.provider ?? env.LLM_PROVIDER;
  if (provider === "stub") {
    return new StubProvider(override.stubResponse);
  }
  if (provider === "openrouter") {
    // Reserved — імплементація у майбутньому PR (OpenRouter fallback).
    // Поки що деградуємо у stub, щоб неочікуваний env не валив app.
    return new StubProvider(override.stubResponse);
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
 * Wraps `provider.generate(opts)` з Prometheus + Sentry sidecars. Повертає
 * той самий `LLMGenerateResult` — ця функція НЕ змінює бізнес-логіку, лише
 * додає observability.
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
  const result = await provider.generate(opts);
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
