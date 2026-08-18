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

/**
 * Зручний одноразовий виклик для `commit.ts`: рахує `occurrenceIndex` для
 * ВСЬОГО батчу за один прохід (стабільно відносно порядку `rows` у самому
 * HTTP-тілі запиту), потім будує id для кожного рядка в тому самому
 * порядку. Повертає масив id тієї самої довжини й порядку, що `rows`.
 */
export function assignImportRowIds(
  userId: string,
  rows: ReadonlyArray<RowKeyFields>,
): string[] {
  const occurrenceIndices = computeOccurrenceIndices(rows);
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
