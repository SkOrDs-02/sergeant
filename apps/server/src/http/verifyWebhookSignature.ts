import crypto from "node:crypto";
import type { Request, RequestHandler } from "express";

import { env } from "../env.js";
import { logger } from "../obs/logger.js";
import { Sentry } from "../sentry.js";
import { safeStringEqual } from "./safeCompare.js";

/**
 * HMAC-SHA256 webhook signature verifier for `/api/internal/*` (n8n →
 * server M2M calls). PR-48 follow-up; addresses the Better Auth security
 * audit item that flagged shared-bearer-only auth on internal endpoints
 * as exploitable if `INTERNAL_API_KEY` ever leaks (e.g. via accidental
 * `console.log` on the n8n side, env-var dump in CI logs, etc).
 *
 * Two-factor posture:
 *   1. `Authorization: Bearer <INTERNAL_API_KEY>` — already enforced by
 *      `createInternalRouter` ahead of us; we run AFTER that gate.
 *   2. `X-Signature: hex(HMAC-SHA256(secret, "<X-Timestamp>.<rawBody>"))`
 *      with `X-Timestamp` a UNIX-seconds integer; the timestamp prefix
 *      prevents body-only replays against a different clock window.
 *
 * Rollout (30-day grace window):
 *   - `WEBHOOK_HMAC_SECRET=""` → middleware is a no-op (feature disabled).
 *   - `WEBHOOK_HMAC_SECRET=<x>` + `WEBHOOK_HMAC_REQUIRED=false` (default)
 *     → verifies opportunistically, logs `webhook_hmac_mismatch` warn +
 *     Sentry breadcrumb on failure, but **still accepts** the request.
 *     This is the period where ops can land per-workflow Function-node
 *     signing code without a coordinated cut-over.
 *   - `WEBHOOK_HMAC_REQUIRED=true` → flip after the manifest reports
 *     `hmac_signed: true` for every n8n workflow that calls server.
 *     Then missing/invalid signature → 401 Unauthorized.
 *
 * Constant-time comparison via `safeStringEqual` (which delegates to
 * `crypto.timingSafeEqual`). Naive `===` on a hex-encoded HMAC leaks
 * the first mismatching byte through CPU branch timing, which is a
 * statistical recovery attack for an on-path adversary.
 */

const SIGNATURE_HEADER = "x-signature";
const TIMESTAMP_HEADER = "x-timestamp";

export type WebhookSigFailureReason =
  | "missing_signature"
  | "missing_timestamp"
  | "malformed_timestamp"
  | "timestamp_out_of_window"
  | "raw_body_unavailable"
  | "signature_mismatch";

export interface VerifyResult {
  readonly ok: boolean;
  readonly reason?: WebhookSigFailureReason;
}

interface VerifyOptions {
  /** HMAC shared secret. Empty/undefined → feature disabled (returns ok). */
  readonly secret: string | undefined;
  /** When true, missing/invalid signature is a hard 401; otherwise warn-only. */
  readonly required: boolean;
  /** Allowed clock-skew window, in seconds (server vs `X-Timestamp`). */
  readonly toleranceSec: number;
  /** Now-clock, injected so unit tests can pin the comparison. */
  readonly now?: () => number;
}

/**
 * Pure verifier. Encapsulates header parsing + replay window + HMAC
 * compare so the route-middleware layer stays a thin shim. Returns
 * `{ ok: true }` when the feature is disabled (no secret configured) —
 * which makes it safe to call unconditionally from the middleware.
 */
export function verifyWebhookRequest(
  req: Pick<Request, "headers"> & { rawBody?: Buffer | undefined },
  opts: VerifyOptions,
): VerifyResult {
  // Feature gate: no secret → no verification at all. We rely on the
  // bearer-token guard for these legacy callers.
  if (!opts.secret) return { ok: true };

  const signature = pickHeader(req.headers[SIGNATURE_HEADER]);
  const timestamp = pickHeader(req.headers[TIMESTAMP_HEADER]);

  if (signature === undefined)
    return { ok: false, reason: "missing_signature" };
  if (timestamp === undefined)
    return { ok: false, reason: "missing_timestamp" };

  const tsNumber = Number(timestamp);
  if (!Number.isFinite(tsNumber) || !Number.isInteger(tsNumber)) {
    return { ok: false, reason: "malformed_timestamp" };
  }

  const nowSec = Math.floor((opts.now ? opts.now() : Date.now()) / 1000);
  const drift = Math.abs(nowSec - tsNumber);
  if (drift > opts.toleranceSec) {
    return { ok: false, reason: "timestamp_out_of_window" };
  }

  // `req.rawBody` is captured by `applyBodySizePolicy`'s `verify` callback
  // for the `/api/internal` prefix. Empty body still needs a Buffer (the
  // n8n side will sign an empty buffer for GETs/DELETEs); only an outright
  // missing capture is a setup bug.
  const rawBody = req.rawBody;
  if (rawBody === undefined)
    return { ok: false, reason: "raw_body_unavailable" };

  const expected = crypto
    .createHmac("sha256", opts.secret)
    .update(`${tsNumber}.`)
    .update(rawBody)
    .digest("hex");

  if (!safeStringEqual(signature, expected)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

/** Snapshot of webhook-HMAC config — captured per-request to keep tests trivially mockable. */
export interface WebhookHmacConfig {
  readonly secret: string;
  readonly required: boolean;
  readonly toleranceSec: number;
}

/** Default config-getter — reads the live `env` module. */
function readConfig(): WebhookHmacConfig {
  return {
    secret: env.WEBHOOK_HMAC_SECRET,
    required: env.WEBHOOK_HMAC_REQUIRED,
    toleranceSec: env.WEBHOOK_HMAC_TS_TOLERANCE_SEC,
  };
}

/**
 * Express middleware. Wires the verifier to `env` + observability:
 *   - Warn-only mode logs + Sentry-breadcrumbs + lets the request through.
 *   - Required mode logs + Sentry-message + replies 401.
 *
 * Mount AFTER the bearer-token guard in `routes/internal/index.ts` so we
 * don't double-process unauthenticated requests.
 *
 * `getConfig` is injectable so unit-tests can swap config without
 * resetting modules — by default the live `env` is read per-request.
 */
export function verifyWebhookSignature(
  getConfig: () => WebhookHmacConfig = readConfig,
): RequestHandler {
  return (req, res, next) => {
    const cfg = getConfig();
    const result = verifyWebhookRequest(
      req as Request & { rawBody?: Buffer | undefined },
      {
        secret: cfg.secret || undefined,
        required: cfg.required,
        toleranceSec: cfg.toleranceSec,
      },
    );

    if (result.ok) {
      next();
      return;
    }

    const reason = result.reason ?? "signature_mismatch";

    // Pino redaction policy (HR #21): never log the raw signature, body, or
    // bearer token. The `reason` enum + path is enough for an on-call to
    // grep `webhook_hmac_mismatch` and correlate to a workflow.
    logger.warn(
      {
        reason,
        path: req.path,
        method: req.method,
        // `required` lets us distinguish grace-period noise from real 401s.
        required: cfg.required,
      },
      "webhook_hmac_mismatch",
    );

    Sentry.addBreadcrumb?.({
      category: "webhook.hmac",
      level: cfg.required ? "warning" : "info",
      message: "webhook_hmac_mismatch",
      data: {
        reason,
        path: req.path,
        method: req.method,
        required: cfg.required,
      },
    });

    if (cfg.required) {
      res.status(401).json({
        error: "Invalid webhook signature",
        code: "WEBHOOK_HMAC_INVALID",
        reason,
      });
      return;
    }

    // Grace window: log + pass through.
    next();
  };
}

function pickHeader(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * Helper used by tests + future CLI utilities to produce a signature in
 * exactly the same way the verifier expects. Exported so n8n / ops
 * tooling can re-use the format without re-implementing the prefix
 * convention.
 */
export function signWebhookRequest(args: {
  secret: string;
  timestampSec: number;
  rawBody: Buffer | string;
}): string {
  const body =
    typeof args.rawBody === "string"
      ? Buffer.from(args.rawBody, "utf8")
      : args.rawBody;
  return crypto
    .createHmac("sha256", args.secret)
    .update(`${args.timestampSec}.`)
    .update(body)
    .digest("hex");
}
