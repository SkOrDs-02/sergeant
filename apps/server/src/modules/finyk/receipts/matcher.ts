import type { PoolClient } from "pg";

export type ReceiptMatchResult =
  { kind: "mono"; monoTxId: string } | { kind: "none" };

export interface ReceiptMatchInput {
  userId: string;
  fiscalNum: string | null;
  totalKopiykas: number;
  purchasedAt: Date;
}

/**
 * Шукає mono-транзакцію для щойно збереженого чека (спека § «Дедуп»).
 * Виклик — усередині ВЖЕ ВІДКРИТОЇ транзакції `save.ts` (`client` —
 * checked-out `PoolClient`, не module-level `pool`), щоб SELECT і подальший
 * INSERT лінка бачили узгоджений знімок.
 *
 * Пріоритет:
 *   1. Сильний лінк — `mono_transaction.receipt_id` (Monobank-івський
 *      receiptId з їхнього statement API, НЕ FK на нашу `receipts`
 *      таблицю; міграція 008) дорівнює `fiscalNum` чека.
 *   2. Слабкий лінк — точна сума (`ABS(amount)`) + дата в межах ±1 доба
 *      **Kyiv** від `purchasedAt` (ADR-0078 "Kyiv"-режим: фінансовий
 *      timestamp, не device-local день-ключ). "±1 доба" читається як
 *      Kyiv-КАЛЕНДАРНИЙ день ±1 (учора/сьогодні/завтра відносно Kyiv-дня
 *      покупки), не як ковзне вікно ±24 години від миті — тому
 *      `timezone('Europe/Kyiv', ts)::date`, а не `INTERVAL '1 day'`
 *      навколо самого timestamp-у (той самий SQL-ідіом, що канонічний
 *      для "Kyiv"-режиму дедуплікації в цьому репо).
 *
 * Обидва запити:
 *   - виключають mono-транзакції, ВЖЕ привʼязані до ІНШОГО чека
 *     (`finyk_tx_receipt_links`, tx_kind='mono') — один mono-tx не може
 *     дістати два receipt-и;
 *   - виключають mono-транзакції, вже привʼязані до Сільпо-чека
 *     (`silpo_tx_receipt_links`, окремий matcher-конвеєр модуля Silpo,
 *     `receiptsMatch.ts`) — без цієї перевірки два незалежні matcher-и
 *     дедуплікували кожен ЛИШЕ свою таблицю лінків, і одна транзакція
 *     могла дістати і фіскальний, і Сільпо-чек одночасно (§1.14 audit
 *     finding). Зворотний напрям (Silpo-matcher бачить цю таблицю) —
 *     турбота модуля Silpo, не цього файлу;
 *   - вимагають `amount < 0` — чек це завжди ВИТРАТА (гроші йдуть з
 *     рахунку), тому надходження такого самого номіналу (переказ,
 *     повернення) навмисно не кандидат matcher-а;
 *   - фільтрують `deleted_at IS NULL` (soft-delete, міграція 024).
 *
 * Ніколи не видаляє й не зливає дані (спека) — лише читає й повертає
 * кандидата; caller (`save.ts`) сам вирішує, створювати лінк чи manual
 * expense. При кількох кандидатах слабкого матчу — детермінований вибір
 * (найближчий за часом до `purchasedAt`, tie-break по `mono_tx_id`), а не
 * відмова через амбігуїті: v1-спека (на відміну від чернетки silpo-спеки)
 * не визначає окремий "ambiguous"-стан review-екрана.
 */
export async function matchReceiptToMono(
  client: PoolClient,
  input: ReceiptMatchInput,
): Promise<ReceiptMatchResult> {
  if (input.fiscalNum) {
    const strong = await client.query<{ mono_tx_id: string }>(
      `SELECT t.mono_tx_id
         FROM mono_transaction t
        WHERE t.user_id = $1
          AND t.deleted_at IS NULL
          AND t.amount < 0
          AND t.receipt_id = $2
          AND NOT EXISTS (
            SELECT 1 FROM finyk_tx_receipt_links l
             WHERE l.tx_kind = 'mono' AND l.tx_ref = t.mono_tx_id
          )
          AND NOT EXISTS (
            SELECT 1 FROM silpo_tx_receipt_links sl
             WHERE sl.user_id = t.user_id AND sl.transaction_id = t.mono_tx_id
          )
        ORDER BY t.time DESC
        LIMIT 1`,
      [input.userId, input.fiscalNum],
    );
    const strongRow = strong.rows[0];
    if (strongRow) return { kind: "mono", monoTxId: strongRow.mono_tx_id };
  }

  const weak = await client.query<{ mono_tx_id: string }>(
    `SELECT t.mono_tx_id
       FROM mono_transaction t
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND t.amount < 0
        AND ABS(t.amount) = $2::bigint
        AND ABS(
          (timezone('Europe/Kyiv', t.time))::date
          - (timezone('Europe/Kyiv', $3::timestamptz))::date
        ) <= 1
        AND NOT EXISTS (
          SELECT 1 FROM finyk_tx_receipt_links l
           WHERE l.tx_kind = 'mono' AND l.tx_ref = t.mono_tx_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM silpo_tx_receipt_links sl
           WHERE sl.user_id = t.user_id AND sl.transaction_id = t.mono_tx_id
        )
      ORDER BY ABS(EXTRACT(EPOCH FROM (t.time - $3::timestamptz))) ASC, t.mono_tx_id ASC
      LIMIT 1`,
    [input.userId, input.totalKopiykas, input.purchasedAt.toISOString()],
  );
  const weakRow = weak.rows[0];
  if (weakRow) return { kind: "mono", monoTxId: weakRow.mono_tx_id };

  return { kind: "none" };
}
