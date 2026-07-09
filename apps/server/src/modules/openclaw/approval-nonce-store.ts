/**
 * OpenClaw approval-nonce DB ledger (single-use enforcement).
 *
 * The signed token (`./approval-nonce.ts`) proves a nonce is authentic,
 * unexpired, and bound to a tool+args. This table proves it hasn't been
 * spent yet: `consumeApprovalNonce` stamps `consumed_at` atomically, so two
 * concurrent writes racing the same nonce can never both succeed.
 *
 * Migration: `apps/server/src/migrations/080_openclaw_approval_nonce.sql`.
 */

import type { Pool } from "pg";

export interface IssueApprovalNonceInput {
  jti: string;
  tool: string;
  argsHash: string;
  /** Hard expiry — `issued_at + OPENCLAW_APPROVAL_NONCE_TTL_SEC`. */
  expiresAt: Date;
}

/**
 * Records a freshly-minted nonce. Called by the mint endpoint AFTER the
 * signed token is produced. The row starts life unconsumed.
 */
export async function issueApprovalNonce(
  pool: Pool,
  input: IssueApprovalNonceInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO openclaw_approval_nonce (jti, tool, args_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [input.jti, input.tool, input.argsHash, input.expiresAt],
  );
}

export type ConsumeApprovalNonceOutcome =
  | { ok: true; tool: string; argsHash: string }
  /** No unconsumed, unexpired row for this jti (spent, expired, or unknown). */
  | { ok: false; reason: "already_consumed_or_unknown" };

/**
 * Atomically marks a nonce consumed and returns its stored tool+args_hash.
 * The `consumed_at IS NULL AND expires_at > NOW()` predicate makes this
 * idempotent-safe under concurrency: the first caller flips the row and gets
 * `ok: true`; any racing/replayed caller matches zero rows and gets
 * `already_consumed_or_unknown`.
 *
 * Returns the DB-side tool + args_hash so the caller can defence-in-depth
 * cross-check them against the signed token (they must already match, but a
 * mismatch would indicate token/DB divergence worth failing closed on).
 */
export async function consumeApprovalNonce(
  pool: Pool,
  jti: string,
): Promise<ConsumeApprovalNonceOutcome> {
  const result = await pool.query<{ tool: string; args_hash: string }>(
    `UPDATE openclaw_approval_nonce
        SET consumed_at = NOW()
      WHERE jti = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
      RETURNING tool, args_hash`,
    [jti],
  );
  const row = result.rows[0];
  if (!row) return { ok: false, reason: "already_consumed_or_unknown" };
  return { ok: true, tool: row.tool, argsHash: row.args_hash };
}

/**
 * Deletes expired rows. Cheap GC for a retention poller / cron; the short
 * TTL keeps the table tiny so this is best-effort, not load-bearing.
 * Returns the number of rows removed.
 */
export async function purgeExpiredApprovalNonces(pool: Pool): Promise<number> {
  const result = await pool.query(
    `DELETE FROM openclaw_approval_nonce WHERE expires_at <= NOW()`,
  );
  return result.rowCount ?? 0;
}
