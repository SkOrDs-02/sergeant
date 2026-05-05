import type { Request, Response } from "express";
import crypto from "node:crypto";
import { env } from "../../env/env.js";
import { query } from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  MonoConnectResponseSchema,
  MonoDisconnectResponseSchema,
  MonoSyncStateSchema,
} from "../../http/schemas.js";
import {
  encryptToken,
  decryptToken,
  tokenFingerprint,
  webhookSecretHash,
} from "./crypto.js";
import type { EncryptedToken } from "./crypto.js";

/**
 * POST /api/mono/connect  — register Monobank webhook + persist connection.
 * POST /api/mono/disconnect — unregister webhook + wipe connection data.
 * GET  /api/mono/sync-state — lightweight connection status from DB.
 *
 * All three require an authenticated session (`req.user`).
 * Gated behind `MONO_WEBHOOK_ENABLED`.
 */

/** Timeout for outbound Monobank API calls (client-info, webhook register). */
const MONO_API_TIMEOUT_MS = 15_000;

interface AuthedRequest extends Request {
  user?: { id: string };
}

function assertWebhookEnabled(res: Response): boolean {
  if (!env.MONO_WEBHOOK_ENABLED) {
    res.status(404).json({ error: "Monobank webhook integration is disabled" });
    return false;
  }
  return true;
}

function getUserId(req: AuthedRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Потрібна автентифікація" });
    return null;
  }
  return userId;
}

interface MonoClientInfoAccount {
  id: string;
  sendId?: string;
  type?: string;
  currencyCode?: number;
  cashbackType?: string;
  maskedPan?: string[];
  iban?: string;
  balance?: number;
  creditLimit?: number;
}

interface MonoClientInfoResponse {
  accounts?: MonoClientInfoAccount[];
  [key: string]: unknown;
}

export async function connectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertWebhookEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string" || token.length < 10) {
    res.status(400).json({ error: "Invalid or missing token" });
    return;
  }

  const encKey = env.MONO_TOKEN_ENC_KEY;
  if (!encKey) {
    res
      .status(500)
      .json({ error: "Server misconfigured: missing encryption key" });
    return;
  }

  let clientInfoRes: globalThis.Response;
  try {
    clientInfoRes = await fetch(
      "https://api.monobank.ua/personal/client-info",
      {
        headers: { "X-Token": token },
        signal: AbortSignal.timeout(MONO_API_TIMEOUT_MS),
      },
    );
  } catch (err) {
    logger.warn({
      msg: "mono_connect_client_info_timeout",
      fingerprint: tokenFingerprint(token),
      err: err instanceof Error ? err.message : String(err),
    });
    res
      .status(504)
      .json({ error: "Monobank API не відповідає. Спробуйте пізніше." });
    return;
  }
  if (!clientInfoRes.ok) {
    // Upstream body може містити внутрішні деталі Monobank (стек/чужі
    // header-и в HTML, ID запиту тощо) — фронту воно ні до чого і часто
    // мінливе, тож логуємо в server-only warn і повертаємо лише наш
    // нормалізований error/code.
    const body = await clientInfoRes.text();
    logger.warn({
      msg: "mono_connect_client_info_failed",
      status: clientInfoRes.status,
      fingerprint: tokenFingerprint(token),
      upstreamBody: body,
    });
    res.status(clientInfoRes.status === 401 ? 401 : 502).json({
      error:
        clientInfoRes.status === 401
          ? "Invalid Monobank token"
          : "Failed to reach Monobank API",
      code:
        clientInfoRes.status === 401
          ? "MONO_TOKEN_INVALID"
          : "MONO_UPSTREAM_ERROR",
    });
    return;
  }

  const clientInfo: MonoClientInfoResponse =
    (await clientInfoRes.json()) as MonoClientInfoResponse;
  const accounts = clientInfo.accounts ?? [];

  const webhookSecret = crypto.randomBytes(32).toString("hex");
  const webhookUrl = `${env.PUBLIC_API_BASE_URL}/api/mono/webhook/${webhookSecret}`;

  let registerRes: globalThis.Response;
  try {
    registerRes = await fetch("https://api.monobank.ua/personal/webhook", {
      method: "POST",
      headers: {
        "X-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ webHookUrl: webhookUrl }),
      signal: AbortSignal.timeout(MONO_API_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({
      msg: "mono_webhook_register_timeout",
      fingerprint: tokenFingerprint(token),
      err: err instanceof Error ? err.message : String(err),
    });
    res
      .status(504)
      .json({ error: "Monobank API не відповідає. Спробуйте пізніше." });
    return;
  }

  if (!registerRes.ok) {
    const body = await registerRes.text();
    logger.warn({
      msg: "mono_webhook_register_failed",
      status: registerRes.status,
      fingerprint: tokenFingerprint(token),
      upstreamBody: body,
    });
    res.status(502).json({
      error: "Failed to register webhook with Monobank",
      code: "MONO_UPSTREAM_ERROR",
    });
    return;
  }

  const encrypted: EncryptedToken = encryptToken(token, encKey);
  const fingerprint = tokenFingerprint(token);
  // Plaintext secret stays in `webhook_secret` only for one release cycle
  // (rollback safety) — see migration 017's header. The new lookup path
  // resolves rows by `webhook_secret_hash`, so even if the plaintext
  // column is dropped tomorrow this insert keeps working.
  const webhookSecretHashHex = webhookSecretHash(webhookSecret);

  await query(
    `INSERT INTO mono_connection
       (user_id, token_ciphertext, token_iv, token_tag, token_fingerprint,
        webhook_secret, webhook_secret_hash, webhook_registered_at,
        status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'active', NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       token_ciphertext = EXCLUDED.token_ciphertext,
       token_iv = EXCLUDED.token_iv,
       token_tag = EXCLUDED.token_tag,
       token_fingerprint = EXCLUDED.token_fingerprint,
       webhook_secret = EXCLUDED.webhook_secret,
       webhook_secret_hash = EXCLUDED.webhook_secret_hash,
       webhook_registered_at = NOW(),
       status = 'active',
       updated_at = NOW()`,
    [
      userId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      fingerprint,
      webhookSecret,
      webhookSecretHashHex,
    ],
    { op: "mono_connection_upsert" },
  );

  for (const acc of accounts) {
    await query(
      `INSERT INTO mono_account
         (user_id, mono_account_id, send_id, type, currency_code, cashback_type,
          masked_pan, iban, balance, credit_limit, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (user_id, mono_account_id) DO UPDATE SET
         send_id = EXCLUDED.send_id,
         type = EXCLUDED.type,
         currency_code = EXCLUDED.currency_code,
         cashback_type = EXCLUDED.cashback_type,
         masked_pan = EXCLUDED.masked_pan,
         iban = EXCLUDED.iban,
         balance = EXCLUDED.balance,
         credit_limit = EXCLUDED.credit_limit,
         last_seen_at = NOW()`,
      [
        userId,
        acc.id,
        acc.sendId ?? null,
        acc.type ?? null,
        acc.currencyCode ?? 0,
        acc.cashbackType ?? null,
        acc.maskedPan ?? [],
        acc.iban ?? null,
        acc.balance ?? null,
        acc.creditLimit ?? null,
      ],
      { op: "mono_account_upsert" },
    );
  }

  logger.info({
    msg: "mono_connected",
    fingerprint,
    accountsCount: accounts.length,
  });

  // Validate response against the SSOT (Hard Rule #3) so any drift between
  // server emit and `MonoConnectResponse` z.infer in the api-client throws
  // here instead of silently shipping a typed lie.
  res.status(200).json(
    MonoConnectResponseSchema.parse({
      status: "active",
      accountsCount: accounts.length,
    }),
  );
}

export async function disconnectHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertWebhookEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const encKey = env.MONO_TOKEN_ENC_KEY;

  const connResult = await query<{
    token_ciphertext: Buffer;
    token_iv: Buffer;
    token_tag: Buffer;
  }>(
    "SELECT token_ciphertext, token_iv, token_tag FROM mono_connection WHERE user_id = $1",
    [userId],
    { op: "mono_connection_select" },
  );

  if (connResult.rows.length > 0 && encKey) {
    try {
      const row = connResult.rows[0];
      const decryptedToken = decryptToken(
        {
          ciphertext: row!.token_ciphertext,
          iv: row!.token_iv,
          tag: row!.token_tag,
        },
        encKey,
      );
      await fetch("https://api.monobank.ua/personal/webhook", {
        method: "POST",
        headers: {
          "X-Token": decryptedToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ webHookUrl: "" }),
        signal: AbortSignal.timeout(MONO_API_TIMEOUT_MS),
      });
    } catch (err) {
      logger.warn({ msg: "mono_webhook_unregister_failed", err });
    }
  }

  await query("DELETE FROM mono_connection WHERE user_id = $1", [userId], {
    op: "mono_connection_delete",
  });

  logger.info({ msg: "mono_disconnected" });
  res.status(200).json(MonoDisconnectResponseSchema.parse({ ok: true }));
}

export async function syncStateHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertWebhookEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  const connResult = await query<{
    status: string;
    webhook_registered_at: Date | string | null;
    last_event_at: Date | string | null;
    last_backfill_at: Date | string | null;
  }>(
    `SELECT status, webhook_registered_at, last_event_at, last_backfill_at
     FROM mono_connection WHERE user_id = $1`,
    [userId],
    { op: "mono_sync_state" },
  );

  if (connResult.rows.length === 0) {
    res.status(200).json(
      MonoSyncStateSchema.parse({
        status: "disconnected",
        webhookActive: false,
        lastEventAt: null,
        lastBackfillAt: null,
        accountsCount: 0,
      }),
    );
    return;
  }

  const conn = connResult.rows[0];

  const countResult = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM mono_account WHERE user_id = $1",
    [userId],
    { op: "mono_accounts_count" },
  );

  res.status(200).json(
    MonoSyncStateSchema.parse({
      status: conn!.status,
      webhookActive:
        conn!.status === "active" && conn!.webhook_registered_at != null,
      lastEventAt:
        conn!.last_event_at instanceof Date
          ? conn!.last_event_at.toISOString()
          : conn!.last_event_at,
      lastBackfillAt:
        conn!.last_backfill_at instanceof Date
          ? conn!.last_backfill_at.toISOString()
          : conn!.last_backfill_at,
      accountsCount: Number(countResult.rows[0]?.count ?? 0),
    }),
  );
}
