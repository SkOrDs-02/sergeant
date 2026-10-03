import type { PoolClient } from "pg";
import type { ImportDirection } from "@sergeant/shared";

export interface DedupMonoInput {
  date: string;
  amountKopiykas: number;
  direction: ImportDirection;
}

/**
 * Тір 1 дедупу (спека § Фаза 2 «Дедуп — триярусний», п.1: "Проти
 * банк-API-даних"): для КОЖНОГО import-рядка батчу — чи вже існує
 * `mono_transaction` користувача, яка ОБЛІКОВУЄ саме цей рядок: того самого
 * знаку (`expense` → `amount<0`, `income` → `amount>0`), точної суми
 * (`|amount| = amountKopiykas`), у вікні ±1 Kyiv-календарна доба від `date`.
 * Повертає масив `boolean` 1:1 з `rows` (той самий порядок).
 *
 * Один SQL на весь батч: рядки їдуть масивами через `unnest ... WITH
 * ORDINALITY`, а предикат `EXISTS` дослівно той самий, що був у колишньому
 * per-row запиті (до 2026-09-28 було N round-trip-ів на N рядків). Kyiv-день
 * рахує Postgres, не JS, тож межі доби не зсуваються.
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
 * надрукований на джерелі, без TZ-конвертації в JS — `::date` порівнює
 * напряму з `timezone('Europe/Kyiv', t.time)::date` на боці SQL).
 *
 * Ніколи не видаляє й не зливає дані (та сама гарантія, що
 * `matchReceiptToMono`) — лише читає. Який саме mono-tx збігся, caller-у
 * не потрібно (`commit.ts` рахує лише факт збігу), тому запит його й не
 * вибирає.
 *
 * AI-DANGER: НЕ "consume"-ить (не позначає) знайдену `mono_transaction` як
 * "вже використану цим import-рядком" — два різні import-рядки з
 * однаковою (сума, дата, напрям) теоретично можуть обидва matched-нути
 * на ОДИН mono-tx і обидва скіпнутись, навіть якщо лише один із них
 * справді той самий платіж. Той самий клас "слабкого" ризику, що вже
 * прийнятий у `receipts/matcher.ts`-слабкому матчі (сума+день, без
 * додаткового розрізнення) — не нова регресія, а той самий компроміс,
 * поширений на N рядків замість одного чека. Батчинг цю семантику
 * зберігає: кожен рядок перевіряється незалежно.
 */
export async function findMonoMatchedRows(
  client: PoolClient,
  userId: string,
  rows: ReadonlyArray<DedupMonoInput>,
): Promise<boolean[]> {
  const matched = rows.map(() => false);
  if (rows.length === 0) return matched;
  // `ord` це bigint (WITH ORDINALITY), node-pg віддає його рядком: Number()
  // перед індексацією (Hard Rule #1).
  const { rows: hits } = await client.query<{ ord: string }>(
    `SELECT r.ord
       FROM unnest($2::date[], $3::bigint[], $4::text[])
            WITH ORDINALITY AS r(day, amount, direction, ord)
      WHERE EXISTS (
        SELECT 1
          FROM mono_transaction t
         WHERE t.user_id = $1
           AND t.deleted_at IS NULL
           AND ABS(t.amount) = r.amount
           AND (
             (r.direction = 'expense' AND t.amount < 0)
             OR (r.direction = 'income' AND t.amount > 0)
           )
           AND ABS(
             (timezone('Europe/Kyiv', t.time))::date - r.day
           ) <= 1
      )`,
    [
      userId,
      rows.map((r) => r.date),
      rows.map((r) => r.amountKopiykas),
      rows.map((r) => r.direction),
    ],
  );
  for (const { ord } of hits) matched[Number(ord) - 1] = true;
  return matched;
}
