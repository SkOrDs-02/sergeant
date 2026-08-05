import { logger } from "../../obs/logger.js";
import { recordExternalHttp } from "../../lib/externalHttp.js";
import { elapsedMs, isAbortError } from "../../lib/timing.js";

/**
 * Vendor delete-API wrappers for `gdpr_cleanup_queue` (ADR-0016 § ADR-6.3).
 * Mirrors the shape of `lib/posthog.ts::deletePostHogPerson` (which already
 * shipped ahead of this queue landing): a tagged outcome union, config-gated
 * `"skipped"`, never throws.
 *
 * `"skipped"` semantics differ from `deletePostHogPerson`'s own contract on
 * purpose. PostHog's helper documents that a `"skipped"` outcome should let
 * the worker mark the row `completed_at` (no PostHog wiring in this
 * deployment at all → nothing to ever complete). Stripe/Sentry/Resend below
 * have NO existing call implementation history in this codebase — a
 * `"skipped"` here just means "admin token/config for this vendor is not
 * set in env", and the intentional behaviour (per the pre-beta schema-debt
 * audit instructions) is: the row simply stays pending in the queue until
 * an operator configures the token. `cleanupWorker.ts` is the one place
 * that encodes this distinction — see its dispatch table.
 */

export type VendorDeleteOutcome =
  "ok" | "not_found" | "rate_limited" | "timeout" | "skipped" | "error";

export interface VendorDeleteResult {
  outcome: VendorDeleteOutcome;
  status?: number | undefined;
  error?: string | undefined;
  ms?: number | undefined;
}

interface DeleteOptions {
  timeoutMs?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Shared DELETE-and-tag-outcome executor — the part all three vendors share. */
async function deleteExternalResource(
  upstream: string,
  url: string,
  headers: Record<string, string>,
  options: DeleteOptions = {},
): Promise<VendorDeleteResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  const start = process.hrtime.bigint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "DELETE",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
    const ms = elapsedMs(start);

    if (response.ok) {
      recordExternalHttp(upstream, "ok", ms);
      return { outcome: "ok", status: response.status, ms };
    }
    if (response.status === 404) {
      recordExternalHttp(upstream, "not_found", ms);
      return { outcome: "not_found", status: 404, ms };
    }
    if (response.status === 429) {
      recordExternalHttp(upstream, "rate_limited", ms);
      return { outcome: "rate_limited", status: 429, ms };
    }

    // Hard Rule #21 (Pino redaction): vendor error bodies can carry PII
    // (echoed email, customer id) — log length + a truncation flag only,
    // never the raw text.
    const bodyText = await response.text().catch(() => "");
    recordExternalHttp(upstream, "error", ms);
    logger.warn({
      msg: `${upstream}_gdpr_delete_failed`,
      status: response.status,
      bodyLength: bodyText.length,
    });
    return {
      outcome: "error",
      status: response.status,
      error: `${upstream} returned ${response.status}`,
      ms,
    };
  } catch (e: unknown) {
    const ms = elapsedMs(start);
    const outcome: VendorDeleteOutcome = isAbortError(e) ? "timeout" : "error";
    recordExternalHttp(upstream, outcome, ms);
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({
      msg: `${upstream}_gdpr_delete_exception`,
      outcome,
      error: message,
    });
    return { outcome, error: message, ms };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `DELETE https://api.stripe.com/v1/customers/{id}` (ADR-6.3 table). Basic
 * auth with the secret key as username, empty password — Stripe's REST
 * convention. Skipped when `STRIPE_SECRET_KEY` is unset OR the queue row
 * has no `stripe_customer_id` (user never had a Stripe subscription).
 */
export async function deleteStripeCustomer(
  customerId: string | null | undefined,
  options: DeleteOptions & { secretKey?: string | undefined } = {},
): Promise<VendorDeleteResult> {
  const secretKey = options.secretKey ?? process.env["STRIPE_SECRET_KEY"];
  if (!secretKey || !customerId) {
    return { outcome: "skipped" };
  }
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  return deleteExternalResource(
    "stripe",
    `https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`,
    { Authorization: `Basic ${auth}` },
    options,
  );
}

/**
 * `DELETE {host}/api/0/projects/{org}/{project}/users/{userId}/` (ADR-6.3
 * table). Requires an ORG-level auth token with `org:admin` scope —
 * distinct from `SENTRY_DSN` (a client key, already used for error
 * reporting) — plus the org/project slugs. None of the three currently
 * exist in `env/env.ts`; read directly from `process.env` (same pattern as
 * `POSTHOG_API_KEY` in `lib/posthog.ts`) so adding this integration does
 * not require touching the validated env schema.
 */
export async function deleteSentryUser(
  userId: string,
  options: DeleteOptions & {
    authToken?: string | undefined;
    orgSlug?: string | undefined;
    projectSlug?: string | undefined;
    host?: string | undefined;
  } = {},
): Promise<VendorDeleteResult> {
  const authToken = options.authToken ?? process.env["SENTRY_AUTH_TOKEN"];
  const orgSlug = options.orgSlug ?? process.env["SENTRY_ORG_SLUG"];
  const projectSlug = options.projectSlug ?? process.env["SENTRY_PROJECT_SLUG"];
  if (!authToken || !orgSlug || !projectSlug || !userId) {
    return { outcome: "skipped" };
  }
  const host = (options.host ?? "https://sentry.io").replace(/\/+$/, "");
  return deleteExternalResource(
    "sentry",
    `${host}/api/0/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(
      projectSlug,
    )}/users/${encodeURIComponent(userId)}/`,
    { Authorization: `Bearer ${authToken}` },
    options,
  );
}

/**
 * `DELETE https://api.resend.com/contacts/{email}` — the canonical
 * account-wide Resend contact-delete endpoint (Resend does not expose
 * `DELETE /audiences/:id/contacts/:email`; that path 404s unconditionally).
 * ADR-6.3's table sketched the audience-scoped shape before this was ever
 * implemented — CodeRabbit review on PR #627 caught that it doesn't exist,
 * which meant every real call 404'd and the worker mis-read that as
 * "contact already gone" (see the `not_found` idempotent-success comment
 * below — still correct, just for the wrong reason).
 *
 * Only `RESEND_API_KEY` is required now (already used for transactional
 * email, `email/ftuxDripMail.ts`); `RESEND_AUDIENCE_ID` is no longer
 * consulted — the endpoint deletes by email across the whole account, not
 * scoped to one audience.
 */
export async function deleteResendContact(
  email: string | null | undefined,
  options: DeleteOptions & {
    apiKey?: string | undefined;
    host?: string | undefined;
  } = {},
): Promise<VendorDeleteResult> {
  const apiKey = options.apiKey ?? process.env["RESEND_API_KEY"];
  if (!apiKey || !email) {
    return { outcome: "skipped" };
  }
  const host = (options.host ?? "https://api.resend.com").replace(/\/+$/, "");
  return deleteExternalResource(
    "resend",
    `${host}/contacts/${encodeURIComponent(email)}`,
    { Authorization: `Bearer ${apiKey}` },
    options,
  );
}
