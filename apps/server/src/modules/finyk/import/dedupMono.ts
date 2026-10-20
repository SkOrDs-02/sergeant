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
 * **Що вважається кандидатом (data-30).** Тільки операція ГРИВНЕВОГО рахунку
 * (`mono_account.currency_code = 980`) і НЕ банки (`is_jar = FALSE`).
 * `mono_transaction.amount` лежить у валюті РАХУНКУ: -9500 на USD-рахунку це
 * 95.00 $, а не 95.00 грн, тож без цього фільтра гривневий рядок виписки на
 * 95.00 мовчки «знаходив» долларову покупку. Банка (`is_jar`) — не місце, де
 * людина платить: рух по ній це переказ, а не витрата. Імпорт-рядки завжди
 * в UAH (`not_uah` відсікається ще на превʼю), тож порівнювати їх більше ні з
 * чим.
 *
 * **Кожна mono-транзакція «споживається» максимум одним рядком батчу
 * (data-30).** Два однакові рядки імпорту й ОДНА mono-операція — це одна
 * покупка і одна копія, а не два скіпи: перший рядок отримує збіг, другий
 * лишається новим і створюється. Запит повертає всі пари «рядок -
 * кандидат», а розподіл робить `claimMonoMatches` нижче.
 *
 * Один SQL на весь батч: рядки їдуть масивами через `unnest ... WITH
 * ORDINALITY`. Kyiv-день рахує Postgres, не JS, тож межі доби не зсуваються.
 *
 * Викликається ВСЕРЕДИНІ вже відкритої транзакції `commit.ts` (`client` —
 * checked-out `PoolClient`, не module-level `pool`) — той самий патерн, що
 * `receipts/matcher.ts#matchReceiptToMono`. На превʼю (`monoMatchDetect.ts`)
 * його кличуть з `pool`: потрібен лише `query`.
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
 * (4) Слабкий матч чеків (`matcher.ts`) цими фільтрами НЕ звужено навмисно
 * (рішення власника 2026-10, data-30): там сума+день — задокументований
 * компроміс спеки, а чек може бути оплачений з будь-якої картки.
 *
 * ХТО ЗАСТОСОВУЄ ТІР-1: лише `commit.ts` і лише для профілю `mono`
 * (`ImportCommitRequest.profile`). Для виписки/скріна іншого банку збіг суми
 * й дати з mono-операцією нічого не доводить (кава, проїзд, круглий
 * переказ), тож там це лише мʼяка мітка на превʼю.
 *
 * `date` — вже готовий `YYYY-MM-DD` (Kyiv календарний день, як
 * надрукований на джерелі, без TZ-конвертації в JS — `::date` порівнює
 * напряму з `timezone('Europe/Kyiv', t.time)::date` на боці SQL).
 *
 * Ніколи не видаляє й не зливає дані (та сама гарантія, що
 * `matchReceiptToMono`) — лише читає. Який саме mono-tx збігся, caller-у
 * не потрібно (`commit.ts` рахує лише факт збігу).
 */
export async function findMonoMatchedRows(
  client: Pick<PoolClient, "query">,
  userId: string,
  rows: ReadonlyArray<DedupMonoInput>,
): Promise<boolean[]> {
  const matched = rows.map(() => false);
  if (rows.length === 0) return matched;
  // `ord` і `day_diff` це bigint/int (WITH ORDINALITY, date - date), node-pg
  // віддає bigint рядком: Number() перед індексацією (Hard Rule #1).
  const { rows: pairs } = await client.query<{
    ord: string;
    mono_tx_id: string;
    day_diff: number;
  }>(
    `SELECT r.ord,
            t.mono_tx_id,
            ABS((timezone('Europe/Kyiv', t.time))::date - r.day) AS day_diff
       FROM unnest($2::date[], $3::bigint[], $4::text[])
            WITH ORDINALITY AS r(day, amount, direction, ord)
       JOIN mono_transaction t
         ON t.user_id = $1
        AND t.deleted_at IS NULL
        AND ABS(t.amount) = r.amount
        AND (
          (r.direction = 'expense' AND t.amount < 0)
          OR (r.direction = 'income' AND t.amount > 0)
        )
        AND ABS((timezone('Europe/Kyiv', t.time))::date - r.day) <= 1
       JOIN mono_account a
         ON a.user_id = t.user_id
        AND a.mono_account_id = t.mono_account_id
        AND a.currency_code = 980
        AND a.is_jar = FALSE
      ORDER BY day_diff ASC, r.ord ASC, t.time ASC, t.mono_tx_id ASC`,
    [
      userId,
      rows.map((r) => r.date),
      rows.map((r) => r.amountKopiykas),
      rows.map((r) => r.direction),
    ],
  );
  // Пари вже впорядковано: спершу точний день, потім ±1; всередині дня за
  // номером рядка. Жадібний прохід віддає mono-транзакцію першому рядку, що
  // її хоче, і тримає її зайнятою: точний збіг (той самий день) ніколи не
  // програє рядку з сусіднього дня.
  const claimed = new Set<string>();
  for (const { ord, mono_tx_id } of pairs) {
    const idx = Number(ord) - 1;
    if (matched[idx] || claimed.has(mono_tx_id)) continue;
    matched[idx] = true;
    claimed.add(mono_tx_id);
  }
  return matched;
}
