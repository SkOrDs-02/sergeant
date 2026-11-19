/**
 * Monobank statement backfill — fetches the last three months of transactions
 * (three 31-day windows, `statementWindows.ts`; OD-26 Ф-3 (а)) for all
 * accounts immediately after a user connects their token.
 *
 * Called fire-and-forget from `connectHandler` so it never delays the HTTP
 * response. Errors are logged but not re-thrown — a failed backfill is
 * non-fatal; future webhooks will fill the gap going forward.
 *
 * Rate limit: Monobank allows 1 statement request per 60 s per token.
 * We sleep 62 s before every statement request except the very first one
 * (windows, pages and accounts alike) — about three minutes per account.
 */

import { z } from "zod";
import { pool } from "../../db.js";
import { logger } from "../../obs/logger.js";
import { categorizeMcc } from "./mccCategories.js";
import type { KeyRing } from "../../lib/keyRing.js";
import { decryptAndLazyReencrypt, type MonoTokenRow } from "./tokenStore.js";
import { formatNumberUk, toKyivISODate } from "@sergeant/shared";
import {
  MONO_STATEMENT_PAGE_SIZE,
  monoHistoryWindows,
  nextStatementPageTo,
} from "./statementWindows.js";

const MONO_API_TIMEOUT_MS = 15_000;
/** Monobank personal statement rate limit: 1 req / 60 s per token. */
const BETWEEN_REQUESTS_DELAY_MS = 62_000;
/** Запобіжник від нескінченного гортання одного вікна (як у `backfill.ts`). */
const MAX_PAGES = 20;

type Sleeper = (ms: number) => Promise<void>;
const defaultSleep: Sleeper = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));
let _sleep: Sleeper = defaultSleep;

/** Test-only: підмінити паузу між запитами (`null` повертає справжню). */
export function __setHistoryFetchSleep(fn: Sleeper | null): void {
  _sleep = fn ?? defaultSleep;
}

const CURRENCY_SYMBOL: Record<number, string> = {
  980: "₴",
  840: "$",
  978: "€",
  826: "£",
  985: "zł",
};

/** Human-readable formatter kept for diagnostics/tests; raw transactions are
 * deliberately not sent to AI memory. */
export function buildMemoryContent(
  item: BackfillItem,
  categorySlug: string | null,
): string {
  const isExpense = item.amount < 0;
  const verb = isExpense ? "Витрата" : "Надходження";
  const symbol = CURRENCY_SYMBOL[item.currencyCode] ?? "";
  const major = Math.abs(item.amount / 100);
  const sign = isExpense ? "−" : "+";
  const formatted = formatNumberUk(major, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const amountStr = symbol
    ? `${sign}${formatted} ${symbol}`
    : `${sign}${formatted}`;
  const description = (item.description || "Без опису").trim().slice(0, 200);
  // Київська доба: `item.time` — момент транзакції в Unix-секундах, а рядок
  // читає модель і показує людині. UTC-нарізка підписувала б нічну покупку
  // (після 21:00 UTC влітку) вчорашнім днем. Заборона на цей патерн —
  // `modules/finyk/receipts/kyivClock.ts`.
  const dateIso = toKyivISODate(item.time * 1000);
  const categoryPart = categorySlug ? ` · ${categorySlug}` : "";
  return `${verb} ${amountStr} ${description}${categoryPart} · ${dateIso}`;
}

export const BackfillItemSchema = z.object({
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

/**
 * Одна сторінка виписки. Гортання рахується за СИРОЮ сторінкою Monobank
 * (`rawTimes`: по елементу на кожен рядок відповіді, `NaN` там, де `time`
 * не число), а не за рядками, що пройшли схему: інакше один відкинутий
 * рядок на повній сторінці робив її «неповною» і мовчки обривав решту вікна
 * (аудит 2026-10-01, `data-65`).
 */
export interface StatementPage {
  items: BackfillItem[];
  rawTimes: number[];
  /** Скільки рядків сторінки не пройшли `BackfillItemSchema`. */
  dropped: number;
}

export async function fetchAccountStatement(
  token: string,
  monoAccountId: string,
  fromTs: number,
  toTs: number,
): Promise<StatementPage> {
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
  if (!Array.isArray(raw)) return { items: [], rawTimes: [], dropped: 0 };
  const items: BackfillItem[] = [];
  const rawTimes: number[] = [];
  for (const row of raw as unknown[]) {
    const time =
      row !== null && typeof row === "object"
        ? (row as { time?: unknown }).time
        : undefined;
    rawTimes.push(typeof time === "number" ? time : Number.NaN);
    const parsed = BackfillItemSchema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
  }
  return { items, rawTimes, dropped: raw.length - items.length };
}

interface BackfillAccount {
  id: string;
}

type BackfillConnectionRow = MonoTokenRow;

export async function runMonoHistoryBackfill(
  userId: string,
  accounts: BackfillAccount[],
  encryptedToken: BackfillConnectionRow,
  ring: KeyRing,
): Promise<void> {
  // Decrypt under the row's recorded key version + lazily re-encrypt if it's
  // a legacy/stale-version row (best-effort; never throws on the write).
  const token = await decryptAndLazyReencrypt(encryptedToken, userId, ring);

  const windows = monoHistoryWindows(Math.floor(Date.now() / 1000));

  let totalInserted = 0;
  let requests = 0;
  const paced = async () => {
    if (requests > 0) await _sleep(BETWEEN_REQUESTS_DELAY_MS);
    requests++;
  };

  for (const account of accounts) {
    let fetched = 0;
    let inserted = 0;
    let dropped = 0;
    try {
      // Вікна й сторінки від нових до старих; помилка зупиняє лише цей
      // рахунок, тож його покриття лишається суцільним від «зараз» назад.
      for (const window of windows) {
        let pageTo = window.to;
        // Межа сторінки включна (`nextStatementPageTo`): операції на ній
        // приходять двічі, рахуємо кожну один раз.
        const seen = new Set<string>();
        for (let page = 0; page < MAX_PAGES; page++) {
          await paced();
          const statement = await fetchAccountStatement(
            token,
            account.id,
            window.from,
            pageTo,
          );
          const fresh = statement.items.filter((it) => !seen.has(it.id));
          for (const it of fresh) seen.add(it.id);
          fetched += fresh.length;
          // Рядок на включній межі сторінки приходить двічі, тож відкинутий
          // там рахується двічі: лічильник це сигнал «щось відкидаємо», а не
          // точний облік унікальних операцій.
          dropped += statement.dropped;
          inserted += await upsertTransactions(userId, account.id, fresh);
          // Повнота сторінки і межа наступної за СИРИМИ рядками (`data-65`):
          // відкинутий схемою рядок не обриває гортання.
          if (statement.rawTimes.length < MONO_STATEMENT_PAGE_SIZE) break;
          const nextTo = nextStatementPageTo(
            statement.rawTimes,
            pageTo,
            window.from,
          );
          if (nextTo === null) break;
          pageTo = nextTo;
        }
      }
      logger.info({
        msg: "mono_backfill_account_done",
        userId,
        monoAccountId: account.id,
        fetched,
        inserted,
        dropped,
      });
    } catch (err) {
      logger.warn({
        msg: "mono_backfill_account_error",
        userId,
        monoAccountId: account.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    if (dropped > 0) {
      // Hard Rule #21: лише лічильник. Вміст рядків (суми, описи,
      // контрагенти) у лог не йде; userId і monoAccountId вже пише
      // `mono_backfill_account_done` поруч.
      logger.warn({
        msg: "mono_backfill_rows_dropped",
        userId,
        monoAccountId: account.id,
        dropped,
      });
    }
    totalInserted += inserted;
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
  ring: KeyRing,
): void {
  if (accountIds.length === 0) return;

  setImmediate(() => {
    pool
      .query<BackfillConnectionRow>(
        `SELECT token_ciphertext, token_iv, token_tag, token_key_version
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
          ring,
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
