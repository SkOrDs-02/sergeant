/**
 * Дані Фініка для серверного push: операції і все, що впливає на «скільки
 * витрачено по ліміту». Таблиці й колонки названо в спеці
 * `docs/work/specs/finyk-limit-and-recurring-push.md` § Контракт для агента
 * сервера; розрахунок не дублюємо, лише збираємо входи для
 * `@sergeant/finyk-domain`.
 *
 * Два запити: операції банку плюс ручні записи і один запит-збірка решти
 * (категорії, спліти, приховані, власні категорії, «мені винні», префи,
 * уже застовплені ключі). Кожна підвибірка за `user_id`, тож чужі рядки сюди
 * не потрапляють.
 */

import { toKyivISODate } from "@sergeant/shared";
import {
  manualExpenseToTransaction,
  normalizeTransaction,
} from "@sergeant/finyk-domain/domain/transactions";
import type {
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import { sanitizeCashOnHand } from "@sergeant/finyk-domain/domain/cashOnHand";
import {
  buildFinykExcludedTxIds,
  type FinykReceivableLike,
} from "@sergeant/finyk-domain/lib/metrics";
import {
  buildMerchantRuleIndex,
  type MerchantRuleIndex,
} from "@sergeant/finyk-domain/lib/merchantRules";

import type { FinykPushDb } from "./db.js";

interface MonoTxRow {
  mono_tx_id: string;
  mono_account_id: string;
  time: Date | string;
  amount: string | number;
  mcc: number | null;
  description: string | null;
  currency_code: number;
  category_slug: string | null;
}

/**
 * Рядок `mono_transaction` у ту саму форму, що й `webhookTxToNormalized`
 * вебу: сервер уже вирішив категорію з MCC, і для витрати вона canonical.
 * `amount` у PG `BIGINT`, тож `Number()` (Hard Rule #1).
 */
export function monoRowToTransaction(row: MonoTxRow): Transaction {
  const amount = Number(row.amount);
  return normalizeTransaction(
    {
      id: row.mono_tx_id,
      time: Math.floor(new Date(row.time).getTime() / 1000),
      amount,
      description: row.description ?? "",
      mcc: row.mcc ?? 0,
      currencyCode: row.currency_code,
      categoryId: amount < 0 ? (row.category_slug ?? undefined) : undefined,
    },
    { source: "monobank", accountId: row.mono_account_id },
  );
}

/** День-ключ, з якого фільтруємо ручні записи: на добу раніше за вікно. */
function manualFromDayKey(fromMs: number): string {
  return toKyivISODate(fromMs - 86_400_000);
}

/**
 * Банк + ручні записи від `fromMs`, плюс банківські операції з `extraIds`
 * (привʼязані до боргів і підписок, старші за вікно). Гривневі рахунки
 * лише: Фінік UAH-only без FX, так само як `GET /api/mono/transactions`.
 */
export async function loadFinykTransactions(
  db: FinykPushDb,
  userId: string,
  fromMs: number,
  extraIds: readonly string[] = [],
): Promise<Transaction[]> {
  const { rows } = await db.query<MonoTxRow & { manual: unknown }>(
    `SELECT t.mono_tx_id, t.mono_account_id, t.time, t.amount, t.mcc,
            t.description, t.currency_code, t.category_slug, NULL AS manual
       FROM mono_transaction t
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND (t.time >= $2 OR t.mono_tx_id = ANY($3::text[]))
        AND NOT EXISTS (
              SELECT 1 FROM mono_account a
               WHERE a.user_id = t.user_id
                 AND a.mono_account_id = t.mono_account_id
                 AND a.currency_code <> 980)
     UNION ALL
     SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
            m.data_json || jsonb_build_object('id', m.id::text)
       FROM finyk_manual_expenses m
      WHERE m.user_id = $1
        AND m.deleted_at IS NULL
        AND (m.data_json->>'date') >= $4`,
    [
      userId,
      new Date(fromMs).toISOString(),
      [...extraIds],
      manualFromDayKey(fromMs),
    ],
    "finyk_push_transactions",
  );
  return rows.map((row) =>
    row.manual
      ? manualExpenseToTransaction(
          row.manual as Parameters<typeof manualExpenseToTransaction>[0],
        )
      : monoRowToTransaction(row),
  );
}

interface AuxRow {
  tx_categories: unknown;
  tx_splits: unknown;
  hidden: unknown;
  custom_categories: unknown;
  receivables: unknown;
  prefs_json: unknown;
  excluded_stat: unknown;
  claimed: unknown;
}

export interface FinykSpendAux {
  txCategories: TxCategoriesMap;
  txSplits: TxSplitsMap;
  hiddenTxIds: string[];
  customCategories: unknown[];
  receivables: FinykReceivableLike[];
  merchantRuleIndex: MerchantRuleIndex;
  cashOnHand: ReturnType<typeof sanitizeCashOnHand>;
  excludedStatTxIds: string[];
  /** Ключі `push_reminder_log` людини з префіксом `claimedPrefix`. */
  claimedKeys: Set<string>;
}

function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function asRecord<T>(raw: unknown): Record<string, T> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, T>)
    : {};
}

function asStrings(raw: unknown): string[] {
  return asArray(raw).filter((x): x is string => typeof x === "string");
}

/** Усе, крім операцій, одним запитом. */
export async function loadFinykSpendAux(
  db: FinykPushDb,
  userId: string,
  claimedPrefix: string,
): Promise<FinykSpendAux> {
  const { rows } = await db.query<AuxRow>(
    `SELECT
       (SELECT COALESCE(jsonb_object_agg(c.transaction_id, c.category_id), '{}'::jsonb)
          FROM finyk_tx_categories c
         WHERE c.user_id = $1 AND c.deleted_at IS NULL) AS tx_categories,
       (SELECT COALESCE(jsonb_object_agg(s.transaction_id, s.splits_json), '{}'::jsonb)
          FROM finyk_tx_splits s
         WHERE s.user_id = $1 AND s.deleted_at IS NULL) AS tx_splits,
       (SELECT COALESCE(jsonb_agg(h.transaction_id), '[]'::jsonb)
          FROM finyk_hidden_transactions h
         WHERE h.user_id = $1 AND h.deleted_at IS NULL) AS hidden,
       (SELECT COALESCE(jsonb_agg(cc.data_json || jsonb_build_object('id', cc.id::text)), '[]'::jsonb)
          FROM finyk_custom_categories cc
         WHERE cc.user_id = $1 AND cc.deleted_at IS NULL) AS custom_categories,
       (SELECT COALESCE(jsonb_agg(r.data_json || jsonb_build_object('id', r.id::text)), '[]'::jsonb)
          FROM finyk_receivables r
         WHERE r.user_id = $1 AND r.deleted_at IS NULL) AS receivables,
       (SELECT p.prefs_json FROM finyk_prefs p WHERE p.user_id = $1) AS prefs_json,
       (SELECT p.excluded_stat_tx_ids FROM finyk_prefs p WHERE p.user_id = $1) AS excluded_stat,
       (SELECT COALESCE(jsonb_agg(l.dedup_key), '[]'::jsonb)
          FROM push_reminder_log l
         WHERE l.user_id = $1 AND starts_with(l.dedup_key, $2)) AS claimed`,
    [userId, claimedPrefix],
    "finyk_push_aux",
  );
  const row = rows[0];
  const prefs = asRecord<unknown>(row?.prefs_json);
  return {
    txCategories: asRecord<string>(row?.tx_categories),
    txSplits: asRecord(row?.tx_splits) as TxSplitsMap,
    hiddenTxIds: asStrings(row?.hidden),
    customCategories: asArray(row?.custom_categories),
    receivables: asArray(row?.receivables) as FinykReceivableLike[],
    merchantRuleIndex: buildMerchantRuleIndex(asArray(prefs["merchantRules"])),
    cashOnHand: sanitizeCashOnHand(prefs["cashOnHand"]),
    excludedStatTxIds: asStrings(row?.excluded_stat),
    claimedKeys: new Set(asStrings(row?.claimed)),
  };
}

/** Канонічний набір виключених зі статистики, як на екрані Планування. */
export function finykExcludedTxIds(
  aux: FinykSpendAux,
  transactions: readonly Transaction[],
): Set<string> {
  return buildFinykExcludedTxIds({
    hiddenTxIds: aux.hiddenTxIds,
    txCategories: aux.txCategories,
    receivables: aux.receivables,
    excludedStatTxIds: aux.excludedStatTxIds,
    transactions,
    cashOnHand: aux.cashOnHand,
  });
}
