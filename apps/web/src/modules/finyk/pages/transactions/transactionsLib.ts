import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import type { TxSplit, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";

export const DAY_COLLAPSE_KEY = STORAGE_KEYS.FINYK_TX_DAY_COLLAPSE;

export type DayCollapseOverrides = Record<string, boolean>;

/**
 * Build a `YYYY-MM-DD` key from a Mono UNIX-seconds timestamp.
 * Used to bucket transactions into days for the GroupedVirtuoso list.
 */
export function dayKeyFromTx(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Read persisted day-expand overrides. Returns an empty object on
 * missing / corrupt JSON / private-mode storage so the UI defaults
 * to "all collapsed".
 */
export function readDayCollapse(): DayCollapseOverrides {
  const parsed = safeReadLS<unknown>(DAY_COLLAPSE_KEY, null);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as DayCollapseOverrides;
  }
  return {};
}

/**
 * Persist day-expand overrides. Drop silently on quota / private-mode
 * failures — losing the preference is preferable to throwing.
 */
export function writeDayCollapse(v: DayCollapseOverrides): void {
  safeWriteLS(DAY_COLLAPSE_KEY, v);
}

/**
 * Days are collapsed by default; the user explicitly toggles them
 * open via the sticky day-header. The third arg `_todayKey` is kept
 * in the signature on purpose: a feature-toggle could re-introduce
 * "today is always expanded" behaviour without changing call-sites.
 */
export function isDayExpanded(
  overrides: DayCollapseOverrides,
  key: string,
  _todayKey: string,
): boolean {
  return !!overrides[key];
}

/**
 * Мінімальний контракт транзакції для підрахунку підсумку дня. Навмисно
 * вужчий за `Transaction` з finyk-domain — гарантує, що `computeDaySummary`
 * приймає будь-який список з `amount` / `id` без додаткового casting-у
 * з боку викликача (MonoStatementItem, manualExpenseTx тощо).
 */
export interface DaySummaryTx {
  id: string;
  amount: number;
}

export interface DaySummary {
  /**
   * Знакова сума дня в мінорних одиницях (копійках). Позитивне = дохід,
   * негативне = витрата. Узгоджено з `fmtAmt`, що очікує копійки.
   */
  total: number;
  /** Загальна кількість транзакцій у групі (включно з «не в статистиці»). */
  count: number;
  /** Скільки транзакцій реально враховано у `total`. */
  statCount: number;
}

function splitStatAmount(splits: readonly TxSplit[]): number {
  // Сума спліт-частин, що НЕ є внутрішнім переказом. Повертаємо в
  // мінорних одиницях, щоб не ламати UI-формат (fmtAmt ділить на 100).
  let sum = 0;
  for (const s of splits) {
    if (s.categoryId === INTERNAL_TRANSFER_ID) continue;
    const a = Number(s.amount) || 0;
    sum += a;
  }
  return Math.round(sum * 100);
}

/**
 * Підсумок однієї денної групи транзакцій для sticky-header-а.
 *
 * Враховує ті самі виключення, що й `statTx` у `Transactions.tsx`:
 * - `excludedTxIds` (приховані + внутрішні перекази + дебіторка + явне «не в статистиці»)
 * - `txSplits` — якщо транзакція має спліт, то у підсумок йде лише сума
 *   частин, що НЕ позначені як внутрішній переказ.
 *
 * Відповідає правилу з AGENTS.md: «перекази між своїми рахунками …
 * є neted у budget calculations, not summed».
 */
export function computeDaySummary(
  items: readonly DaySummaryTx[],
  opts: {
    excludedTxIds?: ReadonlySet<string> | null;
    txSplits?: TxSplitsMap | null;
  } = {},
): DaySummary {
  const excluded = opts.excludedTxIds;
  const splitsMap = opts.txSplits ?? {};
  let total = 0;
  let statCount = 0;
  for (const t of items) {
    const count = !excluded || !excluded.has(t.id);
    if (!count) continue;
    const splits = splitsMap[t.id];
    const amt = Number(t.amount) || 0;
    if (splits && splits.length > 0) {
      const sign = amt >= 0 ? 1 : -1;
      total += sign * splitStatAmount(splits);
    } else {
      total += amt;
    }
    statCount++;
  }
  return { total, count: items.length, statCount };
}

/**
 * Localised day label rendered inside the sticky header.
 * Today / Yesterday get word labels; everything else falls back to
 * the long Ukrainian weekday + day-of-month.
 */
export function formatStickyDayLabel(key: string): string {
  const [y, m, da] = key.split("-").map(Number);
  const d = new Date(y, m - 1, da);
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const d0 = new Date(d);
  d0.setHours(0, 0, 0, 0);
  const diffDays = Math.round((t0.getTime() - d0.getTime()) / 86400000);
  if (diffDays === 0) return "Сьогодні";
  if (diffDays === 1) return "Вчора";
  return d.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
