import type { PoolClient } from "pg";
import type { ImportDirection } from "@sergeant/shared";

export interface DedupMonoInput {
  userId: string;
  date: string;
  amountKopiykas: number;
  direction: ImportDirection;
}

/**
 * Тір 1 дедупу (спека § Фаза 2 «Дедуп — триярусний», п.1: "Проти
 * банк-API-даних"): чи вже існує `mono_transaction` користувача, яка
 * ОБЛІКОВУЄ саме цей import-рядок — того самого знаку (`expense` →
 * `amount<0`, `income` → `amount>0`), точної суми (`|amount| =
 * amountKopiykas`), у вікні ±1 Kyiv-календарна доба від `date`.
 *
 * Викликається ВСЕРЕДИНІ вже відкритої транзакції `commit.ts` (`client` —
 * checked-out `PoolClient`, не module-level `pool`) — той самий патерн, що
 * `receipts/matcher.ts#matchReceiptToMono`.
 *
 * НА ВІДМІНУ ВІД `receipts/matcher.ts`: (1) підтримує ОБИДВА напрями
 * (`expense`/`income`), не лише `amount < 0`, бо виписки/скріни несуть і
 * надходження; (2) НЕ шукає "сильний" fiscal/receipt-лінк — тут немає
 * фіскального номера, лише сума+дата; (3) НЕ виключає mono-транзакції, вже
 * прилінковані до чека через `finyk_tx_receipt_links` — це узгоджений з
 * v1-чек-скан matcher-ом стан, а не конфлікт: чек ВЖЕ облікований у
 * finyk через свій лінк, і статемент-рядок про той самий платіж так само
 * правильно СКІПАЄТЬСЯ (не створює другий запис), просто з іншої причини
 * (matched-on-mono, не matched-on-receipt-link). Немає розрізнення
 * "чому саме" на рівні цього запиту — обидва дають `skipped-mono`.
 *
 * `date` — вже готовий `YYYY-MM-DD` (Kyiv календарний день, як
 * надрукований на джерелі, без TZ-конвертації в JS — `$2::date` порівнює
 * напряму з `timezone('Europe/Kyiv', t.time)::date` на боці SQL).
 *
 * Ніколи не видаляє й не зливає дані (та сама гарантія, що
 * `matchReceiptToMono`) — лише читає й повертає кандидата; caller
 * (`commit.ts`) вирішує сам. При кількох кандидатах — детермінований вибір
 * (найближчий Kyiv-день до `date`, tie-break по `mono_tx_id`).
 *
 * AI-DANGER: НЕ "consume"-ить (не позначає) знайдену `mono_transaction` як
 * "вже використану цим import-рядком" — два різні import-рядки з
 * однаковою (сума, дата, напрям) теоретично можуть обидва matched-нути
 * на ОДИН mono-tx і обидва скіпнутись, навіть якщо лише один із них
 * справді той самий платіж. Той самий клас "слабкого" ризику, що вже
 * прийнятий у `receipts/matcher.ts`-слабкому матчі (сума+день, без
 * додаткового розрізнення) — не нова регресія цього PR, а той самий
 * компроміс, поширений на N рядків замість одного чека.
 */
export async function findMonoMatch(
  client: PoolClient,
  input: DedupMonoInput,
): Promise<{ monoTxId: string } | null> {
  const { rows } = await client.query<{ mono_tx_id: string }>(
    `SELECT t.mono_tx_id
       FROM mono_transaction t
      WHERE t.user_id = $1
        AND t.deleted_at IS NULL
        AND ABS(t.amount) = $2::bigint
        AND (
          ($3::text = 'expense' AND t.amount < 0)
          OR ($3::text = 'income' AND t.amount > 0)
        )
        AND ABS(
          (timezone('Europe/Kyiv', t.time))::date - $4::date
        ) <= 1
      ORDER BY
        ABS((timezone('Europe/Kyiv', t.time))::date - $4::date) ASC,
        t.mono_tx_id ASC
      LIMIT 1`,
    [input.userId, input.amountKopiykas, input.direction, input.date],
  );
  const row = rows[0];
  return row ? { monoTxId: row.mono_tx_id } : null;
}
