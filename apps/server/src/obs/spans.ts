/**
 * AI-call span helper — тонка обгортка над AI-провайдер викликами
 * (Anthropic / Voyage).
 *
 * Історично писала OpenTelemetry-span-и (Phase 2 ініціативи 0004). Dormant
 * OTel-стек видалено (Sentry уже покриває tracing, dublювати = платити двічі),
 * тож обгортка лишилась як **passthrough**, що зберігає контракт
 * `[result, meta]`-tuple → `result` для call-site-ів у `lib/anthropic.ts`.
 *
 * Latency / token-attribution живуть у Prometheus-метриках (`obs/metrics.ts`:
 * `ai_request_duration_ms`, `ai_tokens_total`, `ai_cost_estimate_usd_total`) і
 * Sentry tracing — тут нічого записувати не треба.
 */

export interface AiSpanAttrs {
  /** "anthropic" | "voyage" — provider slug. */
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
 * Виконує async AI-call. Якщо callback повертає `[result, meta]`-tuple —
 * розпаковує і повертає лише `result` (meta історично йшла у span-attributes;
 * тепер відкидається — метрики пишуться окремо). Якщо повертає лише `result`
 * — повертає його як є. Сигнатура збережена 1:1 із попередньою OTel-версією,
 * тож call-site-и не змінюються.
 */
export function aiSpan<T>(
  name: string,
  fn: () => Promise<[T, AiSpanResultMeta]>,
  attrs: AiSpanAttrs,
): Promise<T>;
export function aiSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attrs: AiSpanAttrs,
): Promise<T>;
export async function aiSpan<T>(
  _name: string,
  fn: () => Promise<T> | Promise<[T, AiSpanResultMeta]>,
  _attrs: AiSpanAttrs,
): Promise<T> {
  const result = await fn();
  if (Array.isArray(result) && result.length === 2 && isMeta(result[1])) {
    return (result as [T, AiSpanResultMeta])[0];
  }
  return result as T;
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
