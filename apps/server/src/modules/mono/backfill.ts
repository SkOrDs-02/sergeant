import type { Request, Response } from "express";
import { env } from "../../env/env.js";
import { query } from "../../db.js";
import { bankProxyFetch } from "../../lib/bankProxy.js";
import { logger } from "../../obs/logger.js";
import { MonoBackfillResponseSchema } from "../../http/schemas.js";
import { decryptToken } from "./crypto.js";

interface AuthedRequest extends Request {
  user?: { id: string };
}

const BACKFILL_DAYS = 31;
const PACING_MS = 60_000;
const MAX_PAGES = 20;
const PAGE_SIZE = 500;

type Sleeper = (ms: number) => Promise<void>;
const defaultSleep: Sleeper = (ms) => new Promise((r) => setTimeout(r, ms));
let _sleep: Sleeper = defaultSleep;

export function __setBackfillSleep(fn: Sleeper | null): void {
  _sleep = fn ?? defaultSleep;
}

const activeBackfills = new Map<string, boolean>();

export function __getActiveBackfills(): Map<string, boolean> {
  return activeBackfills;
}

interface MonoStatementRaw {
  id: string;
  time: number;
  amount: number;
  operationAmount: number;
  currencyCode: number;
  mcc?: number;
  originalMcc?: number;
  hold?: boolean;
  description?: string;
  comment?: string;
  cashbackAmount?: number;
  commissionRate?: number;
  balance?: number;
  receiptId?: string;
  invoiceId?: string;
  counterEdrpou?: string;
  counterIban?: string;
  counterName?: string;
  [key: string]: unknown;
}

async function getDecryptedToken(userId: string): Promise<string | null> {
  const { rows } = await query<{
    token_ciphertext: Buffer;
    token_iv: Buffer;
    token_tag: Buffer;
  }>(
    `SELECT token_ciphertext, token_iv, token_tag FROM mono_connection WHERE user_id = $1`,
    [userId],
    { op: "mono_backfill_token" },
  );
  if (rows.length === 0) return null;

  const encKey = env.MONO_TOKEN_ENC_KEY;
  if (!encKey) {
    logger.error({ msg: "MONO_TOKEN_ENC_KEY not configured" });
    return null;
  }

  try {
    const row = rows[0];
    return decryptToken(
      {
        ciphertext: row.token_ciphertext,
        iv: row.token_iv,
        tag: row.token_tag,
      },
      encKey,
    );
  } catch (err) {
    logger.error({ msg: "mono_token_decrypt_failed", err });
    return null;
  }
}

async function fetchStatementPage(
  token: string,
  accountId: string,
  from: number,
  to: number,
): Promise<MonoStatementRaw[]> {
  const path = `/personal/statement/${accountId}/${from}/${to}`;
  const result = await bankProxyFetch({
    upstream: "monobank",
    baseUrl: "https://api.monobank.ua",
    path,
    headers: { "X-Token": token },
    cacheKeySecret: token,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(
      `Monobank API error: ${result.status} ${typeof result.body === "string" ? result.body.slice(0, 200) : ""}`,
    );
  }

  const data: unknown =
    typeof result.body === "string" ? JSON.parse(result.body) : result.body;
  if (!Array.isArray(data)) return [];
  return data as MonoStatementRaw[];
}

async function upsertTransaction(
  userId: string,
  accountId: string,
  tx: MonoStatementRaw,
): Promise<void> {
  await query(
    `INSERT INTO mono_transaction (
       user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
       currency_code, mcc, original_mcc, hold, description, comment,
       cashback_amount, commission_rate, balance, receipt_id, invoice_id,
       counter_edrpou, counter_iban, counter_name, raw, source, received_at
     ) VALUES (
       $1, $2, $3, to_timestamp($4), $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17,
       $18, $19, $20, $21, 'backfill', NOW()
     )
     ON CONFLICT (user_id, mono_tx_id)
     DO UPDATE SET
       amount = EXCLUDED.amount,
       operation_amount = EXCLUDED.operation_amount,
       hold = EXCLUDED.hold,
       balance = EXCLUDED.balance,
       received_at = CASE
         WHEN mono_transaction.source = 'backfill' THEN EXCLUDED.received_at
         ELSE mono_transaction.received_at
       END`,
    [
      userId,
      accountId,
      tx.id,
      tx.time,
      tx.amount,
      tx.operationAmount,
      tx.currencyCode,
      tx.mcc ?? null,
      tx.originalMcc ?? null,
      tx.hold ?? null,
      tx.description ?? null,
      tx.comment ?? null,
      tx.cashbackAmount ?? null,
      tx.commissionRate ?? null,
      tx.balance ?? null,
      tx.receiptId ?? null,
      tx.invoiceId ?? null,
      tx.counterEdrpou ?? null,
      tx.counterIban ?? null,
      tx.counterName ?? null,
      JSON.stringify(tx),
    ],
    { op: "mono_tx_upsert" },
  );
}

async function backfillAccount(
  token: string,
  userId: string,
  accountId: string,
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - BACKFILL_DAYS * 24 * 60 * 60;
  let pageTo = now;
  let totalInserted = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) {
      await _sleep(PACING_MS);
    }

    const rows = await fetchStatementPage(token, accountId, from, pageTo);
    if (rows.length === 0) break;

    for (const tx of rows) {
      await upsertTransaction(userId, accountId, tx);
      totalInserted++;
    }

    if (rows.length < PAGE_SIZE) break;

    let oldest = Number.POSITIVE_INFINITY;
    for (const r of rows) {
      if (typeof r.time === "number" && r.time < oldest) oldest = r.time;
    }
    if (!Number.isFinite(oldest)) break;
    const nextTo = oldest - 1;
    if (nextTo <= from) break;
    pageTo = nextTo;
  }

  return totalInserted;
}

/**
 * POST /api/mono/backfill — triggers re-backfill of last 31 days for all
 * stored accounts. Rate-limited: one concurrent backfill per user (in-memory guard).
 */
export async function backfillHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (activeBackfills.get(userId)) {
    res.status(429).json({ error: "Backfill already in progress" });
    return;
  }

  const token = await getDecryptedToken(userId);
  if (!token) {
    res
      .status(400)
      .json({ error: "No Monobank connection or decryption failed" });
    return;
  }

  const { rows: accounts } = await query<{ mono_account_id: string }>(
    `SELECT mono_account_id FROM mono_account WHERE user_id = $1`,
    [userId],
    { op: "mono_backfill_accounts" },
  );

  if (accounts.length === 0) {
    res.status(400).json({ error: "No accounts to backfill" });
    return;
  }

  activeBackfills.set(userId, true);

  // Hard Rule #3: validate the synchronous "started" response shape against
  // the SSOT before emitting. The 31-day statement pull then continues in
  // the background — clients poll `sync-state.lastBackfillAt` for completion.
  res.json(
    MonoBackfillResponseSchema.parse({
      status: "started",
      accountsCount: accounts.length,
    }),
  );

  (async () => {
    try {
      let total = 0;
      for (const acc of accounts) {
        if (accounts.indexOf(acc) > 0) {
          await _sleep(PACING_MS);
        }
        const count = await backfillAccount(token, userId, acc.mono_account_id);
        total += count;
      }

      await query(
        `UPDATE mono_connection SET last_backfill_at = NOW() WHERE user_id = $1`,
        [userId],
        { op: "mono_backfill_update" },
      );

      logger.info({
        msg: "mono_backfill_complete",
        userId,
        accounts: accounts.length,
        transactions: total,
      });
    } catch (err) {
      logger.error({ msg: "mono_backfill_failed", userId, err });
    } finally {
      activeBackfills.delete(userId);
    }
  })();
}
