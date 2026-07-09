/**
 * Grace-mode enforcement guard for OpenClaw write-tool approval nonces.
 *
 * Mirrors the staged `WEBHOOK_HMAC_REQUIRED` rollout used for n8n internal
 * routes (`http/verifyWebhookSignature.ts`):
 *
 *   - `OPENCLAW_APPROVAL_NONCE_SECRET=""` → feature disabled, guard is a
 *     no-op (bearer-only, legacy posture).
 *   - secret set + `OPENCLAW_WRITE_NONCE_REQUIRED=false` (default) → verify +
 *     consume a nonce when the console sends one, warn-log
 *     `openclaw_write_nonce_invalid` on a PRESENT-but-bad nonce, but still
 *     let the write through. This is the window where the console (separate
 *     repo, `tools/openclaw`) ships its Approve-flow change.
 *   - secret set + required=true → a missing/invalid/spent nonce → 401.
 *
 * Every write also emits a low-severity `openclaw_write_invoked` baseline so
 * a burst of writes trips the securityEvents rate-limiter as an anomaly
 * signal even before enforcement is turned on.
 *
 * Pino redaction (Hard Rule #21): never log the raw nonce token — only the
 * tool name + a reason enum.
 */

import type { Request, Response } from "express";
import type { Pool } from "pg";
import { env } from "../../../env.js";
import { emitSecurityEvent } from "../../../obs/securityEvents.js";
import {
  APPROVAL_NONCE_HEADER,
  consumeApprovalNonce,
  verifyApprovalNonce,
  type NonceVerifyReason,
} from "../../../modules/openclaw/index.js";

export interface ApprovalNonceConfig {
  /** HMAC secret; empty string disables the feature entirely. */
  readonly secret: string;
  /** When true, a missing/invalid/spent nonce is a hard 401. */
  readonly required: boolean;
}

/** Default config-getter — reads the live `env` module (per-request). */
export function readApprovalNonceConfig(): ApprovalNonceConfig {
  return {
    secret: env.OPENCLAW_APPROVAL_NONCE_SECRET,
    required: env.OPENCLAW_WRITE_NONCE_REQUIRED,
  };
}

/** Reasons a nonce is rejected — verifier reasons plus guard-only ones. */
export type GuardRejectReason =
  | NonceVerifyReason
  | "missing_nonce"
  | "already_consumed"
  | "ledger_mismatch";

function pickHeader(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function reject(res: Response, tool: string, reason: GuardRejectReason): false {
  emitSecurityEvent({
    event: "openclaw_write_nonce_invalid",
    severity: "medium",
    details: `tool=${tool} reason=${reason} required=true`,
  });
  res.status(401).json({
    error: "approval_nonce_invalid",
    code: "OPENCLAW_APPROVAL_NONCE_INVALID",
    reason,
  });
  return false;
}

/** Warn-only flag for a PRESENT-but-bad nonce during the grace window. */
function flagGrace(tool: string, reason: GuardRejectReason): void {
  emitSecurityEvent({
    event: "openclaw_write_nonce_invalid",
    severity: "medium",
    details: `tool=${tool} reason=${reason} required=false`,
  });
}

/**
 * Enforce (or, in grace mode, opportunistically verify) the approval nonce
 * for a `/write/*` call.
 *
 * @returns `true` when the handler should proceed; `false` when a 401 has
 *          already been written to `res` (required mode, bad nonce).
 */
export async function enforceWriteApproval(args: {
  pool: Pool;
  req: Request;
  res: Response;
  /** Write-tool name (e.g. `pause_workflow`). */
  tool: string;
  /** Parsed write body — the args the nonce is bound to. */
  writeArgs: unknown;
  config?: ApprovalNonceConfig;
  /** Injectable UNIX-seconds clock for tests. */
  now?: () => number;
}): Promise<boolean> {
  const cfg = args.config ?? readApprovalNonceConfig();
  const token = pickHeader(args.req.headers[APPROVAL_NONCE_HEADER]);

  // Detect-only baseline — one per write, independent of the feature flag.
  emitSecurityEvent({
    event: "openclaw_write_invoked",
    severity: "low",
    details: `tool=${args.tool} nonce=${token ? "present" : "absent"} required=${cfg.required}`,
  });

  // Feature disabled → bearer-only legacy posture.
  if (!cfg.secret) return true;

  if (token === undefined) {
    // Missing nonce: hard-fail only in required mode. In grace mode the
    // baseline `openclaw_write_invoked` (nonce=absent) already records it —
    // don't double-emit a medium event on every legit pre-console write.
    if (cfg.required) return reject(args.res, args.tool, "missing_nonce");
    return true;
  }

  const nowSec = Math.floor((args.now ? args.now() : Date.now()) / 1000);
  const verified = verifyApprovalNonce({
    secret: cfg.secret,
    token,
    tool: args.tool,
    writeArgs: args.writeArgs,
    now: nowSec,
  });
  if (!verified.ok) {
    if (cfg.required) return reject(args.res, args.tool, verified.reason);
    flagGrace(args.tool, verified.reason);
    return true;
  }

  // Single-use: consume atomically. Runs only AFTER signature/expiry/binding
  // checks pass, so a forged token can never burn a real nonce.
  const consumed = await consumeApprovalNonce(args.pool, verified.payload.jti);
  if (!consumed.ok) {
    if (cfg.required) return reject(args.res, args.tool, "already_consumed");
    flagGrace(args.tool, "already_consumed");
    return true;
  }

  // Defence-in-depth: the ledger row must agree with the signed token.
  if (
    consumed.tool !== args.tool ||
    consumed.argsHash !== verified.payload.argsHash
  ) {
    if (cfg.required) return reject(args.res, args.tool, "ledger_mismatch");
    flagGrace(args.tool, "ledger_mismatch");
    return true;
  }

  return true;
}
