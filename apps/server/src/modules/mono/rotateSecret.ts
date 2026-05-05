import crypto from "node:crypto";
import { Sentry } from "../../sentry.js";
import { logger } from "../../obs/logger.js";
import { decryptToken, tokenFingerprint, webhookSecretHash } from "./crypto.js";

/**
 * Periodic Monobank webhook-secret rotation.
 *
 * Monobank's `/personal/webhook` registration has no expiry on their side
 * — the secret in the URL we register stays valid until we replace it.
 * That makes a silent leak (proxy access-log, screenshot, packet capture)
 * a forge-anyone's-statements primitive forever, so we age the secret out
 * on a fixed schedule. Migration 033 added `webhook_secret_rotated_at` to
 * `mono_connection`; this module owns the actual rotation flow.
 *
 * One rotation = (1) decrypt the user's persisted Monobank token, (2)
 * generate a fresh 32-byte secret, (3) re-register the webhook URL with
 * Monobank using the user's token, (4) UPDATE the row to point lookups at
 * the new secret. We swap DB state ONLY after Monobank ACKs the new URL —
 * if step (3) fails we keep the old secret active so incoming webhooks
 * still match, and Monobank keeps delivering to the previous URL until
 * the next rotation tick.
 *
 * The batch entrypoint is callable from a scheduled cron (Railway/n8n) via
 * `POST /api/internal/mono/webhook/rotate`. Stale-but-not-rotated
 * connections (older than `alertAfterDays`) are reported to Sentry as a
 * `warning`-level message — that is the page-the-team signal: we have
 * connections accruing risk that the worker couldn't refresh.
 */

const MONO_API_TIMEOUT_MS = 15_000;
const MONO_WEBHOOK_URL = "https://api.monobank.ua/personal/webhook";

export interface RotateOneInput {
  userId: string;
  encKey: string;
  publicApiBaseUrl: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch | undefined;
  /** Injectable for tests; defaults to `db.ts::query`. */
  query: <R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
    meta?: { op?: string },
  ) => Promise<{ rows: R[]; rowCount?: number | null }>;
}

export interface RotateOneResult {
  userId: string;
  rotated: boolean;
  reason?:
    | "not_found"
    | "decrypt_failed"
    | "monobank_register_failed"
    | "monobank_register_timeout"
    | undefined;
  monobankStatus?: number | undefined;
}

/**
 * Rotate one connection's webhook secret. Returns a structured outcome
 * (no throws on the expected operational failures — the batch caller logs
 * + counts them and continues with the rest).
 */
export async function rotateMonoWebhookSecret(
  input: RotateOneInput,
): Promise<RotateOneResult> {
  const { userId, encKey, publicApiBaseUrl, query } = input;
  const fetchImpl = input.fetchImpl ?? fetch;

  const sel = await query<{
    token_ciphertext: Buffer;
    token_iv: Buffer;
    token_tag: Buffer;
  }>(
    `SELECT token_ciphertext, token_iv, token_tag
       FROM mono_connection
      WHERE user_id = $1 AND status = 'active'`,
    [userId],
    { op: "mono_rotate_select" },
  );

  if (sel.rows.length === 0) {
    return { userId, rotated: false, reason: "not_found" };
  }

  const row = sel.rows[0];
  let plaintextToken: string;
  try {
    plaintextToken = decryptToken(
      {
        ciphertext: row!.token_ciphertext,
        iv: row!.token_iv,
        tag: row!.token_tag,
      },
      encKey,
    );
  } catch (err) {
    // Decryption failure means the row's `token_ciphertext`/`tag` no longer
    // matches the configured `MONO_TOKEN_ENC_KEY` — most likely an env
    // misconfiguration after a key rotation. We can't talk to Monobank
    // without the user's token, so we skip and let the operator notice via
    // the per-row Sentry warning rather than locking the whole batch.
    logger.warn({
      msg: "mono_rotate_decrypt_failed",
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { userId, rotated: false, reason: "decrypt_failed" };
  }

  const newSecret = crypto.randomBytes(32).toString("hex");
  const newSecretHash = webhookSecretHash(newSecret);
  const newWebhookUrl = `${publicApiBaseUrl}/api/mono/webhook/${newSecret}`;
  const fingerprint = tokenFingerprint(plaintextToken);

  let registerRes: Response;
  try {
    registerRes = await fetchImpl(MONO_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "X-Token": plaintextToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ webHookUrl: newWebhookUrl }),
      signal: AbortSignal.timeout(MONO_API_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({
      msg: "mono_rotate_register_timeout",
      userId,
      fingerprint,
      err: err instanceof Error ? err.message : String(err),
    });
    return { userId, rotated: false, reason: "monobank_register_timeout" };
  }

  if (!registerRes.ok) {
    // Read the body so we don't leak descriptors, but only log it (mostly
    // upstream error pages — never echo to the API client).
    const body = await registerRes.text().catch(() => "");
    logger.warn({
      msg: "mono_rotate_register_failed",
      userId,
      fingerprint,
      status: registerRes.status,
      upstreamBody: body.slice(0, 200),
    });
    return {
      userId,
      rotated: false,
      reason: "monobank_register_failed",
      monobankStatus: registerRes.status,
    };
  }

  // Single UPDATE switches both the lookup key (hash) and the cleartext
  // `webhook_secret` together so a delivery that arrives mid-rotation
  // either still resolves under the OLD hash (if it landed before this
  // statement) or under the NEW hash (after). It cannot fall between two
  // chairs — Postgres UPDATE is atomic on a single row.
  await query(
    `UPDATE mono_connection
        SET webhook_secret = $2,
            webhook_secret_hash = $3,
            webhook_secret_rotated_at = NOW(),
            webhook_registered_at = NOW(),
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId, newSecret, newSecretHash],
    { op: "mono_rotate_update" },
  );

  logger.info({
    msg: "mono_rotate_succeeded",
    userId,
    fingerprint,
  });
  return { userId, rotated: true };
}

export interface RotateBatchInput {
  encKey: string;
  publicApiBaseUrl: string;
  /** Rotate connections older than this many days. Default 90. */
  olderThanDays?: number | undefined;
  /**
   * Connections older than this many days that we still couldn't rotate
   * trigger a Sentry `warning`. Default 100 — gives a 10-day on-call window
   * before the secret is actually overdue.
   */
  alertAfterDays?: number | undefined;
  /** Cap on how many connections to rotate per tick. Default 50. */
  limit?: number | undefined;
  /** Skip the actual UPDATE / Monobank call. Default false. */
  dryRun?: boolean | undefined;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch | undefined;
  query: RotateOneInput["query"];
}

export interface RotateBatchResult {
  candidates: number;
  rotated: number;
  failed: number;
  /** Connections older than `alertAfterDays` that we couldn't rotate. */
  stale: number;
  results: RotateOneResult[];
  dryRun: boolean;
}

/**
 * Find connections whose secret is older than `olderThanDays` and rotate
 * each. Failures are collected, not thrown — one bad token shouldn't stop
 * the rest. The function returns a summary the operator can log/alert on.
 */
export async function rotateStaleMonoWebhookSecrets(
  input: RotateBatchInput,
): Promise<RotateBatchResult> {
  const olderThanDays = input.olderThanDays ?? 90;
  const alertAfterDays = input.alertAfterDays ?? 100;
  const limit = input.limit ?? 50;
  const dryRun = input.dryRun ?? false;

  if (olderThanDays <= 0) {
    throw new Error("olderThanDays must be positive");
  }
  if (alertAfterDays < olderThanDays) {
    throw new Error("alertAfterDays must be >= olderThanDays");
  }
  if (limit <= 0) {
    throw new Error("limit must be positive");
  }

  const sel = await input.query<{ user_id: string }>(
    `SELECT user_id FROM mono_connection
       WHERE status = 'active'
         AND webhook_secret_rotated_at < NOW() - ($1::int * INTERVAL '1 day')
       ORDER BY webhook_secret_rotated_at ASC
       LIMIT $2`,
    [olderThanDays, limit],
    { op: "mono_rotate_candidates" },
  );

  const candidates = sel.rows.length;
  const results: RotateOneResult[] = [];
  let rotated = 0;
  let failed = 0;

  for (const r of sel.rows) {
    if (dryRun) {
      results.push({ userId: r.user_id, rotated: false, reason: "not_found" });
      continue;
    }
    let outcome: RotateOneResult;
    try {
      outcome = await rotateMonoWebhookSecret({
        userId: r.user_id,
        encKey: input.encKey,
        publicApiBaseUrl: input.publicApiBaseUrl,
        fetchImpl: input.fetchImpl,
        query: input.query,
      });
    } catch (err) {
      // Programmer error or unexpected DB failure — capture it but keep
      // going so one wedged connection doesn't deadline-out the batch.
      Sentry.captureException(err);
      logger.error({
        msg: "mono_rotate_unexpected_error",
        userId: r.user_id,
        err: err instanceof Error ? err.message : String(err),
      });
      outcome = {
        userId: r.user_id,
        rotated: false,
        reason: "monobank_register_failed",
      };
    }
    results.push(outcome);
    if (outcome.rotated) rotated += 1;
    else failed += 1;
  }

  // Connections older than `alertAfterDays` that we still couldn't rotate
  // are the page-the-team signal: someone's secret is overdue. Run this
  // check independently of the rotation loop so an empty batch (e.g. all
  // candidates already failed earlier) still surfaces stale connections.
  const staleResult = await input.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM mono_connection
      WHERE status = 'active'
        AND webhook_secret_rotated_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [alertAfterDays],
    { op: "mono_rotate_stale_count" },
  );
  const stale = Number(staleResult.rows[0]?.count ?? 0);

  if (stale > 0) {
    Sentry.captureMessage(
      `Mono webhook secrets overdue for rotation (>${alertAfterDays} days): ${stale}`,
      {
        level: "warning",
        tags: { module: "mono", op: "rotate_secret" },
        extra: {
          stale,
          alertAfterDays,
          olderThanDays,
          candidates,
          rotated,
          failed,
        },
      },
    );
    logger.warn({
      msg: "mono_rotate_stale_alert",
      stale,
      alertAfterDays,
    });
  }

  logger.info({
    msg: "mono_rotate_batch_complete",
    candidates,
    rotated,
    failed,
    stale,
    dryRun,
  });

  return { candidates, rotated, failed, stale, results, dryRun };
}
