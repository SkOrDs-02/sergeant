import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "../../db.js";
import { logger } from "../../obs/logger.js";

/**
 * Append-only audit writer for `POST /api/push/send`
 * (`docs/security/hardening/M14-internal-push-ip-allowlist.md`).
 *
 * Schema lives in migration `041_push_send_audit.sql`. This helper is the
 * single insert path: routing `INSERT INTO push_send_audit` through one
 * function keeps the column list and hash algorithm versioned in one
 * place — if we later need to rotate `payload_hash` to a different
 * digest, every caller picks up the change for free.
 *
 * Failure-mode contract: writes are best-effort. If the table is missing
 * (migration not yet applied), the connection is exhausted, or any other
 * Postgres error fires, the helper logs once at `warn` and returns
 * without throwing. Push delivery already happened by the time we get
 * here; failing the response because the audit write blew up would
 * convert a forensics outage into a user-visible push outage. The
 * `logger.warn` is intentionally one-line + structured so a sustained
 * failure shows up on `audit_write_failed` dashboards.
 */
export interface PushAuditRow {
  /** Source IP of the caller (already normalized via `getIp(req)`). */
  callerIp: string | null;
  /** Push recipient — matches `push_subscriptions.user_id` shape. */
  targetUserId: string;
  /** `module` field from request body (`finyk` / `nutrition` / …). */
  notificationType: string | null;
  /**
   * Payload object exactly as serialized into the web-push body.
   * The helper computes SHA-256 over the canonical JSON form and stores
   * the hex digest. We never persist the plaintext: payloads can carry
   * PII (Finyk transaction names, nutrition logs) and a hash is enough
   * for correlation queries.
   */
  payload: unknown;
  /** Number of `push_subscriptions` rows the handler fanned out to. */
  subsCount: number;
  /** Subset of `subsCount` that returned `outcome = "ok"`. */
  sentCount: number;
}

/**
 * Compute SHA-256 over the canonical JSON form of `payload`. Canonical
 * form = `JSON.stringify` with sorted top-level keys: the same payload
 * passed in two different key-orders must hash to the same value, so a
 * caller spamming `{title, body}` and `{body, title}` does not appear
 * as two distinct attacks in the audit trail.
 *
 * Does NOT recurse into nested objects: today the push payload schema
 * is flat (`{title, body, module, tag}`). If we later add nested
 * fields, this comment is the canary — bump to a deep-canonicalize.
 */
export function hashPushPayload(payload: unknown): string {
  if (payload === null || typeof payload !== "object") {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }
  const obj = payload as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const canonical: Record<string, unknown> = {};
  for (const k of sortedKeys) canonical[k] = obj[k];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

const INSERT_SQL = `
  INSERT INTO push_send_audit (
    caller_ip, target_user_id, notification_type, payload_hash,
    subs_count, sent_count
  )
  VALUES ($1::inet, $2, $3, $4, $5, $6)
`;

let tableMissingLogged = false;

interface PgError {
  code?: string;
  message?: string;
}

function asPgError(err: unknown): PgError {
  return err && typeof err === "object" ? (err as PgError) : {};
}

/**
 * Insert one audit row. Best-effort: never throws.
 *
 * `client` is optional — when supplied, the caller's existing
 * transaction/connection is reused (useful if a future caller wants to
 * batch the audit row with their own writes in a single tx). Without
 * one, we acquire a fresh connection from the pool and release it
 * back; the call is fire-and-forget from the handler's perspective.
 */
export async function logPushSend(
  row: PushAuditRow,
  client?: PoolClient,
): Promise<void> {
  const exec = client ?? pool;
  const payloadHash = hashPushPayload(row.payload);
  const params = [
    row.callerIp,
    row.targetUserId,
    row.notificationType,
    payloadHash,
    row.subsCount,
    row.sentCount,
  ];
  try {
    await exec.query(INSERT_SQL, params);
  } catch (err) {
    const code = asPgError(err).code;
    if (code === "42P01" && !tableMissingLogged) {
      tableMissingLogged = true;
      logger.warn({
        msg: "push_send_audit_table_missing",
        hint: "apply migration 041_push_send_audit.sql; audit writes will fail open",
      });
      return;
    }
    if (code !== "42P01") {
      logger.warn({
        msg: "push_send_audit_write_failed",
        code,
        targetUserId: row.targetUserId,
      });
    }
  }
}

/** Test-only reset for the once-per-process degraded-audit warn flag. */
export function __resetAuditWarnForTests(): void {
  tableMissingLogged = false;
}
