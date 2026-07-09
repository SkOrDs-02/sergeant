/**
 * OpenClaw write-tool approval nonce — pure crypto + arg canonicalization.
 *
 * ADR-0036 Phase 4 hardening (branch security review 2026-07-09, MEDIUM).
 * The console (separate repo, `tools/openclaw`) enforced founder-approval
 * only on its own side; server-side, any holder of `INTERNAL_API_KEY` could
 * POST to `/api/internal/openclaw/write/*` with no approval verification.
 *
 * This module mints and verifies a signed, single-use approval nonce that
 * binds a write to (a) a specific tool, (b) the exact approved args, and
 * (c) a short expiry. The DB single-use ledger lives in
 * `./approval-nonce-store.ts`; the HTTP grace-mode guard lives in
 * `routes/internal/openclaw/approval-nonce-guard.ts`. This file is
 * DB-free and side-effect-free so it unit-tests without a container.
 *
 * Token wire format (opaque to the console — it only echoes the string):
 *
 *   oc1.<base64url(payloadJson)>.<hmacHex>
 *
 * where `hmacHex = HMAC-SHA256(secret, "oc1.<base64url(payloadJson)>")` and
 * `payloadJson = {"jti","tool","argsHash","exp"}`. The `oc1.` version prefix
 * lets us rotate the format without ambiguity. Constant-time compare on the
 * signature (see `../../http/safeCompare.ts` rationale) so a naive `===`
 * can't leak the HMAC byte-by-byte.
 */

import crypto from "node:crypto";
import { safeStringEqual } from "../../http/safeCompare.js";
import { OPENCLAW_WRITE_TOOL_NAMES } from "./write-tools.js";

/** Current token version tag. Bump on any wire-format change. */
export const APPROVAL_NONCE_VERSION = "oc1";

/** HTTP header the console replays the minted nonce on. */
export const APPROVAL_NONCE_HEADER = "x-openclaw-approval";

/**
 * Per-tool ordered arg fields that get hashed into the nonce. These mirror
 * the `/write/*` request bodies (see `routes/internal/openclaw/schemas.ts`)
 * so the server can recompute the same `argsHash` at verify time from the
 * parsed body. The console mints with the identical field values.
 *
 * Only these fields participate in the hash — extra/derived body fields are
 * ignored so a schema addition doesn't silently break every nonce.
 */
export const WRITE_TOOL_ARG_FIELDS: Readonly<
  Record<string, readonly string[]>
> = {
  commit_to_strategy_doc: ["path", "content", "message", "repo"],
  create_github_issue: ["title", "body", "labels", "repo"],
  post_to_topic: ["topic", "text"],
  pause_workflow: ["workflowId", "reason"],
  mute_alert: ["issueId", "untilIso"],
};

export interface ApprovalNoncePayload {
  /** 128-bit hex nonce id; also the DB single-use ledger key. */
  readonly jti: string;
  /** Write-tool name this nonce authorizes (one of OPENCLAW_WRITE_TOOL_NAMES). */
  readonly tool: string;
  /** sha256(canonical-json(projected args)) hex. */
  readonly argsHash: string;
  /** Expiry, UNIX seconds. */
  readonly exp: number;
}

export type NonceVerifyReason =
  | "malformed_nonce"
  | "signature_mismatch"
  | "expired"
  | "tool_mismatch"
  | "args_mismatch";

export type NonceVerifyResult =
  | { readonly ok: true; readonly payload: ApprovalNoncePayload }
  | { readonly ok: false; readonly reason: NonceVerifyReason };

/** True when `tool` is a known write-tool the nonce scheme covers. */
export function isWriteToolName(tool: string): boolean {
  return OPENCLAW_WRITE_TOOL_NAMES.includes(tool);
}

/**
 * Deterministic JSON: object keys sorted recursively, arrays kept in order.
 * Undefined and function values are dropped (same as `JSON.stringify`).
 * Ensures the mint side and the verify side produce byte-identical input to
 * the hash regardless of key insertion order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

/**
 * Projects the tool's approved arg fields out of a source object (a `/write`
 * body on the verify side, the console's `args` on the mint side), dropping
 * `undefined`, then hashes the canonical JSON. Unknown tools project to the
 * empty object — callers gate on `isWriteToolName` first, so that only
 * happens for a genuinely unsupported tool and yields a stable-but-useless
 * hash rather than throwing.
 */
export function hashWriteArgs(tool: string, source: unknown): string {
  const fields = WRITE_TOOL_ARG_FIELDS[tool] ?? [];
  const projected: Record<string, unknown> = {};
  if (source && typeof source === "object") {
    const obj = source as Record<string, unknown>;
    for (const field of fields) {
      if (obj[field] !== undefined) projected[field] = obj[field];
    }
  }
  // Plain SHA-256, not HMAC — `argsHash` carries no secret: it is meant to be
  // publicly recomputable so mint and verify agree, and its integrity is
  // covered by the HMAC over the whole token payload. The static prefix is
  // just domain separation, not a key.
  return crypto
    .createHash("sha256")
    .update("openclaw-write-args-v1\n")
    .update(stableStringify(projected))
    .digest("hex");
}

/** Fresh 128-bit hex nonce id. */
export function newNonceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function encodePayload(payload: ApprovalNoncePayload): string {
  const json = JSON.stringify({
    jti: payload.jti,
    tool: payload.tool,
    argsHash: payload.argsHash,
    exp: payload.exp,
  });
  return Buffer.from(json, "utf8").toString("base64url");
}

function signSigningInput(secret: string, signingInput: string): string {
  return crypto.createHmac("sha256", secret).update(signingInput).digest("hex");
}

/**
 * Mints a signed nonce token string. `secret` MUST be non-empty (callers
 * gate on the feature flag first).
 */
export function signApprovalNonce(
  secret: string,
  payload: ApprovalNoncePayload,
): string {
  const encoded = encodePayload(payload);
  const signingInput = `${APPROVAL_NONCE_VERSION}.${encoded}`;
  return `${signingInput}.${signSigningInput(secret, signingInput)}`;
}

/**
 * Verifies a nonce token's signature, expiry, and binding to `tool` +
 * `args`. Does NOT touch the DB — single-use consumption is enforced
 * separately (`consumeApprovalNonce`) only after this returns `ok`.
 *
 * @param now  UNIX-seconds clock, injectable for tests.
 */
export function verifyApprovalNonce(args: {
  secret: string;
  token: string;
  tool: string;
  writeArgs: unknown;
  now: number;
}): NonceVerifyResult {
  const parts = args.token.split(".");
  if (parts.length !== 3 || parts[0] !== APPROVAL_NONCE_VERSION) {
    return { ok: false, reason: "malformed_nonce" };
  }
  const [version, encoded, signature] = parts as [string, string, string];

  const signingInput = `${version}.${encoded}`;
  const expected = signSigningInput(args.secret, signingInput);
  // Constant-time — a naive `===` on the hex HMAC leaks the first
  // mismatching byte through branch timing (see safeCompare.ts).
  if (!safeStringEqual(signature, expected)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  let payload: ApprovalNoncePayload;
  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<ApprovalNoncePayload>;
    if (
      typeof decoded.jti !== "string" ||
      typeof decoded.tool !== "string" ||
      typeof decoded.argsHash !== "string" ||
      typeof decoded.exp !== "number" ||
      !Number.isFinite(decoded.exp)
    ) {
      return { ok: false, reason: "malformed_nonce" };
    }
    payload = {
      jti: decoded.jti,
      tool: decoded.tool,
      argsHash: decoded.argsHash,
      exp: decoded.exp,
    };
  } catch {
    return { ok: false, reason: "malformed_nonce" };
  }

  if (args.now >= payload.exp) return { ok: false, reason: "expired" };
  if (payload.tool !== args.tool) return { ok: false, reason: "tool_mismatch" };

  const actualHash = hashWriteArgs(args.tool, args.writeArgs);
  // Constant-time — the hash is a public-length hex string, but keep the
  // same discipline as the signature compare.
  if (!safeStringEqual(payload.argsHash, actualHash)) {
    return { ok: false, reason: "args_mismatch" };
  }

  return { ok: true, payload };
}
