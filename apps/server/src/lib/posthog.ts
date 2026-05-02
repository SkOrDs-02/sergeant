import { logger } from "../obs/logger.js";
import { recordExternalHttp } from "./externalHttp.js";
import { elapsedMs, isAbortError } from "./timing.js";

/**
 * Server-side PostHog cleanup helper. Реалізує `deletePostHogPerson(userId)`
 * для GDPR cleanup queue з ADR-0016 (ADR-6.3 — External services cleanup):
 *
 *   DELETE {host}/api/projects/{projectId}/persons/?distinct_id={userId}
 *   Authorization: Bearer {POSTHOG_API_KEY}
 *
 * Поведінка ідемпотентна — повторний виклик на вже видалену person повертає
 * 404 і ми класифікуємо його як `not_found` (caller → mark як completed).
 *
 * Відсутність config-у (`POSTHOG_API_KEY` / `POSTHOG_PROJECT_ID`) →
 * `outcome: "skipped"`. Це зроблено навмисно: GDPR cleanup worker має
 * можливість markувати row як completed навіть в dev/test, де PostHog
 * не налаштований, інакше soft-deleted users застрягнуть назавжди.
 *
 * Не кидає помилок — повертає тегований union, який `gdpr_cleanup_queue`
 * worker мапить на `completed_at` (ok/not_found/skipped) vs. `attempts++`
 * (rate_limited/timeout/error).
 */

export type PostHogDeleteOutcome =
  | "ok"
  | "not_found"
  | "rate_limited"
  | "timeout"
  | "skipped"
  | "error";

export interface PostHogDeletePersonResult {
  outcome: PostHogDeleteOutcome;
  status?: number;
  error?: string;
  ms?: number;
}

export interface PostHogDeletePersonOptions {
  /** Personal API key (`POSTHOG_API_KEY`), Bearer-токен. */
  apiKey?: string;
  /** Числовий ID проєкту (`POSTHOG_PROJECT_ID`). */
  projectId?: string;
  /** Базовий host. Default — EU Cloud, як у клієнтському snippet (`POSTHOG_HOST`). */
  host?: string;
  /** Per-call timeout (мс). Default 10s — за ADR latency-budget ~1s + slack. */
  timeoutMs?: number;
  /** Inject-нутий fetch (для тестів). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_HOST = "https://eu.i.posthog.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const UPSTREAM = "posthog";

export async function deletePostHogPerson(
  userId: string,
  options: PostHogDeletePersonOptions = {},
): Promise<PostHogDeletePersonResult> {
  if (typeof userId !== "string" || userId.length === 0) {
    return { outcome: "error", error: "userId is required" };
  }

  const apiKey = options.apiKey ?? process.env.POSTHOG_API_KEY;
  const projectId = options.projectId ?? process.env.POSTHOG_PROJECT_ID;
  const host = (
    options.host ??
    process.env.POSTHOG_HOST ??
    DEFAULT_HOST
  ).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey || !projectId) {
    logger.warn({
      msg: "posthog_delete_person_skipped",
      reason: "POSTHOG_API_KEY or POSTHOG_PROJECT_ID is not set",
    });
    recordExternalHttp(UPSTREAM, "skipped");
    return { outcome: "skipped" };
  }

  const url =
    `${host}/api/projects/${encodeURIComponent(projectId)}/persons/` +
    `?distinct_id=${encodeURIComponent(userId)}`;

  const start = process.hrtime.bigint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const ms = elapsedMs(start);

    if (response.ok) {
      recordExternalHttp(UPSTREAM, "ok", ms);
      return { outcome: "ok", status: response.status, ms };
    }
    if (response.status === 404) {
      // Already deleted / unknown distinct_id → idempotent success.
      recordExternalHttp(UPSTREAM, "not_found", ms);
      return { outcome: "not_found", status: 404, ms };
    }
    if (response.status === 429) {
      recordExternalHttp(UPSTREAM, "rate_limited", ms);
      return { outcome: "rate_limited", status: 429, ms };
    }

    const bodyText = await response.text().catch(() => "");
    recordExternalHttp(UPSTREAM, "error", ms);
    logger.warn({
      msg: "posthog_delete_person_failed",
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
    const outcome: PostHogDeleteOutcome = isAbortError(e) ? "timeout" : "error";
    recordExternalHttp(UPSTREAM, outcome, ms);
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({
      msg: "posthog_delete_person_exception",
      outcome,
      error: message,
    });
    return { outcome, error: message, ms };
  } finally {
    clearTimeout(timer);
  }
}
