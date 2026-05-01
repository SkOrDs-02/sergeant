import type { Request, Response } from "express";
import type { QueryResult } from "pg";
import { z } from "zod";
import { pool, query } from "../../db.js";
import { logger } from "../../obs/logger.js";
import {
  monoWebhookReceivedTotal,
  monoWebhookDurationMs,
} from "../../obs/metrics.js";
import { sendToUserQuietly } from "../../push/send.js";
import type { PushPayload } from "../../push/types.js";
import { categorizeMcc } from "./mccCategories.js";
import { webhookSecretHash } from "./crypto.js";

/**
 * POST /api/mono/webhook/:secret — public Monobank delivery endpoint.
 *
 * Auth: path-based secret validated against `mono_connection.webhook_secret`
 * with timing-safe comparison. No session auth — Monobank calls this directly.
 *
 * Payload: `{ type: "StatementItem", data: { account, statementItem } }`.
 * Idempotent UPSERT by PK `(user_id, mono_tx_id)`.
 * Always returns 200 after successful write (Monobank retries on non-2xx).
 */

/**
 * Zod schema for the Monobank webhook payload.
 *
 * Mirrors the public `corporateWebHookData` shape from Monobank's OpenAPI
 * spec (https://api.monobank.ua/docs). String fields are bounded so a
 * malicious or buggy upstream cannot push arbitrarily-large blobs into our
 * INSERT — the global body limit is already 32KB (see `app.ts`), but a
 * second per-field belt is cheap insurance against a future limit bump.
 *
 * `Number.isFinite` guards on integer fields keep `NaN` / `Infinity` out of
 * the BIGINT columns (Postgres would coerce them to text and pgcrypto
 * helpers downstream would explode).
 */
const StatementItemSchema = z.object({
  id: z.string().min(1).max(64),
  time: z.number().int().nonnegative().finite(),
  description: z.string().max(500).optional().default(""),
  mcc: z.number().int().nonnegative().max(99_999).default(0),
  originalMcc: z.number().int().nonnegative().max(99_999).optional(),
  hold: z.boolean().optional(),
  amount: z.number().int().finite(),
  operationAmount: z.number().int().finite(),
  currencyCode: z.number().int().nonnegative().max(9_999),
  commissionRate: z.number().int().finite().optional(),
  cashbackAmount: z.number().int().finite().optional(),
  balance: z.number().int().finite().optional(),
  comment: z.string().max(500).optional(),
  receiptId: z.string().max(64).optional(),
  invoiceId: z.string().max(64).optional(),
  counterEdrpou: z.string().max(32).optional(),
  counterIban: z.string().max(64).optional(),
  counterName: z.string().max(200).optional(),
});

const WebhookPayloadSchema = z.object({
  type: z.literal("StatementItem"),
  data: z.object({
    account: z.string().min(1).max(64),
    statementItem: StatementItemSchema,
  }),
});

type StatementItem = z.infer<typeof StatementItemSchema>;

/**
 * Currency symbols for the most common ISO-4217 codes Monobank issues.
 * Falls back to an empty prefix for unknown codes — the user will still see
 * the signed amount, which is the high-signal part. Kept inline (rather than
 * pulled from `@sergeant/shared`) because the push-payload formatter is the
 * only consumer; widening the surface would tempt over-localization.
 */
const CURRENCY_SYMBOL_BY_CODE: Record<number, string> = {
  980: "₴",
  840: "$",
  978: "€",
  826: "£",
  985: "zł",
};

/**
 * Format a signed kopeck/cent amount into a localized money string with a
 * leading sign glyph. Negative spends use the minus-sign character `−`
 * (U+2212) so the push displays the same glyph as Monobank's own
 * notifications instead of the ASCII hyphen.
 */
function formatMonoMoney(amountMinor: number, currencyCode: number): string {
  const symbol = CURRENCY_SYMBOL_BY_CODE[currencyCode] ?? "";
  const major = amountMinor / 100;
  const sign = major < 0 ? "−" : "+";
  const abs = Math.abs(major).toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return symbol ? `${sign}${abs} ${symbol}` : `${sign}${abs}`;
}

/**
 * Build the push payload for a freshly-inserted Monobank statement item.
 * Mirrors Monobank's own native notification shape: the headline is the
 * signed amount, the body carries the merchant/description + remaining
 * balance. Only called on first INSERT — see `inserted` flag in
 * `webhookHandler`.
 */
function buildMonoPushPayload(
  item: StatementItem,
  monoAccountId: string,
): PushPayload {
  const amountStr = formatMonoMoney(item.amount, item.currencyCode);
  const description = (item.description || "Транзакція").trim().slice(0, 80);
  const balanceStr =
    typeof item.balance === "number"
      ? formatMonoMoney(item.balance, item.currencyCode).replace(/^[+−]/, "")
      : null;
  const holdMarker = item.hold ? "(резерв) " : "";
  const body = balanceStr
    ? `${holdMarker}${description} · доступно ${balanceStr}`
    : `${holdMarker}${description}`;
  return {
    title: amountStr,
    body,
    data: {
      kind: "mono_tx",
      monoTxId: item.id,
      monoAccountId,
    },
    url: "/?module=finyk",
  };
}

export async function webhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const start = process.hrtime.bigint();
  const secret = req.params.secret;

  if (!secret || typeof secret !== "string") {
    monoWebhookReceivedTotal.inc({ status: "invalid_secret" });
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Look up by SHA-256 of the path secret. Pre-hashing makes the WHERE
  // clause execute on a value the attacker has no preimage for, so the
  // B-tree probe time can no longer leak the original secret's prefix —
  // which the previous `WHERE webhook_secret = $1` design did despite the
  // app-side `timingSafeEqual` (the index walk happens BEFORE the row
  // reaches us). The unique index `mono_connection_webhook_secret_hash_idx`
  // makes this an O(log N) point lookup.
  const secretHash = webhookSecretHash(secret);
  const connResult = await query<{ user_id: string }>(
    "SELECT user_id FROM mono_connection WHERE webhook_secret_hash = $1 AND status = 'active'",
    [secretHash],
    { op: "mono_webhook_lookup" },
  );

  if (connResult.rows.length === 0) {
    monoWebhookReceivedTotal.inc({ status: "invalid_secret" });
    res.status(404).json({ error: "Not found" });
    return;
  }

  const userId = connResult.rows[0].user_id;

  // Zod validation replaces hand-rolled type checks. A bad payload (missing
  // required keys, wrong types, oversized strings, NaN/Infinity in numeric
  // fields) becomes a 400 here, BEFORE any DB write — the inline guard
  // accepted e.g. `mcc: "string"` or `amount: NaN` because TypeScript types
  // were trusted at runtime. We log a coarse error path (no payload echo,
  // since untrusted input must not land in our logs) and bump the
  // `bad_payload` metric so spikes are observable.
  const parsed = WebhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    monoWebhookReceivedTotal.inc({ status: "bad_payload" });
    logger.warn({
      msg: "mono_webhook_bad_payload",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    });
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const { account: monoAccountId, statementItem: item } = parsed.data.data;

  // RETURNING (xmax = 0) AS inserted is a Postgres trick: on a fresh INSERT
  // `xmax` is 0, on the UPDATE branch of ON CONFLICT it is the txid of the
  // updating transaction (non-zero). We use this to fire push notifications
  // only on first delivery and stay silent on retries — Monobank can re-send
  // the same statement item if our 200 response is lost. See AI-DANGER below.
  // Server-side MCC → category resolution. Returns NULL for MCC 0 / null /
  // unknown — caller stays NULL and the user can override via UI.
  // ON CONFLICT branch refreshes `category_slug` only when the user has not
  // manually overridden it (`category_overridden = FALSE`); otherwise
  // Monobank's refund-with-different-MCC events would silently undo a
  // user's correction.
  const categorySlug = categorizeMcc(item.mcc);

  const txUpsertSql = `INSERT INTO mono_transaction
       (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
        currency_code, mcc, original_mcc, hold, description, comment,
        cashback_amount, commission_rate, balance, receipt_id, invoice_id,
        counter_edrpou, counter_iban, counter_name, raw, source,
        category_slug)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, 'webhook',
             $22)
     ON CONFLICT (user_id, mono_tx_id) DO UPDATE SET
       amount = EXCLUDED.amount,
       operation_amount = EXCLUDED.operation_amount,
       hold = EXCLUDED.hold,
       balance = EXCLUDED.balance,
       description = EXCLUDED.description,
       comment = EXCLUDED.comment,
       raw = EXCLUDED.raw,
       category_slug = CASE
         WHEN mono_transaction.category_overridden THEN mono_transaction.category_slug
         ELSE EXCLUDED.category_slug
       END,
       received_at = NOW()
     RETURNING (xmax = 0) AS inserted`;
  const txUpsertParams = [
    userId,
    monoAccountId,
    item.id,
    new Date(item.time * 1000).toISOString(),
    item.amount,
    item.operationAmount,
    item.currencyCode,
    item.mcc ?? null,
    item.originalMcc ?? null,
    item.hold ?? null,
    item.description ?? null,
    item.comment ?? null,
    item.cashbackAmount ?? null,
    item.commissionRate ?? null,
    item.balance ?? null,
    item.receiptId ?? null,
    item.invoiceId ?? null,
    item.counterEdrpou ?? null,
    item.counterIban ?? null,
    item.counterName ?? null,
    JSON.stringify(item),
    categorySlug,
  ];

  // Усі мутації під одним `BEGIN…COMMIT` через виділеного клієнта. Раніше
  // це були 4–5 послідовних `pool.query` без транзакції — partial failure
  // (SIGTERM між upsert-ом і UPDATE balance, OOM під час enrichment-INSERT)
  // лишав баланс/`last_event_at`/outbox у неузгодженому стані. Idempotency
  // на `(user_id, mono_tx_id)` рятує retry, але не rollback. Pattern
  // дзеркалить `modules/sync/sync.ts::syncPushAll`. Метрики `ok`/`error`/
  // `account_autocreated` емітяться ЛИШЕ після успішного COMMIT.
  const client = await pool.connect();
  let inserted = false;
  let autocreated = false;
  try {
    await client.query("BEGIN");

    // SAVEPOINT навколо upsert-у: на 23503 (FK на `mono_account`) ми робимо
    // ROLLBACK TO SAVEPOINT і ретраїмо upsert після autocreate-у. Без
    // savepoint Postgres абортить усю транзакцію при першій помилці і
    // подальші client.query() кидають "current transaction is aborted".
    await client.query("SAVEPOINT mono_tx_upsert_attempt");
    let upsertResult: QueryResult<{ inserted: boolean }>;
    try {
      upsertResult = await client.query<{ inserted: boolean }>(
        txUpsertSql,
        txUpsertParams,
      );
      await client.query("RELEASE SAVEPOINT mono_tx_upsert_attempt");
    } catch (err) {
      // Postgres SQLSTATE 23503 = foreign_key_violation. На цьому FK тільки
      // один зовнішній ключ — `(user_id, mono_account_id)` → `mono_account`.
      // Падає, коли Monobank доставляє транзакцію по рахунку, який ми ще не
      // зареєстрували (юзер відкрив нову банку/картку/jar після останнього
      // `/api/mono/connect` snapshot-у `client-info`). Раніше це валило
      // вебхук у 500 і Monobank деактивував webhook через ~5 хв ретраїв.
      // Тепер створюємо stub-запис з полів самого StatementItem (currency
      // + balance) і ретраїмо upsert один раз. Решта полів (type, masked_pan,
      // iban, ...) лишаються NULL — наступний `/connect` reconcile або
      // окремий backfill підтягне їх з `client-info`.
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: unknown }).code
          : undefined;
      if (code !== "23503") throw err;
      await client.query("ROLLBACK TO SAVEPOINT mono_tx_upsert_attempt");
      logger.warn({
        msg: "mono_webhook_account_autocreate",
        userId,
        monoAccountId,
        currencyCode: item.currencyCode,
        monoTxId: item.id,
      });
      await client.query(
        `INSERT INTO mono_account
           (user_id, mono_account_id, currency_code, balance, last_seen_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, mono_account_id) DO NOTHING`,
        [userId, monoAccountId, item.currencyCode, item.balance ?? null],
      );
      upsertResult = await client.query<{ inserted: boolean }>(
        txUpsertSql,
        txUpsertParams,
      );
      autocreated = true;
    }

    if (item.balance != null) {
      await client.query(
        `UPDATE mono_account
         SET balance = $1, last_seen_at = NOW()
         WHERE user_id = $2 AND mono_account_id = $3`,
        [item.balance, userId, monoAccountId],
      );
    }

    await client.query(
      `UPDATE mono_connection
       SET last_event_at = NOW(), updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );

    inserted = upsertResult.rows[0]?.inserted === true;

    if (inserted) {
      await client.query(
        `INSERT INTO mono_ai_enrichment_queue (user_id, mono_tx_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, mono_tx_id) DO NOTHING`,
        [userId, item.id],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore secondary rollback failure — original error matters more */
    }
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    monoWebhookReceivedTotal.inc({ status: "error" });
    monoWebhookDurationMs.observe({ status: "error" }, ms);
    logger.error({ msg: "mono_webhook_error", err });
    throw err;
  } finally {
    client.release();
  }

  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  if (autocreated)
    monoWebhookReceivedTotal.inc({ status: "account_autocreated" });
  monoWebhookReceivedTotal.inc({ status: "ok" });
  monoWebhookDurationMs.observe({ status: "ok" }, ms);

  logger.info({
    msg: "mono_webhook_processed",
    monoAccountId,
    monoTxId: item.id,
    inserted,
  });

  res.status(200).json({ ok: true });

  // Fan-out push notification AFTER the 200 response — sendToUserQuietly
  // never throws (logs internally on failure), but we still defer until
  // after `res.json()` so a slow APNs/FCM round-trip can't extend the
  // webhook latency window. Skip on duplicate deliveries (`inserted` is
  // false on the UPDATE branch of ON CONFLICT) so Monobank's retries
  // don't spam the user.
  if (inserted) {
    void sendToUserQuietly(userId, buildMonoPushPayload(item, monoAccountId), {
      module: "mono",
    });
  }
}
