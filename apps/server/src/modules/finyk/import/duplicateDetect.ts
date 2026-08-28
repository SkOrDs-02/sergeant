/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * «Сітка 2» дедуп-превʼю (бета-фідбек №4, 2026-08-18): тестерка кинула той
 * самий скрін банкінгу двічі поспіль — і рядки задвоїлись, бо тір-2 ключ
 * (`rowKey.ts`) хешує ОПИС, а vision читає опис недетерміновано: два
 * прогони на тому самому зображенні дають трохи різні рядки, хеші
 * розходяться, ON CONFLICT не спрацьовує. CSV цим не страждає (байт-у-байт
 * той самий вхід), але сітка вмикається і там — вона ловить ще й «той
 * самий період, знятий іншим документом».
 *
 * Принцип: на ПРЕВʼЮ (не на commit) звіряємо кожен рядок з уже збереженими
 * `finyk_manual_expenses` за трійкою дата+сума+напрям, ігноруючи опис —
 * саме він і плаває. Збіг = мʼяка мітка `duplicateLikely: true`: бейдж +
 * знята галочка у bulk-review, рішення за людиною. НІЧОГО не викидаємо
 * автоматично.
 *
 * Count-обмеження: K наявних записів у бакеті (дата, сума, напрям)
 * маркують лише ПЕРШІ K рядків превʼю того ж бакета (у порядку появи) —
 * дві чесні однакові покупки в один день (дві кави по 95) не зʼїдають
 * одна одну, коли збережена лише одна.
 *
 * Свідомо ПОЗА сіткою: mono-транзакції (їх ловить `dedupMono.ts` на
 * commit і мовчки скіпає — окремий, уже наявний ярус) і чеки (тір 3,
 * fiscal_num).
 *
 * **Дата порівнюється за ДНЕМ, не за точним рядком (фікс 2026-08-28).**
 * `ManualExpense.date` живе у ДВОХ формах: серверні писарі (цей імпорт,
 * чековий fallback) кладуть день-ключ `YYYY-MM-DD`, а клієнтський
 * `ManualExpenseSheet` — ISO-інстант, прибитий до полудня UTC
 * (`manualExpenseForm.ts::toExpenseInstant`, зроблено навмисно, щоб день
 * не зʼїхав при конвертації). Порівняння `data_json->>'date' = ANY(...)`
 * було ТОЧНИМ по рядку, тож `'2026-08-24T12:00:00.000Z'` ніколи не
 * дорівнювало `'2026-08-24'` — і сітка НЕ БАЧИЛА жодної витрати,
 * збереженої чи відредагованої через аркуш, тобто фактично всіх ручних.
 *
 * Ціна цього була не косметична (звіт власника 2026-08-28): рядок
 * виписки, який уже існував, бейджа не отримав, лишився з галочкою,
 * поїхав на commit і там впав у тір-2 `ON CONFLICT` як `duplicate`. Один
 * такий рядок вимикав тодішній «все або нічого» write-through для всього
 * батчу — 37 створених витрат не побачив жоден пристрій.
 *
 * `left(…, 10)` нормалізує обидві форми: перші 10 символів обох — це
 * той самий `YYYY-MM-DD`. Прибивання до полудня UTC гарантує, що день не
 * зсунеться для Києва (12:00 UTC = 15:00 Kyiv, та сама доба), тож зріз
 * безпечний і для ADR-0078-семантики особистої доби.
 *
 * НЕ `::date`, хоч сусідній `silpo/receiptsMatch.ts` кастує саме так:
 * каст кидає помилку на будь-якому нерозбірливому рядку, а це шлях
 * ПРЕВʼЮ — один битий blob не має валити весь запит 500-кою. Той самий
 * захисний принцип, що й мовчазне ігнорування битих сум нижче.
 */
import type pool from "../../../db.js";

export interface DuplicateCheckRow {
  date: string;
  amountKopiykas: number;
  direction: "expense" | "income";
}

type Db = Pick<typeof pool, "query">;

function bucketKey(
  date: string,
  amountKopiykas: number,
  direction: string,
): string {
  return `${date}|${amountKopiykas}|${direction}`;
}

/**
 * Повертає ті самі рядки в тому самому порядку; збіги отримують
 * `duplicateLikely: true` (лише true — відсутнє поле означає «збігів
 * немає», контракт `duplicateLikelySchema` у `@sergeant/shared`).
 * Порожній вхід не ходить у БД.
 */
export async function markDuplicateLikely<T extends DuplicateCheckRow>(
  db: Db,
  userId: string,
  rows: readonly T[],
): Promise<T[]> {
  if (rows.length === 0) return [...rows];

  const dates = [...new Set(rows.map((r) => r.date))];
  // `amount` у blob-і — додатна величина в ГРИВНЯХ (`commit.ts`
  // ManualExpenseBlob), напрям — окреме поле `kind` з легасі-фолбеком
  // "expense" (той самий фолбек, що `resolveManualExpenseKind`).
  // COUNT(*) від `pg` приходить bigint-рядком — Number() нижче свідомий
  // (Hard Rule #1 стосується серіалізації назовні; тут внутрішня
  // арифметика лічильника).
  const { rows: existing } = await db.query<{
    date: string | null;
    amount: string | null;
    kind: string;
    count: string;
  }>(
    `SELECT left(data_json->>'date', 10) AS date,
            data_json->>'amount' AS amount,
            COALESCE(data_json->>'kind', 'expense') AS kind,
            COUNT(*) AS count
       FROM finyk_manual_expenses
      WHERE user_id = $1
        AND deleted_at IS NULL
        AND left(data_json->>'date', 10) = ANY($2::text[])
      GROUP BY 1, 2, 3`,
    [userId, dates],
  );

  const available = new Map<string, number>();
  for (const e of existing) {
    if (!e.date) continue;
    const hryvnia = Number(e.amount);
    if (!Number.isFinite(hryvnia) || hryvnia <= 0) continue;
    const kind = e.kind === "income" ? "income" : "expense";
    const key = bucketKey(e.date, Math.round(hryvnia * 100), kind);
    available.set(key, (available.get(key) ?? 0) + Number(e.count));
  }
  if (available.size === 0) return [...rows];

  return rows.map((row) => {
    const key = bucketKey(row.date, row.amountKopiykas, row.direction);
    const left = available.get(key) ?? 0;
    if (left <= 0) return row;
    available.set(key, left - 1);
    return { ...row, duplicateLikely: true };
  });
}
