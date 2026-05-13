import { logger } from "../obs/logger.js";
import { recordExternalHttp } from "./externalHttp.js";
import { elapsedMs, isAbortError } from "./timing.js";

/**
 * Server-side PostHog event capture helper. Реалізує `capturePostHogEvent()`
 * для serverside-аналітики, де подія народжується ПОЗА вебом — Stripe
 * webhook, n8n callback, background worker — і клієнтський `posthog-js`
 * у браузері не може її надіслати.
 *
 *   POST {host}/capture/
 *   { api_key, event, distinct_id, properties, timestamp }
 *
 * Окремий помічник від `apps/server/src/lib/posthog.ts` (GDPR delete-person):
 * там використовується **personal** API key з Bearer-токеном для admin-у
 * проекту, тут — **project** ingestion key (`phc_…`), той самий що
 * `VITE_POSTHOG_KEY` у клієнті. Назви env-vars розведені (`POSTHOG_API_KEY`
 * vs `POSTHOG_PROJECT_API_KEY`), щоб не сплутати scope-и: personal key
 * має write-доступ до persons (вилучення), project key — тільки
 * write-доступ до event ingestion.
 *
 * Поведінка fail-open: відсутність `POSTHOG_PROJECT_API_KEY` →
 * `outcome: "skipped"`, лог `posthog_capture_skipped`. Це навмисно:
 * Stripe-webhook (та інші callerи) мусять успішно ОБРОБИТИ подію навіть
 * якщо аналітика не налаштована (dev/staging без PostHog). Помилки
 * мережі / 5xx / 429 теж не кидаються — тільки логуються, а caller
 * продовжує. Метрики йдуть у `external_http_requests_total{upstream="posthog"}`.
 *
 * Idempotency: PostHog має server-side dedup за `uuid`-полем. Якщо
 * caller хоче гарантовану once-only delivery — передає стабільний `uuid`
 * у `properties` (наприклад, `stripe_event_id`). Інакше PostHog присвоює
 * випадковий UUID при ingest.
 */

export type PostHogCaptureOutcome =
  | "ok"
  | "rate_limited"
  | "timeout"
  | "skipped"
  | "error";

export interface PostHogCaptureResult {
  outcome: PostHogCaptureOutcome;
  status?: number | undefined;
  error?: string | undefined;
  ms?: number | undefined;
}

export interface PostHogCaptureEventInput {
  /** Назва події (snake_case, з `ANALYTICS_EVENTS`). */
  event: string;
  /** Стабільний user identifier (Better Auth opaque string). */
  distinctId: string;
  /** Custom event-properties (плюс `$revenue` / `$set` для super-properties). */
  properties?: Record<string, unknown>;
  /** Опціональний timestamp ISO-8601; default — `new Date().toISOString()`. */
  timestamp?: string;
  /** Стабільний uuid для server-side dedup (наприклад, Stripe `event.id`). */
  uuid?: string;
}

export interface PostHogCaptureOptions {
  /** Project ingestion key (`phc_…`), default з `POSTHOG_PROJECT_API_KEY`. */
  apiKey?: string | undefined;
  /** Server-side host. Default — EU Cloud. */
  host?: string | undefined;
  /** Per-call timeout (мс). Default 5s. */
  timeoutMs?: number | undefined;
  /** Inject-нутий fetch (для тестів). */
  fetchImpl?: typeof fetch | undefined;
}

const DEFAULT_HOST = "https://eu.i.posthog.com";
const DEFAULT_TIMEOUT_MS = 5_000;
const UPSTREAM = "posthog";

export async function capturePostHogEvent(
  input: PostHogCaptureEventInput,
  options: PostHogCaptureOptions = {},
): Promise<PostHogCaptureResult> {
  if (typeof input.event !== "string" || input.event.length === 0) {
    return { outcome: "error", error: "event is required" };
  }
  if (typeof input.distinctId !== "string" || input.distinctId.length === 0) {
    return { outcome: "error", error: "distinctId is required" };
  }

  const apiKey = options.apiKey ?? process.env["POSTHOG_PROJECT_API_KEY"];
  const host = (
    options.host ??
    process.env["POSTHOG_HOST"] ??
    DEFAULT_HOST
  ).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    logger.warn({
      msg: "posthog_capture_skipped",
      reason: "POSTHOG_PROJECT_API_KEY is not set",
      event: input.event,
    });
    recordExternalHttp(UPSTREAM, "skipped");
    return { outcome: "skipped" };
  }

  const url = `${host}/capture/`;
  const body = {
    api_key: apiKey,
    event: input.event,
    distinct_id: input.distinctId,
    properties: input.properties ?? {},
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.uuid ? { uuid: input.uuid } : {}),
  };

  const start = process.hrtime.bigint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const ms = elapsedMs(start);

    if (response.ok) {
      recordExternalHttp(UPSTREAM, "ok", ms);
      return { outcome: "ok", status: response.status, ms };
    }
    if (response.status === 429) {
      recordExternalHttp(UPSTREAM, "rate_limited", ms);
      logger.warn({
        msg: "posthog_capture_rate_limited",
        event: input.event,
        status: 429,
      });
      return { outcome: "rate_limited", status: 429, ms };
    }

    const bodyText = await response.text().catch(() => "");
    recordExternalHttp(UPSTREAM, "error", ms);
    logger.warn({
      msg: "posthog_capture_failed",
      event: input.event,
      status: response.status,
      body: bodyText.slice(0, 500),
    });
    return {
      outcome: "error",
      status: response.status,
      error: `posthog returned ${response.status}`,
      ms,
    };
  } catch (e: unknown) {
    const ms = elapsedMs(start);
    const outcome: PostHogCaptureOutcome = isAbortError(e)
      ? "timeout"
      : "error";
    recordExternalHttp(UPSTREAM, outcome, ms);
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({
      msg: "posthog_capture_exception",
      event: input.event,
      outcome,
      error: message,
    });
    return { outcome, error: message, ms };
  } finally {
    clearTimeout(timer);
  }
}
