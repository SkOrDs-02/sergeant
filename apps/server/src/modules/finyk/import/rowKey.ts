import { createHash } from "node:crypto";
import type { ImportDirection } from "@sergeant/shared";

/**
 * Детермінований row-key для дедуп «між імпортами» (ініціатива 0022
 * § Відкриті рішення №2, деталізовано в task-brief server-agent-у):
 *
 *   id = "imp1:" + sha256(userId|source_family|date|amountKopiykas|
 *                          direction|normalize(description)|occurrenceIndex)
 *
 * `source_family` — константа `"bank"`, СПІЛЬНА для `bank_screenshot` і
 * `bank_statement` (спека § Фаза 2: "той самий платіж, побачений і на
 * скріні, і у виписці — один id"; batch-чеки — інша поверхня, поза
 * скоупом цього модуля, тому тут немає `"receipt"`-варіанту).
 *
 * Інваріант (0022): той самий вхідний період → той самий набір ключів; два
 * легітимно однакові платежі в один день лишаються ДВОМА різними id
 * завдяки `occurrenceIndex` (порядковий номер рядка всередині своєї групи,
 * у порядку появи у вхідному масиві — стабільно, без пере-сортування).
 *
 * Індекс видає превʼю по ВСІХ рядках файлу (`withOccurrenceIndices`), а
 * commit бере його з рядка (data-29): інакше індекс залежав би від того, які
 * рядки групи користувач вибрав, і друга покупка отримувала б 0.
 */

const SOURCE_FAMILY = "bank";
const ROW_ID_PREFIX = "imp1:";

interface RowKeyFields {
  date: string;
  amountKopiykas: number;
  direction: ImportDirection;
  description: string;
}

export interface ImportRowKeyInput extends RowKeyFields {
  userId: string;
  occurrenceIndex: number;
}

/**
 * Нормалізує опис для групування/хешування: NFKC (уніфікує еквівалентні
 * Unicode-форми запису), trim, lowercase, згортає внутрішні пробіли до
 * одного. НЕ прибирає пунктуацію — спека цього не вимагає, а надто
 * агресивна нормалізація ризикує злити описи, які насправді різні.
 */
export function normalizeDescriptionForRowKey(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function groupKey(row: RowKeyFields): string {
  return [
    row.date,
    row.amountKopiykas,
    row.direction,
    normalizeDescriptionForRowKey(row.description),
  ].join("|");
}

/**
 * Присвоює `occurrenceIndex` (0-based) КОЖНОМУ рядку `rows` — порядковий
 * номер усередині групи однакових (date, amountKopiykas, direction,
 * normalized description), у порядку появи в масиві. Один прохід,
 * `Map`-акумулятор — детерміновано за конструкцією: той самий вхідний
 * масив (той самий порядок рядків) завжди дає той самий набір індексів,
 * незалежно від того, скільки ІНШИХ груп навколо чи в якому вони порядку.
 */
export function computeOccurrenceIndices(
  rows: ReadonlyArray<RowKeyFields>,
): number[] {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const key = groupKey(row);
    const idx = counts.get(key) ?? 0;
    counts.set(key, idx + 1);
    return idx;
  });
}

/**
 * `imp1:<sha256 hex>` — валідний TEXT PK для `finyk_manual_expenses.id`
 * (міграція 096 розширила `uuid → text`; префікс `imp1:` нічого не ламає,
 * бо колонка вже TEXT, не UUID — на відміну від `randomUUID()`, який
 * використовує `receipts/save.ts` для чекових manual-expense fallback-ів).
 */
export function buildImportRowId(input: ImportRowKeyInput): string {
  const preimage = [
    input.userId,
    SOURCE_FAMILY,
    input.date,
    input.amountKopiykas,
    input.direction,
    normalizeDescriptionForRowKey(input.description),
    input.occurrenceIndex,
  ].join("|");
  return ROW_ID_PREFIX + createHash("sha256").update(preimage).digest("hex");
}

/** Рядок, що може нести `occurrenceIndex`, виданий превʼю (data-29). */
export interface ImportRowIdInput extends RowKeyFields {
  occurrenceIndex?: number | undefined;
}

/**
 * Додає `occurrenceIndex` кожному рядку ПОВНОГО набору (усі рядки файлу чи
 * скріна, а не вибрана підмножина) – для превʼю. Клієнт повертає індекс у
 * `commit` без змін, тож id рядка не залежить від того, які саме рядки групи
 * користувач вибрав (data-29: єдиний вибраний рядок групи отримував 0 і
 * збігався з уже імпортованою першою покупкою).
 *
 * Групування те саме, що в `computeOccurrenceIndices` / `groupKey`, тож для
 * commit усього файлу цілком id не змінюються відносно рахунку по тілу.
 */
export function withOccurrenceIndices<T extends RowKeyFields>(
  rows: ReadonlyArray<T>,
): Array<T & { occurrenceIndex: number }> {
  const indices = computeOccurrenceIndices(rows);
  return rows.map((row, idx) => ({
    ...row,
    occurrenceIndex: indices[idx] ?? 0,
  }));
}

/**
 * Індекси для commit: рядок із `occurrenceIndex` (з превʼю) бере його як є;
 * рядок без нього (старий клієнт, відредагований у review рядок) отримує
 * найменший ще НЕ зайнятий індекс своєї групи в цьому тілі. Пропуск зайнятих
 * потрібен, щоб рядок без індексу не збігся з id рядка, який несе явний
 * індекс (напр. відредагований опис злив два рядки в одну групу). Коли жоден
 * рядок індексу не має, результат дорівнює `computeOccurrenceIndices`.
 */
function resolveOccurrenceIndices(
  rows: ReadonlyArray<ImportRowIdInput>,
): number[] {
  const taken = new Map<string, Set<number>>();
  for (const row of rows) {
    if (row.occurrenceIndex === undefined) continue;
    const key = groupKey(row);
    const set = taken.get(key) ?? new Set<number>();
    set.add(row.occurrenceIndex);
    taken.set(key, set);
  }
  const next = new Map<string, number>();
  return rows.map((row) => {
    if (row.occurrenceIndex !== undefined) return row.occurrenceIndex;
    const key = groupKey(row);
    const used = taken.get(key);
    let idx = next.get(key) ?? 0;
    while (used?.has(idx)) idx += 1;
    next.set(key, idx + 1);
    return idx;
  });
}

/**
 * Зручний одноразовий виклик для `commit.ts`: визначає `occurrenceIndex` для
 * ВСЬОГО батчу за один прохід (явний індекс із превʼю, а за його відсутності
 * – порядок появи в HTTP-тілі), потім будує id для кожного рядка в тому
 * самому порядку. Повертає масив id тієї самої довжини й порядку, що `rows`.
 */
export function assignImportRowIds(
  userId: string,
  rows: ReadonlyArray<ImportRowIdInput>,
): string[] {
  const occurrenceIndices = resolveOccurrenceIndices(rows);
  return rows.map((row, idx) =>
    buildImportRowId({
      userId,
      date: row.date,
      amountKopiykas: row.amountKopiykas,
      direction: row.direction,
      description: row.description,
      occurrenceIndex: occurrenceIndices[idx] ?? idx,
    }),
  );
}
