import {
  type Attributes,
  type Context,
  type Link,
  SpanKind,
  trace,
  TraceFlags,
} from "@opentelemetry/api";
import {
  type Sampler,
  type SamplingResult,
  SamplingDecision,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_HTTP_ROUTE } from "@opentelemetry/semantic-conventions";

/**
 * Route-aware sampler — Phase 4 з ініціативи 0004 (server observability).
 *
 * Логіка узгоджена з оригінальним spec-ом і `docs/observability/runbook.md`:
 *   - 0%   для health-checks (`/health/*`, `/livez`, `/readyz`, `/startupz`),
 *           щоб не засмічувати backend traces "зеленим" шумом.
 *   - 100% для AI-роутів (`/api/chat/**`, `/api/coach/**`, `/api/nutrition/**`,
 *           `/api/digest/**`) — критично знати latency і tool-fanout.
 *   - 100% для всіх write-методів (POST/PUT/PATCH/DELETE) — їх мало,
 *           кожен інцидент дорогий, повна картина важливіша за overhead.
 *   - default sample rate (за замовчуванням 0.1) для решти GET-ів.
 *
 * Парент-based: якщо incoming `traceparent` уже несе sampled-flag, ми його
 * поважаємо, щоб трейс не обривався посеред клієнт→сервер ланцюга.
 *
 * Контракт із Sentry: коли OTel-sampler пропускає trace (10% GET), Sentry
 * `tracesSampleRate` має дорівнювати тому самому числу — інакше Sentry
 * бачитиме інший підмножину запитів і кореляція "чому 50 спанів а Sentry
 * показує 5 transactions" зламається. Документовано у
 * `docs/observability/runbook.md` § «Sampling rates».
 */
const AI_ROUTE_PREFIXES = [
  "/api/chat",
  "/api/coach",
  "/api/nutrition",
  "/api/digest",
  "/api/v1/chat",
  "/api/v1/coach",
  "/api/v1/nutrition",
  "/api/v1/digest",
];

const HEALTH_ROUTE_PREFIXES = [
  "/livez",
  "/readyz",
  "/startupz",
  "/healthz",
  "/health",
];

const ALWAYS_SAMPLE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function startsWithAny(value: string, prefixes: string[]): boolean {
  for (const p of prefixes) {
    if (value === p || value.startsWith(`${p}/`)) return true;
  }
  return false;
}

function pickRoute(attributes: Attributes | undefined): string | null {
  if (!attributes) return null;
  const route = attributes[ATTR_HTTP_ROUTE];
  if (typeof route === "string" && route.length > 0) return route;
  // `instrumentation-http` записує `http.target` як повний path+query до того,
  // як express колбеки прокидають route. На це теж дивимось.
  const target = attributes["http.target"];
  if (typeof target === "string" && target.length > 0) {
    const q = target.indexOf("?");
    return q >= 0 ? target.slice(0, q) : target;
  }
  const url = attributes["http.url"];
  if (typeof url === "string" && url.length > 0) {
    try {
      return new URL(url).pathname;
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

function pickMethod(attributes: Attributes | undefined): string | null {
  if (!attributes) return null;
  const m = attributes["http.request.method"] ?? attributes["http.method"];
  return typeof m === "string" ? m.toUpperCase() : null;
}

export interface RouteAwareSamplerOptions {
  /** Default rate для не-write GET запитів. 0.0–1.0. */
  defaultRate: number;
}

export function createRouteAwareSampler(
  options: RouteAwareSamplerOptions,
): Sampler {
  const defaultRate = Math.min(1, Math.max(0, options.defaultRate));

  return {
    shouldSample(
      context: Context,
      _traceId: string,
      _spanName: string,
      _spanKind: SpanKind,
      attributes: Attributes,
      _links: Link[],
    ): SamplingResult {
      // Поважаємо парент-decision, якщо є валідний sampled-парент.
      const parent = trace.getSpanContext(context);
      if (
        parent &&
        (parent.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED
      ) {
        return { decision: SamplingDecision.RECORD_AND_SAMPLED };
      }

      const route = pickRoute(attributes);
      const method = pickMethod(attributes);

      if (route && startsWithAny(route, HEALTH_ROUTE_PREFIXES)) {
        return { decision: SamplingDecision.NOT_RECORD };
      }
      if (route && startsWithAny(route, AI_ROUTE_PREFIXES)) {
        return { decision: SamplingDecision.RECORD_AND_SAMPLED };
      }
      if (method && ALWAYS_SAMPLE_METHODS.has(method)) {
        return { decision: SamplingDecision.RECORD_AND_SAMPLED };
      }

      // Probabilistic для GET-ів. Math.random — ОК для sampling decision-ів
      // (немає security implication-ів).
      if (defaultRate <= 0) return { decision: SamplingDecision.NOT_RECORD };
      if (defaultRate >= 1)
        return { decision: SamplingDecision.RECORD_AND_SAMPLED };
      return Math.random() < defaultRate
        ? { decision: SamplingDecision.RECORD_AND_SAMPLED }
        : { decision: SamplingDecision.NOT_RECORD };
    },
    toString(): string {
      return `RouteAwareSampler{defaultRate=${defaultRate}}`;
    },
  };
}
