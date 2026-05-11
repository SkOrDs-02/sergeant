/**
 * Monobank statement backfill — fetches the last 30 days of transactions for
 * all accounts immediately after a user connects their token.
 *
 * Called fire-and-forget from `connectHandler` so it never delays the HTTP
 * response. Errors are logged but not re-thrown — a failed backfill is
 * non-fatal; future webhooks will fill the gap going forward.
 *
 * Rate limit: Monobank allows 1 statement request per 60 s per token.
 * With multiple accounts we sleep 62 s between each to stay within the limit.
 */

import { z } from "zod";
import { pool } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { enqueueMemoryIngest } from "../ai-memory/ingestQueue.js";
import { categorizeMcc } from "./mccCategories.js";
import { decryptToken } from "./crypto.js";

const MONO_API_TIMEOUT_MS = 15_000;
/** Monobank personal statement rate limit: 1 req / 60 s per token. */
const BETWEEN_ACCOUNTS_DELAY_MS = 62_000;
const HISTORY_DAYS = 30;

const CURRENCY_SYMBOL: Record<number, string> = {
  980: "₴",
  840: "$",
  978: "€",
  826: "£",
  985: "zł",
};

const BackfillItemSchema = z.object({
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
type BackfillItem = z.infer<typeof BackfillItemSchema>;

function buildMemoryContent(
  item: BackfillItem,
  categorySlug: string | null,
): string {
  const isExpense = item.amount < 0;
  const verb = isExpense ? "Витрата" : "Надходження";
  const symbol = CURRENCY_SYMBOL[item.currencyCode] ?? "";
  const major = Math.abs(item.amount / 100);
  const sign = isExpense ? "−" : "+";
  const formatted = major.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const amountStr = symbol ? `${sign}${formatted} ${symbol}` : `${sign}${formatted}`;
  const description = (item.description || "Без опису").trim().slice(0, 200);
  const dateIso = new Date(item.time * 1000).toISOString().slice(0, 10);
  const categoryPart = categorySlug ? ` · ${categorySlug}` : "";
  return `${verb} ${amountStr} ${description}${categoryPart} · ${dateIso}`;
}

async function upsertTransactions(
  userId: string,
  monoAccountId: string,
  items: BackfillItem[],
): Promise<number> {
  if (items.length === 0) return 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const categorySlug = categorizeMcc(item.mcc);
      const result = await client.query<{ inserted: boolean }>(
        `INSERT INTO mono_transaction
           (user_id, mono_account_id, mono_tx_id, time, amount, operation_amount,
            currency_code, mcc, original_mcc, hold, description, comment,
            cashback_amount, commission_rate, balance, receipt_id, invoice_id,
            counter_edrpou, counter_iban, counter_name, raw, source, category_slug)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'backfill',$22)
         ON CONFLICT (user_id, mono_tx_id) DO NOTHING
         RETURNING (xmax = 0) AS inserted`,
        [
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
        ],
      );
      if (result.rows[0]?.inserted) {
        inserted++;
        void enqueueMemoryIngest({
          userId,
          source: "finyk",
          sourceRef: item.id,
          content: buildMemoryContent(item, categorySlug),
          metadata: {
            monoAccountId,
            amount: item.amount,
            currencyCode: item.currencyCode,
            mcc: item.mcc ?? null,
            categorySlug,
            time: new Date(item.time * 1000).toISOString(),
          },
        });
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return inserted;
}

async function fetchAccountStatement(
  token: string,
  monoAccountId: string,
  fromTs: number,
  toTs: number,
): Promise<BackfillItem[]> {
  const url = `https://api.monobank.ua/personal/statement/${monoAccountId}/${fromTs}/${toTs}`;
  const res = await fetch(url, {
    headers: { "X-Token": token },
    signal: AbortSignal.timeout(MONO_API_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Monobank statement ${res.status}: ${body.slice(0, 200)}`);
  }
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = BackfillItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

interface BackfillAccount {
  id: string;
}

interface BackfillConnectionRow {
  token_ciphertext: Buffer;
  token_iv: Buffer;
  token_tag: Buffer;
}

export async function runMonoHistoryBackfill(
  userId: string,
  accounts: BackfillAccount[],
  encryptedToken: BackfillConnectionRow,
  encKey: string,
): Promise<void> {
  const token = decryptToken(
    {
      ciphertext: encryptedToken.token_ciphertext,
      iv: encryptedToken.token_iv,
      tag: encryptedToken.token_tag,
    },
    encKey,
  );

  const toTs = Math.floor(Date.now() / 1000);
  const fromTs = toTs - HISTORY_DAYS * 24 * 60 * 60;

  let totalInserted = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i]!;
    if (i > 0) {
      // Respect Monobank rate limit between accounts
      await new Promise((resolve) =>
        setTimeout(resolve, BETWEEN_ACCOUNTS_DELAY_MS),
      );
    }
    try {
      const items = await fetchAccountStatement(
        token,
        account.id,
        fromTs,
        toTs,
      );
      const inserted = await upsertTransactions(userId, account.id, items);
      totalInserted += inserted;
      logger.info({
        msg: "mono_backfill_account_done",
        userId,
        monoAccountId: account.id,
        fetched: items.length,
        inserted,
      });
    } catch (err) {
      logger.warn({
        msg: "mono_backfill_account_error",
        userId,
        monoAccountId: account.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await pool
    .query(
      `UPDATE mono_connection SET last_backfill_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
      [userId],
    )
    .catch((err: unknown) => {
      logger.warn({ msg: "mono_backfill_update_at_error", err });
    });

  logger.info({
    msg: "mono_backfill_complete",
    userId,
    accounts: accounts.length,
    totalInserted,
  });
}

/**
 * Schedule a history backfill after connect. Reads the encrypted token back
 * from DB so the plaintext is never kept in a long-lived closure.
 */
export function scheduleHistoryBackfill(
  userId: string,
  accountIds: string[],
  encKey: string,
): void {
  if (accountIds.length === 0) return;

  setImmediate(() => {
    pool
      .query<BackfillConnectionRow>(
        `SELECT token_ciphertext, token_iv, token_tag
         FROM mono_connection WHERE user_id = $1`,
        [userId],
      )
      .then((result) => {
        const row = result.rows[0];
        if (!row) return;
        return runMonoHistoryBackfill(
          userId,
          accountIds.map((id) => ({ id })),
          row,
          encKey,
        );
      })
      .catch((err: unknown) => {
        logger.warn({
          msg: "mono_backfill_schedule_error",
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
      });
  });
}
