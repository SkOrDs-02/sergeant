/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Текстовий пошук в «Операціях» (Ф-2 (а), рішення власника OD-26,
 * 2026-11-18). Чиста функція: шукає за описом, назвою продавця, нотаткою і
 * тегом у вже звуженому списку (місяць або діапазон, вкладка-фільтр), тож
 * разом із вкладкою діє як логічне «і».
 *
 * Нотатки й теги лежать в окремих мапах за id операції. Для ручного запису
 * id у списку — `manual_<id>` (`manualExpenseToTransaction`), і саме під
 * цим ключем аркуш пише теги (`manualLinkKey`), тож окремої гілки не треба.
 */
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

export interface TransactionSearchSources {
  notes?: Readonly<Record<string, string | undefined>> | undefined;
  tags?: Readonly<Record<string, readonly string[]>> | undefined;
}

/** Обрізає, зводить регістр (uk) і всі варіанти апострофа до одного. */
export function normalizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase("uk")
    .replace(/[ʼ’`']/g, "'")
    .replace(/\s+/g, " ");
}

function haystackOf(t: Transaction, sources: TransactionSearchSources): string {
  const parts: string[] = [t.description ?? ""];
  if (typeof t.merchant === "string") parts.push(t.merchant);
  if (typeof t.note === "string") parts.push(t.note);
  const note = sources.notes?.[t.id];
  if (note) parts.push(note);
  const tags = sources.tags?.[t.id];
  if (tags) parts.push(...tags);
  return normalizeSearchQuery(parts.join(" "));
}

/**
 * Лишає операції, у яких кожне слово запиту знайдено хоч в одному полі.
 * Порожній запит повертає вхідний масив без копії (memo-стабільність).
 */
export function filterTransactionsBySearch(
  list: Transaction[],
  rawQuery: string,
  sources: TransactionSearchSources,
): Transaction[] {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) return list;
  const words = query.split(" ");
  return list.filter((t) => {
    const hay = haystackOf(t, sources);
    return words.every((w) => hay.includes(w));
  });
}
