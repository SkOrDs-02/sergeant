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
  encryptTokenWithRing,
  tokenFingerprint,
  webhookSecretHash,
} from "./crypto.js";
import {
  monoKeyRing,
  decryptAndLazyReencrypt,
  type MonoTokenRow,
} from "./tokenStore.js";
import { scheduleHistoryBackfill } from "./historyFetch.js";
import { upsertJars, type MonoClientInfoJar } from "./jars.js";

/**
 * POST /api/mono/connect  — register Monobank webhook + persist connection.
 * POST /api/mono/disconnect — unregister webhook + wipe connection data.
 * GET  /api/mono/sync-state — lightweight connection status from DB.
 *
 * All three require an authenticated session (`req.user`).
 * Gated behind `MONO_WEBHOOK_ENABLED`.
 */

/** Timeout for outbound Monobank API calls (client-info, webhook register). */
export const MONO_API_TIMEOUT_MS = 15_000;

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
  jars?: MonoClientInfoJar[];
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

  const ring = monoKeyRing();
  if (!ring) {
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
      upstreamBody: body.slice(0, 200),
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
      upstreamBody: body.slice(0, 200),
    });
    res.status(502).json({
      error: "Failed to register webhook with Monobank",
      code: "MONO_UPSTREAM_ERROR",
    });
    return;
  }

  const encrypted = encryptTokenWithRing(token, ring);
  const fingerprint = tokenFingerprint(token);
  // Phase 2 DROP (migration 107) removed the plaintext `webhook_secret`
  // column entirely — only `webhook_secret_hash` (017) is persisted now.
  // Webhook lookup/verification resolves rows exclusively by hash; the
  // raw `webhookSecret` value only ever lives in the outbound webhook URL
  // we register with Monobank, never at rest in our DB.
  const webhookSecretHashHex = webhookSecretHash(webhookSecret);

  await query(
    `INSERT INTO mono_connection
       (user_id, token_ciphertext, token_iv, token_tag, token_key_version,
        token_fingerprint, webhook_secret_hash,
        webhook_registered_at, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'active', NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       token_ciphertext = EXCLUDED.token_ciphertext,
       token_iv = EXCLUDED.token_iv,
       token_tag = EXCLUDED.token_tag,
       token_key_version = EXCLUDED.token_key_version,
       token_fingerprint = EXCLUDED.token_fingerprint,
       webhook_secret_hash = EXCLUDED.webhook_secret_hash,
       webhook_registered_at = NOW(),
       status = 'active',
       updated_at = NOW()`,
    [
      userId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      encrypted.keyVersion,
      fingerprint,
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

  // Jars ("банки") come back on the same client-info call as accounts —
  // persist them now instead of dropping `clientInfo.jars` on the floor, so
  // goal-progress auto-sync (docs/90-work/planning/specs/goal-progress-auto.md)
  // has a linkable balance from the moment of connect.
  await upsertJars(userId, clientInfo.jars ?? []);

  logger.info({
    msg: "mono_connected",
    fingerprint,
    accountsCount: accounts.length,
  });

  // Fire-and-forget: fetch last 30 days of transactions for each account.
  // Runs after the response is sent so the connect call is never delayed.
  scheduleHistoryBackfill(
    userId,
    accounts.map((a) => a.id),
    ring,
  );

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

  const ring = monoKeyRing();

  const connResult = await query<MonoTokenRow>(
    "SELECT token_ciphertext, token_iv, token_tag, token_key_version FROM mono_connection WHERE user_id = $1",
    [userId],
    { op: "mono_connection_select" },
  );

  if (connResult.rows.length > 0 && ring) {
    try {
      const row = connResult.rows[0]!;
      const decryptedToken = await decryptAndLazyReencrypt(row, userId, ring);
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

/**
 * Скільки чекати на `client-info` під час перевірки живості токена.
 *
 * Навмисно НЕ `MONO_API_TIMEOUT_MS` (15 с): та стеля стоїть на явних
 * діях користувача — «підключити», «синхронізувати», — де почекати
 * прийнятно. Тут перевірка сидить усередині GET-а, який малює екран
 * Налаштувань, тож 15 с підвисання екрана заради службової перевірки —
 * гірше за невизначеність. Не встигли — вважаємо результат невідомим.
 */
const MONO_TOKEN_PROBE_TIMEOUT_MS = 4_000;

type TokenLiveness = "alive" | "revoked" | "unknown";

/**
 * Питає Monobank, чи токен ще живий.
 *
 * `revoked` повертається ЛИШЕ на явну відмову в авторизації (401/403).
 * Будь-що інше — таймаут, 429, 5xx, обрив мережі — це `unknown`, і
 * підключення лишається як було. Помилятись тут можна тільки в один бік:
 * назвати робоче підключення мертвим — значить своїми руками відрізати
 * людину від її банку через чужу тимчасову аварію.
 */
async function probeTokenLiveness(userId: string): Promise<TokenLiveness> {
  const ring = monoKeyRing();
  if (!ring) return "unknown";

  const tokenResult = await query<MonoTokenRow>(
    `SELECT token_ciphertext, token_iv, token_tag, token_key_version
       FROM mono_connection WHERE user_id = $1`,
    [userId],
    { op: "mono_token_probe_select" },
  );
  const row = tokenResult.rows[0];
  if (!row) return "unknown";

  const token = await decryptAndLazyReencrypt(row, userId, ring);

  const probeRes = await fetch("https://api.monobank.ua/personal/client-info", {
    headers: { "X-Token": token },
    signal: AbortSignal.timeout(MONO_TOKEN_PROBE_TIMEOUT_MS),
  });
  if (probeRes.ok) return "alive";
  if (probeRes.status === 401 || probeRes.status === 403) return "revoked";
  return "unknown";
}

/**
 * Позначає підключення як таке, що втратило звʼязок, і повертає новий
 * статус для відповіді (або `null`, якщо статус не змінився).
 *
 * Відмітка `last_token_check_at` ставиться на БУДЬ-ЯКОМУ результаті,
 * включно з `unknown`. Це свідомий вибір: якщо не стямпити невдалу
 * спробу, то під час аварії на боці Monobank КОЖЕН запит `sync-state`
 * платив би повний таймаут перевірки — тобто зовнішній збій перетворював
 * би екран Налаштувань на повільний. Ціна вибору: відкликаний токен
 * помічається на один цикл (6 год) пізніше, якщо не пощастило збігтися з
 * аварією. Повільний екран у всіх гірший за пізніше попередження в одного.
 */
async function recordTokenCheck(
  userId: string,
  liveness: TokenLiveness,
): Promise<"invalid" | null> {
  if (liveness === "revoked") {
    await query(
      `UPDATE mono_connection
          SET status = 'invalid', last_token_check_at = NOW(), updated_at = NOW()
        WHERE user_id = $1`,
      [userId],
      { op: "mono_token_probe_revoked" },
    );
    logger.info({ msg: "mono_token_revoked_detected" });
    return "invalid";
  }
  await query(
    "UPDATE mono_connection SET last_token_check_at = NOW() WHERE user_id = $1",
    [userId],
    { op: "mono_token_probe_stamp" },
  );
  return null;
}

export async function syncStateHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertWebhookEnabled(res)) return;
  const userId = getUserId(req as AuthedRequest, res);
  if (!userId) return;

  // `token_check_due` рахується в SQL, а не в Node, з двох причин: це той
  // самий годинник, що й у колонок (сервер і база можуть розʼїхатись), і
  // всі чотири пороги видно в одному місці замість розкиданих констант.
  //
  //   status = 'active'          — `invalid`/`disconnected` перевіряти нема сенсу;
  //   webhook_registered_at      — щойно підключені (<30 хв) не чіпаємо:
  //                                `connect` сам щойно ходив у client-info,
  //                                а повторний виклик впіймав би ліміт 1/60 с;
  //   last_event_at              — підключення з подіями за останні 3 доби
  //                                живе очевидно, зовнішній виклик зайвий.
  //                                Саме цей предикат тримає перевірку рідкісною:
  //                                звичайний активний юзер під неї не потрапляє
  //                                НІКОЛИ, тож затримку платять лише підозрілі;
  //   last_token_check_at        — вікно троттлінга (міграція 120).
  const connResult = await query<{
    status: string;
    webhook_registered_at: Date | string | null;
    last_event_at: Date | string | null;
    last_backfill_at: Date | string | null;
    token_check_due?: boolean | null;
  }>(
    `SELECT status, webhook_registered_at, last_event_at, last_backfill_at,
            (status = 'active'
              AND webhook_registered_at IS NOT NULL
              AND webhook_registered_at < NOW() - INTERVAL '30 minutes'
              AND (last_event_at IS NULL
                   OR last_event_at < NOW() - INTERVAL '3 days')
              AND (last_token_check_at IS NULL
                   OR last_token_check_at < NOW() - INTERVAL '6 hours')
            ) AS token_check_due
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

  // Перевірка живості токена. Обгорнута цілком: цей ендпоінт малює екран
  // Налаштувань, і жоден збій СЛУЖБОВОЇ перевірки не має права перетворити
  // робочу відповідь на 500. Не вдалося перевірити — віддаємо стан із бази,
  // рівно як до міграції 120.
  let probedStatus: "invalid" | null = null;
  if (conn!.token_check_due === true) {
    try {
      probedStatus = await recordTokenCheck(
        userId,
        await probeTokenLiveness(userId),
      );
    } catch (err) {
      logger.warn({
        msg: "mono_token_probe_failed",
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // `is_jar = FALSE` (міграція 119) тримає цей лічильник у згоді з тим,
  // що реально віддає `/api/mono/accounts`. Інакше «підключено N
  // рахунків» рахувало б і заглушки під банки, яких у списку немає.
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM mono_account
      WHERE user_id = $1 AND is_jar = FALSE`,
    [userId],
    { op: "mono_accounts_count" },
  );

  const status = probedStatus ?? conn!.status;

  res.status(200).json(
    MonoSyncStateSchema.parse({
      status,
      webhookActive: status === "active" && conn!.webhook_registered_at != null,
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
