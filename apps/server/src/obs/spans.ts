/**
 * Custom span helpers — Phase 2 з ініціативи 0004 (server observability).
 *
 * Контракт:
 *   - `aiSpan(name, fn, attrs)` — обгортка над AI-провайдер викликами
 *     (Anthropic / OpenAI / Voyage). Записує attributes (`gen_ai.*`),
 *     latency, success/error. Pino-логи через ALS отримують той самий
 *     traceId, тому один лог-grep дає повну картину.
 *
 *   - `dbSpan(name, fn)` — для ad-hoc DB-операцій, які auto-instrumentation
 *     для `pg` бачить як один query (наприклад, transactional блок із
 *     багатьма statement-ами). Не дублює статементи з instrumentation-pg.
 *
 *   - Працює і коли OTel SDK не запущений (`OTEL_EXPORTER_OTLP_ENDPOINT`
 *     не заданий): `@opentelemetry/api` тоді роздає `NoopTracer`, span-и
 *     є no-op-ами, але callback-логіка нечіпає — викликаючий код не
 *     знає про різницю.
 *
 *   - Privacy: НЕ пишемо текст prompt-ів, content-у чи token-ів у
 *     attributes. Тільки агреговані лічильники (`tokens_in`, `tokens_out`,
 *     `cache_hit`) і непаливний `model` / `endpoint` slug.
 */

import {
  type Attributes,
  context,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";

const TRACER_NAME = "sergeant-api";

let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  // Кешування дешеве але уникає повторних `getTracer` викликів на hot-path.
  if (!cachedTracer) cachedTracer = trace.getTracer(TRACER_NAME);
  return cachedTracer;
}

export interface AiSpanAttrs {
  /** "anthropic" | "openai" | "groq" | "voyage" — для group-by per-provider. */
  provider: string;
  /** Канонічний model slug (e.g. "claude-3-5-sonnet-20241022"). */
  model: string;
  /** "messages" | "stream" | "embed" — endpoint usage class. */
  endpoint?: string;
  /** Optional: prompt cache version, якщо provider його повідомляє. */
  promptVersion?: string;
}

export interface AiSpanResultMeta {
  /** Tokens у prompt (inputs + cache write/read). */
  tokensIn?: number;
  /** Tokens у completion (outputs). */
  tokensOut?: number;
  /** True/false якщо prompt cache hit точно відомий, undefined якщо ні. */
  promptCacheHit?: boolean;
  /** Custom outcome для error-path-у (e.g. "timeout", "429"). */
  outcome?: string;
}

/**
 * Обгортає async AI-call у OTel span. Семантичні конвенції — підмножина
 * `gen_ai.*` (https://opentelemetry.io/docs/specs/semconv/gen-ai/).
 *
 * Якщо callback повертає `[result, meta]`, `meta` йде у attributes (tokens,
 * cache hit). Якщо повертає лише `result` — span закривається з самих лише
 * `provider/model/endpoint`.
 */
export function aiSpan<T>(
  name: string,
  fn: (span: Span) => Promise<[T, AiSpanResultMeta]>,
  attrs: AiSpanAttrs,
): Promise<T>;
export function aiSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attrs: AiSpanAttrs,
): Promise<T>;
export async function aiSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | Promise<[T, AiSpanResultMeta]>,
  attrs: AiSpanAttrs,
): Promise<T> {
  const initial: Attributes = {
    "gen_ai.system": attrs.provider,
    "gen_ai.request.model": attrs.model,
  };
  if (attrs.endpoint) {
    initial["gen_ai.operation.name"] = attrs.endpoint;
  }
  if (attrs.promptVersion) {
    initial["sergeant.ai.prompt_version"] = attrs.promptVersion;
  }

  return tracer().startActiveSpan(
    name,
    { kind: SpanKind.CLIENT, attributes: initial },
    async (span) => {
      try {
        const result = await fn(span);
        // Підтримка двох форматів: callback може повернути [value, meta]
        // як explicit-shape, або просто value.
        if (Array.isArray(result) && result.length === 2 && isMeta(result[1])) {
          const [value, meta] = result as [T, AiSpanResultMeta];
          applyMeta(span, meta);
          span.setStatus({ code: SpanStatusCode.OK });
          return value;
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return result as T;
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

function isMeta(value: unknown): value is AiSpanResultMeta {
  if (value == null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    "tokensIn" in v ||
    "tokensOut" in v ||
    "promptCacheHit" in v ||
    "outcome" in v
  );
}

function applyMeta(span: Span, meta: AiSpanResultMeta): void {
  if (typeof meta.tokensIn === "number") {
    span.setAttribute("gen_ai.usage.input_tokens", meta.tokensIn);
  }
  if (typeof meta.tokensOut === "number") {
    span.setAttribute("gen_ai.usage.output_tokens", meta.tokensOut);
  }
  if (typeof meta.promptCacheHit === "boolean") {
    span.setAttribute("sergeant.ai.prompt_cache_hit", meta.promptCacheHit);
  }
  if (meta.outcome) {
    span.setAttribute("sergeant.outcome", meta.outcome);
  }
}

/**
 * Тонка обгортка для DB-блоків, які auto-instrumentation бачить як
 * непрозорі (transactional patterns, raw `pool.connect()` блоки).
 */
export async function dbSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attrs: { table?: string; operation?: string } = {},
): Promise<T> {
  const initial: Attributes = {};
  if (attrs.table) initial["db.sql.table"] = attrs.table;
  if (attrs.operation) initial["db.operation"] = attrs.operation;

  return tracer().startActiveSpan(
    name,
    { kind: SpanKind.CLIENT, attributes: initial },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        recordSpanError(span, err);
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

function recordSpanError(span: Span, err: unknown): void {
  if (err instanceof Error) {
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    return;
  }
  span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
}

/**
 * Повертає traceId з активного OTel-context-у (W3C формат, 32 hex).
 * Якщо span валідний — рядок; якщо ні (NoopTracer / no SDK) — null.
 *
 * Використовується у `requestContext.ts` middleware, щоб синхронізувати
 * Pino `traceId`/`requestId` із OTel root-span-ом.
 */
export function getActiveTraceId(): string | null {
  const span = trace.getSpan(context.active());
  if (!span) return null;
  const ctx = span.spanContext();
  if (!ctx || !ctx.traceId) return null;
  // NoopSpan має traceId="00000000000000000000000000000000".
  if (/^0+$/.test(ctx.traceId)) return null;
  return ctx.traceId;
}
