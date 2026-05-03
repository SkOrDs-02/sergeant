import type { Request, Response } from "express";
import { env } from "../../env/env.js";
import { query } from "../../db.js";
import { bankProxyFetch } from "../../lib/bankProxy.js";
import { logger } from "../../obs/logger.js";
import {
  MonoBackfillResponseSchema,
  MonoBackfillProgressSchema,
} from "../../http/schemas.js";
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

/**
 * In-memory per-user backfill state. Survives only within the lifetime of
 * one server process — that's intentional: the canonical "backfill complete"
 * marker lives in `mono_connection.last_backfill_at`. This map is purely a
 * UX hint so the client can render a progress bar while the job is running
 * without flooding the DB with status writes.
 *
 * `running === true` is the legacy "is in progress" signal preserved for
 * the existing 429 rate-limit guard.
 */
type BackfillStatus = "idle" | "running" | "completed" | "failed";
interface BackfillProgress {
  status: BackfillStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  accountsTotal: number;
  accountsProcessed: number;
  currentAccountId: string | null;
  transactionsProcessed: number;
  lastError: string | null;
}

const progressByUser = new Map<string, BackfillProgress>();

function emptyProgress(): BackfillProgress {
  return {
    status: "idle",
    startedAt: null,
    completedAt: null,
    accountsTotal: 0,
    accountsProcessed: 0,
    currentAccountId: null,
    transactionsProcessed: 0,
    lastError: null,
  };
}

/**
 * Test-only handle. Maintains the historical name `__getActiveBackfills` so
 * existing tests that read the in-flight set keep working — entries are
 * present iff `status === "running"`.
 */
export function __getActiveBackfills(): Map<string, boolean> {
  const view = new Map<string, boolean>();
  for (const [userId, p] of progressByUser) {
    if (p.status === "running") view.set(userId, true);
  }
  // Mutations on this view do not flow back into `progressByUser`. Tests
  // that previously called `.set(userId, true)` to simulate an in-flight
  // job should use `__setBackfillProgress` instead — but to keep older
  // tests green we proxy `set/clear` writes back into the real map.
  const realSet = view.set.bind(view);
  const realClear = view.clear.bind(view);
  view.set = (userId: string, value: boolean) => {
    if (value) {
      const existing = progressByUser.get(userId) ?? emptyProgress();
      progressByUser.set(userId, { ...existing, status: "running" });
    } else {
      progressByUser.delete(userId);
    }
    return realSet(userId, value);
  };
  view.clear = () => {
    progressByUser.clear();
    realClear();
  };
  return view;
}

/** Test-only — overwrite a user's progress snapshot. */
export function __setBackfillProgress(
  userId: string,
  patch: Partial<BackfillProgress>,
): void {
  const existing = progressByUser.get(userId) ?? emptyProgress();
  progressByUser.set(userId, { ...existing, ...patch });
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
      // Live counter: bump after every successful upsert so the UI bar
      // animates smoothly even within a single account's pages.
      const p = progressByUser.get(userId);
      if (p) p.transactionsProcessed += 1;
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

  if (progressByUser.get(userId)?.status === "running") {
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

  // Reset the per-user progress slot. Keeping a fresh object (not mutating
  // the previous one) means anyone holding a reference to the old snapshot
  // still sees the previous run's outcome, which simplifies tests.
  progressByUser.set(userId, {
    status: "running",
    startedAt: new Date(),
    completedAt: null,
    accountsTotal: accounts.length,
    accountsProcessed: 0,
    currentAccountId: null,
    transactionsProcessed: 0,
    lastError: null,
  });

  // Hard Rule #3: validate the synchronous "started" response shape against
  // the SSOT before emitting. The 31-day statement pull then continues in
  // the background — clients poll `/api/mono/backfill-progress` (or the
  // legacy `sync-state.lastBackfillAt`) for completion.
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
        const p = progressByUser.get(userId);
        if (p) p.currentAccountId = acc.mono_account_id;
        const count = await backfillAccount(token, userId, acc.mono_account_id);
        total += count;
        const p2 = progressByUser.get(userId);
        if (p2) p2.accountsProcessed += 1;
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

      const done = progressByUser.get(userId);
      if (done) {
        done.status = "completed";
        done.completedAt = new Date();
        done.currentAccountId = null;
      }
    } catch (err) {
      logger.error({ msg: "mono_backfill_failed", userId, err });
      const failed = progressByUser.get(userId);
      if (failed) {
        failed.status = "failed";
        failed.completedAt = new Date();
        failed.currentAccountId = null;
        failed.lastError =
          err instanceof Error ? err.message : "Unknown backfill error";
      }
    }
  })();
}

/**
 * GET /api/mono/backfill-progress — returns the current snapshot of the
 * per-user backfill job. Cheap to call (synchronous map lookup), so the UI
 * is free to poll while `status === "running"`.
 */
export async function backfillProgressHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as AuthedRequest).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const p = progressByUser.get(userId) ?? emptyProgress();

  res.json(
    MonoBackfillProgressSchema.parse({
      status: p.status,
      startedAt: p.startedAt ? p.startedAt.toISOString() : null,
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
      accountsTotal: Number(p.accountsTotal),
      accountsProcessed: Number(p.accountsProcessed),
      currentAccountId: p.currentAccountId,
      transactionsProcessed: Number(p.transactionsProcessed),
      lastError: p.lastError,
    }),
  );
}
