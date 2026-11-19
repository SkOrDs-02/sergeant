/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Аркуш «Фільтри» в «Операціях» (Ф-2 (б), рішення власника OD-26,
 * 2026-11-18; спека `docs/work/specs/finyk-operations-filters.md`). Чисті
 * функції: сума «від / до», рахунок і тег поверх уже звуженого списку
 * (місяць або діапазон, вкладка, пошук), тож усе разом діє як логічне «і».
 *
 * Сума порівнюється за модулем у копійках: «від 1000 ₴» на вкладці «Всі»
 * ловить і витрату, і надходження, а напрям задає вкладка. Межі включні.
 * Рахунок і тег беруть ті самі ключі, що й Аналітика (`accountKeyOf`,
 * `tagKey`), тож «Готівка на руках» і «Без рахунку» означають там і тут
 * одне й те саме.
 */
import {
  accountKeyOf,
  filterByAccountKey,
} from "@sergeant/finyk-domain/domain/accountBreakdown";
import {
  filterByTagKey,
  tagKey,
  type TxTagsMap,
} from "@sergeant/finyk-domain/domain/tags";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { parseAmountToMinor } from "@shared/lib/format/amount";

export interface TxAdvancedFilters {
  /** Нижня межа суми за модулем, копійки; `null` без межі. */
  minKop: number | null;
  /** Верхня межа суми за модулем, копійки; `null` без межі. */
  maxKop: number | null;
  /** Ключ рахунку (`accountKeyOf`); `null` усі рахунки. */
  accountKey: string | null;
  /** Ключ тегу (`tagKey`); `null` усі теги. */
  tagKey: string | null;
}

export const EMPTY_TX_ADVANCED_FILTERS: TxAdvancedFilters = Object.freeze({
  minKop: null,
  maxKop: null,
  accountKey: null,
  tagKey: null,
});

/** Скільки фільтрів діє; «від / до» разом це один фільтр «сума». */
export function countActiveAdvancedFilters(f: TxAdvancedFilters): number {
  return (
    (f.minKop !== null || f.maxKop !== null ? 1 : 0) +
    (f.accountKey !== null ? 1 : 0) +
    (f.tagKey !== null ? 1 : 0)
  );
}

/**
 * Лишає операції, що проходять усі задані фільтри. Без фільтрів повертає
 * вхідний масив без копії (memo-стабільність, як `filterTransactionsBySearch`).
 */
export function filterTransactionsByAdvanced(
  list: Transaction[],
  f: TxAdvancedFilters,
  tags: TxTagsMap | undefined,
): Transaction[] {
  if (countActiveAdvancedFilters(f) === 0) return list;
  let out: readonly Transaction[] = list;
  if (f.minKop !== null || f.maxKop !== null) {
    const min = f.minKop ?? 0;
    const max = f.maxKop ?? Number.POSITIVE_INFINITY;
    out = out.filter((t) => {
      const abs = Math.abs(Number(t.amount) || 0);
      return abs >= min && abs <= max;
    });
  }
  out = filterByAccountKey(out, f.accountKey);
  out = filterByTagKey(out, tags ?? {}, f.tagKey);
  return [...out];
}

export type AmountBoundResult =
  { ok: true; minor: number | null } | { ok: false };

/** Поле межі суми: порожнє знімає межу, інакше гривні → копійки. */
export function parseAmountBound(raw: string): AmountBoundResult {
  if (raw.trim() === "") return { ok: true, minor: null };
  const parsed = parseAmountToMinor(raw);
  return parsed.ok ? { ok: true, minor: parsed.minor } : { ok: false };
}

/**
 * Рахунки, що є в операціях місяця, від частіших до рідших (рівні лишаються
 * в порядку появи). Обраний ключ, якого цього місяця немає, лишається в
 * списку, щоб людина бачила, що саме вибрано, і могла це зняти.
 */
export function listAccountKeys(
  list: readonly Transaction[],
  selected: string | null,
): string[] {
  const counts = new Map<string, number>();
  for (const t of list) {
    const key = accountKeyOf(t);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
  );
  if (selected !== null && !counts.has(selected)) keys.push(selected);
  return keys;
}

export interface TagOption {
  key: string;
  label: string;
}

/** Теги операцій місяця, від частіших; обраний лишається, як у рахунків. */
export function listTagOptions(
  list: readonly Transaction[],
  tags: TxTagsMap | undefined,
  selected: TagOption | null,
): TagOption[] {
  const byKey = new Map<string, TagOption & { count: number }>();
  for (const t of list) {
    for (const label of tags?.[t.id] ?? []) {
      const key = tagKey(label);
      const row = byKey.get(key);
      if (row) row.count += 1;
      else byKey.set(key, { key, label, count: 1 });
    }
  }
  const rows = [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "uk"),
  );
  const out = rows.map(({ key, label }) => ({ key, label }));
  if (selected !== null && !byKey.has(selected.key)) out.push(selected);
  return out;
}
