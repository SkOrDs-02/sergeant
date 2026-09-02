/**
 * Last validated: 2026-09-01
 * Status: Active
 * Owner: @Skords-01
 *
 * CSV-експорт операцій Фініка — «забрати свої дані у таблицю».
 *
 * ## Навіщо
 *
 * Експорт у Фініку існував лише як JSON-бекап оверлеїв
 * (`useFinykBackupSync.exportData`: бюджети, підписки, категорії) і не мав
 * жодної кнопки в UI — знахідка G5 аудиту. Самих ОПЕРАЦІЙ він не віддавав
 * узагалі, тобто найпростіше «відкрию у таблиці й подивлюсь сам» було
 * недоступне. Toshl дає пʼять форматів, а Monarch критикують саме за
 * відсутність export-parity; для нас це ще й частина обіцянки
 * експорт-гарантії (`product-overview.md` §11).
 *
 * ## Що саме експортується
 *
 * Рівно те, що людина бачить на екрані: відфільтрований список обраного
 * місяця (`useTransactionFilters.filtered`) у тому самому порядку. Не «всі
 * операції за весь час»: експорт, який мовчки віддає більше за видиме,
 * робить із кнопки лотерею — людина не може перевірити результат очима.
 *
 * ## Рішення, які тут не випадкові
 *
 * - **Категорія — ЕФЕКТИВНА, не сира.** Береться `getEffectiveCat`, той
 *   самий резолвер, що малює чип у рядку: ручне перевизначення користувача
 *   має бути у файлі, інакше експорт суперечить екрану.
 * - **Сума — у гривнях із крапкою, з копійками.** У домені гроші живуть
 *   копійками як `number`; ділення на 100 робиться один раз тут. Два знаки
 *   після коми — не замовчування, а правило показу з
 *   [канону §6.1](../../../../../../docs/01-product/model/finyk.md): копійки
 *   лишаються там, «що людина звіряє з чеком чи випискою», і цілі гривні —
 *   лише в аналітиці. Експорт операцій — перший регістр. Крапка, а не кома,
 *   бо роздільник полів — кома: число з комою довелося б брати в лапки, і
 *   частина парсерів прочитала б його як текст.
 * - **Дата — київська.** Той самий `dayKeyFromTx`, яким список групує дні,
 *   тож рядок у файлі і рядок на екрані належать одному дню. Це фінансова
 *   періодизація (Europe/Kyiv), а не особиста доба ADR-0078.
 * - **Знак суми лишається.** Витрата відʼємна, дохід додатний — окрема
 *   колонка «тип» дублює це словом для читача, але сортування й формули в
 *   таблиці працюють по числу.
 */

import type {
  Category,
  Transaction,
} from "@sergeant/finyk-domain/domain/types";
import { exportToCSV, type ExportColumn } from "@shared/lib/ui/export";
import { dayKeyFromTx } from "./transactionsLib";

/** Резолвер ефективної категорії — з `useTransactionFilters`. */
export type EffectiveCategoryResolver = (tx: Transaction) => Category;

/** Рядок CSV. Плоский обʼєкт: `arrayToCSV` не вміє вкладені структури. */
interface CsvRow extends Record<string, unknown> {
  date: string;
  time: string;
  description: string;
  amount: string;
  kind: string;
  category: string;
}

const COLUMNS: ExportColumn<CsvRow>[] = [
  { key: "date", header: "Дата" },
  { key: "time", header: "Час" },
  { key: "description", header: "Опис" },
  { key: "amount", header: "Сума, ₴" },
  { key: "kind", header: "Тип" },
  { key: "category", header: "Категорія" },
];

/** `HH:MM` київського часу; порожньо, якщо мітки немає. */
function kyivTimeLabel(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Intl.DateTimeFormat("uk-UA", {
      timeZone: "Europe/Kyiv",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

/**
 * Копійки → рядок гривень із двома знаками. Крапка як десятковий
 * роздільник — див. шапку файла.
 */
function uahAmount(minorUnits: number): string {
  const value = Number.isFinite(minorUnits) ? minorUnits / 100 : 0;
  return value.toFixed(2);
}

export function toCsvRows(
  transactions: readonly Transaction[],
  getEffectiveCat: EffectiveCategoryResolver,
): CsvRow[] {
  return transactions.map((tx) => ({
    date: dayKeyFromTx(tx.time),
    time: kyivTimeLabel(tx.time),
    description: typeof tx.description === "string" ? tx.description : "",
    amount: uahAmount(tx.amount),
    kind: tx.amount > 0 ? "дохід" : "витрата",
    category: getEffectiveCat(tx).label,
  }));
}

/**
 * Імʼя файла несе місяць, який експортували: у теці завантажень поруч
 * опиняться кілька експортів, і `finyk-2026-09.csv` відрізняється від
 * сусіда без відкривання.
 *
 * `monthKey` — `YYYY-MM`; якщо його немає, лишається просто `finyk.csv`.
 */
export function csvFilename(monthKey?: string | null): string {
  return monthKey ? `finyk-${monthKey}.csv` : "finyk.csv";
}

/** Зібрати й віддати файл. Повертає кількість вивантажених рядків. */
export function exportTransactionsCsv(
  transactions: readonly Transaction[],
  getEffectiveCat: EffectiveCategoryResolver,
  monthKey?: string | null,
): number {
  const rows = toCsvRows(transactions, getEffectiveCat);
  exportToCSV(rows, COLUMNS, csvFilename(monthKey));
  return rows.length;
}
