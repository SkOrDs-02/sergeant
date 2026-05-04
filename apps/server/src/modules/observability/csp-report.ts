import type { Request, Response } from "express";
import { logger } from "../../obs/logger.js";
import { cspViolationTotal } from "../../obs/metrics.js";

/**
 * POST /api/csp-report
 *
 * Receives Content-Security-Policy violation reports from browsers. The
 * frontend ships CSP via Vercel headers (see root `vercel.json`); this
 * endpoint is the `report-uri` sink referenced from that policy. Closing
 * hardening card C2 (`docs/security/hardening/C2-frontend-csp.md`)
 * required wiring a real sink so the Phase-1 Report-Only canary can
 * actually surface violations instead of dropping them on the floor.
 *
 * Why a server endpoint instead of forwarding straight to Sentry:
 *   1. We already aggregate metrics via Prometheus in `obs/metrics.ts`;
 *      driving alerting from Grafana keeps CSP rollout decisions on the
 *      same dashboard as deploy / RED metrics.
 *   2. Sending raw CSP reports to Sentry would consume the project's
 *      event quota fast — `report-uri` traffic is high-volume on a
 *      fresh policy. We instead increment a per-directive counter and
 *      sample-log via Pino so noisy directives stay visible without
 *      drowning the logs.
 *
 * Wire format. Browsers POST one of two payloads:
 *   - Legacy `report-uri` with `Content-Type: application/csp-report`
 *     and a top-level `csp-report` key:
 *     `{ "csp-report": { "violated-directive": "script-src", ... } }`.
 *   - Modern `Reporting-API` (`report-to`) with `Content-Type:
 *     application/reports+json` and a top-level array of report objects
 *     each with `type: "csp-violation"` and a `body` field.
 * We accept both shapes (the per-route body parser in `app.ts` mounts
 * `express.json` + `express.json` with `type: "application/csp-report"`
 * so `req.body` is always a parsed JSON value here).
 *
 * Always responds `204 No Content` regardless of payload validity. The
 * browser ignores the response body, and a noisy 4xx would only feed
 * its own retry telemetry — that's exactly the noise we already have
 * a metric for.
 */

interface LegacyCspReportBody {
  "csp-report"?: Record<string, unknown>;
}

interface ReportingApiEntry {
  type?: string;
  body?: Record<string, unknown>;
}

const KNOWN_DIRECTIVES = new Set<string>([
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "media-src",
  "object-src",
  "frame-src",
  "frame-ancestors",
  "form-action",
  "base-uri",
  "manifest-src",
  "worker-src",
  "child-src",
  "prefetch-src",
  "report-uri",
  "report-to",
  "upgrade-insecure-requests",
  "require-trusted-types-for",
  "trusted-types",
]);

/**
 * Strip the noise that browsers append to a directive name (e.g.
 * `style-src-elem 'self'`) so the metric's `directive` label has bounded
 * cardinality. Anything we don't recognise falls into `other` — we never
 * want to let an unknown directive silently inflate the time-series count.
 */
function normalizeDirective(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "unknown";
  const head = raw.trim().split(/\s+/, 1)[0]!.toLowerCase();
  if (!head) return "unknown";
  return KNOWN_DIRECTIVES.has(head) ? head : "other";
}

/**
 * Same idea for the policy mode label: report-only deploys must not
 * collide with future enforce-mode deploys on the same metric series.
 * The browser sends `disposition: "report" | "enforce"` for both wire
 * formats; we map missing/unknown values to `unknown` so PromQL never
 * sees an empty label value.
 */
function normalizeDisposition(raw: unknown): "report" | "enforce" | "unknown" {
  if (raw === "report" || raw === "enforce") return raw;
  return "unknown";
}

function recordViolation(
  body: Record<string, unknown> | undefined,
  fallbackDisposition?: string,
): void {
  if (!body || typeof body !== "object") return;

  // Wire formats use slightly different key names. `violated-directive`
  // is the legacy path; `effectiveDirective` is the Reporting-API path
  // (camelCase, no hyphen, narrower scope). Prefer the more specific
  // `effective-directive` when present so the metric attributes the
  // violation to the directive that actually fired.
  const directive = normalizeDirective(
    (body["effective-directive"] as unknown) ??
      (body["effectiveDirective"] as unknown) ??
      (body["violated-directive"] as unknown) ??
      (body["violatedDirective"] as unknown),
  );
  const disposition = normalizeDisposition(
    (body["disposition"] as unknown) ?? fallbackDisposition,
  );

  try {
    cspViolationTotal.inc({ directive, disposition });
  } catch {
    /* metrics must never break the handler */
  }

  // Sample-log so a noisy directive doesn't flood Pino → Loki. 5% gives
  // us a couple of representative events per minute on the rollout
  // canary without filling the storage quota.
  if (Math.random() < 0.05) {
    logger.info({
      msg: "csp_violation",
      directive,
      disposition,
      blockedUri:
        (body["blocked-uri"] as string | undefined) ??
        (body["blockedURL"] as string | undefined) ??
        null,
      documentUri:
        (body["document-uri"] as string | undefined) ??
        (body["documentURL"] as string | undefined) ??
        null,
      sourceFile:
        (body["source-file"] as string | undefined) ??
        (body["sourceFile"] as string | undefined) ??
        null,
      lineNumber:
        (body["line-number"] as number | undefined) ??
        (body["lineNumber"] as number | undefined) ??
        null,
    });
  }
}

export default function cspReportHandler(req: Request, res: Response): void {
  const body = req.body as unknown;

  // Legacy `application/csp-report` payload — single object with a
  // `csp-report` envelope. Some browsers (older Safari) drop the
  // envelope and post the report directly; cover both.
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const legacy = body as LegacyCspReportBody;
    if (
      legacy["csp-report"] &&
      typeof legacy["csp-report"] === "object" &&
      !Array.isArray(legacy["csp-report"])
    ) {
      recordViolation(legacy["csp-report"]);
      res.status(204).end();
      return;
    }
    // Bare report payload (no envelope). Treat as a violation if it
    // looks like one — must have at least a directive field to be
    // useful.
    const direct = body as Record<string, unknown>;
    if (
      "violated-directive" in direct ||
      "violatedDirective" in direct ||
      "effective-directive" in direct ||
      "effectiveDirective" in direct
    ) {
      recordViolation(direct);
    }
    res.status(204).end();
    return;
  }

  // Reporting-API `application/reports+json` payload — array of
  // report objects. Each report has `type: "csp-violation"` and a
  // `body` containing the violation details.
  if (Array.isArray(body)) {
    for (const entry of body as ReportingApiEntry[]) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.type !== "csp-violation" && entry.type !== "csp") continue;
      // Reporting-API doesn't carry `disposition` at the entry level on
      // every browser — pass through the body's own field if any.
      recordViolation(entry.body);
    }
    res.status(204).end();
    return;
  }

  // Anything else (string, null, undefined, malformed JSON) — accept
  // silently to keep the browser from retrying. We don't want to give
  // a fuzzer signal that "204 means we processed your payload".
  res.status(204).end();
}
