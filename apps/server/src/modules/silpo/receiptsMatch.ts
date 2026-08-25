/**
 * Matcher-крок синку Сільпо — винесено з `receipts.ts` (Hard Rule #18:
 * після UNION-у ручних витрат той файл знову переріс 600 рядків, як уже
 * було з read-шляхом → `receiptsRead.ts`).
 *
 * Тут живе рівно одна відповідальність: зібрати кандидатів (чеки без
 * пари × транзакції у вікні), відняти пари, які людина зняла руками, і
 * записати те, що детермінований матчер визнав однозначним.
 */
// Субшлях замість кореневого барела: барел тягне categories.ts →
// design-tokens, якого нема в server-бандлі (esbuild резолвить усі
// імпорти до tree-shaking).
import {
  matchReceiptsToTransactions,
  type MonoTxForReceiptMatching,
  type ReceiptForMatching,
} from "@sergeant/finyk-domain/domain/receiptMatching";
import type { QueryFn } from "./tokenStore.js";

// ─────────────────────────────── Matcher step ───────────────────────────────

type MonoTxCandidateRow = {
  id: string;
  amountKop: number;
  timeSeconds: number;
  mcc: number | null;
  description: string | null;
  receiptId: string | null;
};

/**
 * Вікно matcher-а обмежене: чеки старші 90 днів майже напевно не мають
 * незматченої Mono-транзакції-кандидата (та й `loadCandidateTransactions`
 * будує вікно з min/max purchased_at — один давній чек розтягував би його
 * на місяці), а LIMIT страхує від необмеженого скану після масового
 * імпорту історії. Хвіст доганяється наступними синками.
 */
const MATCH_WINDOW_DAYS = 90;
const MATCH_BATCH_LIMIT = 500;

async function loadUnresolvedReceipts(
  userId: string,
  queryFn: QueryFn,
): Promise<ReceiptForMatching[]> {
  const { rows } = await queryFn<{
    receipt_id: string;
    total_kop: number;
    purchased_at: Date | string;
  }>(
    `SELECT r.receipt_id, r.total_kop, r.purchased_at
       FROM silpo_receipts r
       WHERE r.user_id = $1
         AND r.purchased_at >= NOW() - ($2 || ' days')::interval
         AND NOT EXISTS (
           SELECT 1 FROM silpo_tx_receipt_links l
            WHERE l.user_id = r.user_id AND l.receipt_id = r.receipt_id
         )
       ORDER BY r.purchased_at DESC
       LIMIT $3`,
    [userId, String(MATCH_WINDOW_DAYS), MATCH_BATCH_LIMIT],
    { op: "silpo_unresolved_receipts_select" },
  );
  return rows.map((r) => ({
    receiptId: r.receipt_id,
    totalKop: Number(r.total_kop),
    purchasedAtMs: new Date(r.purchased_at).getTime(),
  }));
}

async function loadCandidateTransactions(
  userId: string,
  windowStartMs: number,
  windowEndMs: number,
  queryFn: QueryFn,
): Promise<MonoTxForReceiptMatching[]> {
  const { rows } = await queryFn<MonoTxCandidateRow>(
    // UNION з `finyk_manual_expenses`, а не сам лише `mono_transaction`.
    //
    // Витрати, залиті через скан банкінгу або додані руками, живуть НЕ в
    // `mono_transaction` (`modules/finyk/import/commit.ts` пише їх у
    // `finyk_manual_expenses.data_json`), тож для matcher-а вони не
    // існували. У стрічці Фініка вони видні поряд із банківськими — і це
    // те, що людина бачить: «транзакція ж є, а чек каже, що її немає».
    // Знайдено на живих даних founder-а: 2 чеки з 34.
    //
    // Форма blob-у — той самий контракт, що читає `manualExpenseToTransaction`
    // (`@sergeant/finyk-domain`): `amount` ЗАВЖДИ додатний у ГРИВНЯХ, напрям
    // несе `kind`. Звідси `-ROUND(amount*100)`: matcher чекає копійки й
    // відʼємну суму для витрати, як у mono.
    `SELECT t.mono_tx_id AS "id",
            t.amount AS "amountKop",
            EXTRACT(EPOCH FROM t.time)::bigint AS "timeSeconds",
            t.mcc,
            t.description,
            t.receipt_id AS "receiptId"
       FROM mono_transaction t
      WHERE t.user_id = $1
        AND t.amount < 0
        AND t.time >= $2
        AND t.time <= $3
        AND NOT EXISTS (
          SELECT 1 FROM silpo_tx_receipt_links l
           WHERE l.user_id = t.user_id AND l.transaction_id = t.mono_tx_id
        )
      UNION ALL
     SELECT m.data_json->>id AS "id",
            (-ROUND((m.data_json->>amount)::numeric * 100))::bigint AS "amountKop",
            -- Дата без часу: беремо полудень, щоб добове вікно matcher-а не
            -- залежало від того, в який бік зсуває північ UTC↔Kyiv.
            EXTRACT(EPOCH FROM ((m.data_json->>date)::date + TIME 12:00))::bigint AS "timeSeconds",
            NULL::int AS "mcc",
            m.data_json->>description AS "description",
            NULL::text AS "receiptId"
       FROM finyk_manual_expenses m
      WHERE m.user_id = $1
        AND COALESCE(m.data_json->>kind, expense) = expense
        AND (m.data_json->>date)::date >= ($2::timestamptz)::date
        AND (m.data_json->>date)::date <= ($3::timestamptz)::date
        AND NOT EXISTS (
          SELECT 1 FROM silpo_tx_receipt_links l
           WHERE l.user_id = m.user_id
             AND l.transaction_id = m.data_json->>id
        )`,
    [userId, new Date(windowStartMs), new Date(windowEndMs)],
    { op: "silpo_candidate_transactions_select" },
  );
  return rows.map((r) => ({
    id: r.id,
    amountKop: Number(r.amountKop),
    timeSeconds: Number(r.timeSeconds),
    mcc: r.mcc,
    description: r.description,
    receiptId: r.receiptId,
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Пари «транзакція ↔ чек», які користувач зняв через
 * `DELETE /api/silpo/receipts/link/:transactionId`. Ключ — `"<txId> <receiptId>"`;
 * пробіл безпечний як роздільник, бо обидва ідентифікатори приходять
 * зовнішніми системами без пробілів (Mono tx id, Silpo receipt id).
 */
async function loadLinkRejections(
  userId: string,
  queryFn: QueryFn,
): Promise<Set<string>> {
  const { rows } = await queryFn<{
    transaction_id: string;
    receipt_id: string;
  }>(
    `SELECT transaction_id, receipt_id
       FROM silpo_tx_receipt_link_rejections
      WHERE user_id = $1`,
    [userId],
    { op: "silpo_link_rejections_select" },
  );
  return new Set(rows.map((r) => `${r.transaction_id} ${r.receipt_id}`));
}

export async function matchAndLink(
  userId: string,
  queryFn: QueryFn,
): Promise<{ matched: number; ambiguous: number; unmatched: number }> {
  const receipts = await loadUnresolvedReceipts(userId, queryFn);
  if (receipts.length === 0) return { matched: 0, ambiguous: 0, unmatched: 0 };

  const purchasedTimes = receipts.map((r) => r.purchasedAtMs);
  const windowStartMs = Math.min(...purchasedTimes) - DAY_MS;
  const windowEndMs = Math.max(...purchasedTimes) + DAY_MS;
  const transactions = await loadCandidateTransactions(
    userId,
    windowStartMs,
    windowEndMs,
    queryFn,
  );

  const result = matchReceiptsToTransactions(receipts, transactions);

  // Пари, які користувач уже розлінкував руками (міграція 127). Фільтр
  // стоїть ТУТ, а не в `loadUnresolvedReceipts`: відхилено конкретну ПАРУ,
  // а не чек — той самий чек має лишатись кандидатом на іншу транзакцію.
  // Без цього кроку розлінк був би косметикою: matcher детермінований, тож
  // найближчий sync побачив би чек знову без лінка й відновив рівно те, що
  // людина щойно зняла.
  const rejected = await loadLinkRejections(userId, queryFn);
  const accepted = result.matches.filter(
    (m) => !rejected.has(`${m.transactionId} ${m.receiptId}`),
  );

  for (const m of accepted) {
    await queryFn(
      `INSERT INTO silpo_tx_receipt_links (user_id, transaction_id, receipt_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, transaction_id) DO NOTHING`,
      [userId, m.transactionId, m.receiptId],
      { op: "silpo_tx_receipt_link_insert" },
    );
  }

  // Відхилений матч рахується як `unmatched`, а не `matched`: у звітності
  // чек лишився без пари, і саме це має бачити людина в лозі синку.
  const rejectedCount = result.matches.length - accepted.length;

  return {
    matched: accepted.length,
    ambiguous: result.ambiguousReceiptIds.length,
    unmatched: result.unmatchedReceiptIds.length + rejectedCount,
  };
}
