/**
 * Теги операцій (Р6 спеки `finyk-analytics-v3.md`): вільні мітки, кілька на
 * операцію, синк через `finyk_tx_tags`.
 *
 * Р6.5: два написання - один тег, якщо збігаються без регістру й крайових
 * пробілів. Канонічне написання береться з першого вжитку: `addTxTag`
 * підставляє вже відоме написання замість набраного, тож у мапі один тег
 * завжди має одне написання.
 */

import { getTxStatAmount, type TxSplitsLike } from "../lib/transactions.js";

/** id операції → її теги (написання першого вжитку). */
export type TxTagsMap = Readonly<Record<string, readonly string[]>>;

export const TAG_MAX_LEN = 40;
export const MAX_TAGS_PER_TX = 20;

export function tagKey(tag: string): string {
  return tag.trim().toLocaleLowerCase("uk");
}

/** Обрізає крайові пробіли й довжину; порожній рядок - `null`. */
export function normalizeTagInput(raw: string): string | null {
  const trimmed = raw.trim().slice(0, TAG_MAX_LEN).trim();
  return trimmed === "" ? null : trimmed;
}

export interface TagSummary {
  key: string;
  label: string;
  /** Кількість операцій із цим тегом. */
  count: number;
}

/** Усі вжиті теги, від частіших до рідших (для автодоповнення і Налаштувань). */
export function listTags(map: TxTagsMap): TagSummary[] {
  const byKey = new Map<string, TagSummary>();
  for (const tags of Object.values(map)) {
    for (const label of tags) {
      const key = tagKey(label);
      const row = byKey.get(key);
      if (row) row.count += 1;
      else byKey.set(key, { key, label, count: 1 });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk"),
  );
}

/**
 * Додає тег до списку операції. Дубль за ключем ігнорується; якщо тег уже
 * вжито деінде, береться його написання (`known`).
 */
export function addTxTag(
  tags: readonly string[],
  raw: string,
  known: readonly TagSummary[] = [],
): readonly string[] {
  const label = normalizeTagInput(raw);
  if (label === null || tags.length >= MAX_TAGS_PER_TX) return tags;
  const key = tagKey(label);
  if (tags.some((t) => tagKey(t) === key)) return tags;
  const canonical = known.find((t) => t.key === key)?.label ?? label;
  return [...tags, canonical];
}

/** Ставить теги операції; порожній список прибирає операцію з мапи. */
export function setTxTags(
  map: TxTagsMap,
  txId: string,
  tags: readonly string[],
): TxTagsMap {
  const next = { ...map };
  if (tags.length === 0) delete next[txId];
  else next[txId] = tags;
  return next;
}

/**
 * Перейменовує тег на всіх операціях (Р6.6). Якщо нова назва збігається з
 * іншим тегом на тій самій операції, лишається один.
 */
export function renameTagEverywhere(
  map: TxTagsMap,
  fromKey: string,
  newLabelRaw: string,
): TxTagsMap {
  const newLabel = normalizeTagInput(newLabelRaw);
  if (newLabel === null) return map;
  const next: Record<string, readonly string[]> = {};
  for (const [txId, tags] of Object.entries(map)) {
    if (!tags.some((t) => tagKey(t) === fromKey)) {
      next[txId] = tags;
      continue;
    }
    let out: readonly string[] = [];
    for (const t of tags) {
      out = addTxTag(out, tagKey(t) === fromKey ? newLabel : t);
    }
    next[txId] = out;
  }
  return next;
}

/** Знімає тег з усіх операцій (Р6.6). */
export function removeTagEverywhere(map: TxTagsMap, key: string): TxTagsMap {
  const next: Record<string, readonly string[]> = {};
  for (const [txId, tags] of Object.entries(map)) {
    const kept = tags.filter((t) => tagKey(t) !== key);
    if (kept.length > 0) next[txId] = kept;
  }
  return next;
}

export interface TagSpendRow {
  key: string;
  label: string;
  spentMinor: number;
}

/**
 * Витрати за тегами (Р6.4): кожен тег рахує повну суму своїх операцій, тож
 * операція з двома тегами є в обох рядках, а сума рядків може перевищувати
 * витрати періоду. Правило витрат те саме, що в `aggregateSpendingByAccount`.
 */
export function aggregateSpendingByTag(
  transactions: readonly { id: string; amount: number }[] | null | undefined,
  map: TxTagsMap,
  opts: {
    excludedTxIds?: ReadonlySet<string> | Iterable<string> | null | undefined;
    txSplits?: TxSplitsLike | undefined;
  } = {},
): TagSpendRow[] {
  const excluded =
    opts.excludedTxIds instanceof Set
      ? opts.excludedTxIds
      : new Set(opts.excludedTxIds ?? []);
  const byKey = new Map<string, TagSpendRow>();
  for (const tx of transactions ?? []) {
    const tags = map[tx.id];
    if (!tags || tx.amount >= 0 || excluded.has(tx.id)) continue;
    const minor = Math.round(getTxStatAmount(tx, opts.txSplits) * 100);
    if (minor === 0) continue;
    for (const label of tags) {
      const key = tagKey(label);
      const row = byKey.get(key);
      if (row) row.spentMinor += minor;
      else byKey.set(key, { key, label, spentMinor: minor });
    }
  }
  return [...byKey.values()].sort((a, b) => b.spentMinor - a.spentMinor);
}

/** Фільтр Аналітики за тегом; `null` означає «усі операції». */
export function filterByTagKey<T extends { id: string }>(
  transactions: readonly T[],
  map: TxTagsMap,
  key: string | null,
): readonly T[] {
  if (key === null) return transactions;
  return transactions.filter((tx) =>
    (map[tx.id] ?? []).some((t) => tagKey(t) === key),
  );
}
