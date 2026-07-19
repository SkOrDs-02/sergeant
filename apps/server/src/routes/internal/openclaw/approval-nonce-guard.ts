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
  NonceVerifyReason | "missing_nonce" | "already_consumed" | "ledger_mismatch";

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

type NonceEvaluation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: GuardRejectReason };

/**
 * Pure-ish evaluation of the nonce (verify + single-use consume). Returns a
 * structured verdict; it does NOT decide whether the request is allowed —
 * that call is made by `enforceWriteApproval` based on server config, so the
 * user-controlled token never directly gates the sensitive branch. Mirrors
 * `verifyWebhookRequest` (returns `{ ok, reason }`, middleware decides).
 */
async function evaluateNonce(args: {
  pool: Pool;
  secret: string;
  token: string | undefined;
  tool: string;
  writeArgs: unknown;
  nowSec: number;
}): Promise<NonceEvaluation> {
  if (args.token === undefined) return { ok: false, reason: "missing_nonce" };

  const verified = verifyApprovalNonce({
    secret: args.secret,
    token: args.token,
    tool: args.tool,
    writeArgs: args.writeArgs,
    now: args.nowSec,
  });
  if (!verified.ok) return { ok: false, reason: verified.reason };

  // Single-use: consume atomically. Runs only AFTER signature/expiry/binding
  // checks pass, so a forged token can never burn a real nonce.
  const consumed = await consumeApprovalNonce(args.pool, verified.payload.jti);
  if (!consumed.ok) return { ok: false, reason: "already_consumed" };

  // Defence-in-depth: the ledger row must agree with the signed token.
  if (
    consumed.tool !== args.tool ||
    consumed.argsHash !== verified.payload.argsHash
  ) {
    return { ok: false, reason: "ledger_mismatch" };
  }

  return { ok: true };
}

/**
 * Enforce (or, in grace mode, opportunistically verify) the approval nonce
 * for a `/write/*` call.
 *
 * The allow/deny decision hinges on the SERVER-controlled `cfg.required`
 * flag, never directly on the user-supplied header: a bad/missing nonce is a
 * 401 only when enforcement is required, and a grace-mode pass-through is
 * gated by config, not by the attacker choosing to omit the header. This
 * mirrors `verifyWebhookSignature`'s grace-mode and keeps the security
 * decision out of untrusted-input control.
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

  const nowSec = Math.floor((args.now ? args.now() : Date.now()) / 1000);
  const outcome = await evaluateNonce({
    pool: args.pool,
    secret: cfg.secret,
    token,
    tool: args.tool,
    writeArgs: args.writeArgs,
    nowSec,
  });

  if (outcome.ok) return true;

  // Sole allow/deny gate is the untrusted-input-free `cfg.required`.
  if (cfg.required) {
    reject(args.res, args.tool, outcome.reason);
    return false;
  }

  // Grace window: config (not the header) permits the write. A PRESENT but
  // bad nonce is still worth a medium event; a plain missing nonce is already
  // captured by the low-severity `openclaw_write_invoked` baseline above, so
  // don't double-emit on every legit pre-console write.
  if (token !== undefined) flagGrace(args.tool, outcome.reason);
  return true;
}
