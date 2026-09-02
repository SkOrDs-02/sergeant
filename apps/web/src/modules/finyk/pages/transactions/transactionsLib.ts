import { STORAGE_KEYS } from "@sergeant/shared";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import type { TxSplit, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";

export const DAY_COLLAPSE_KEY = STORAGE_KEYS.FINYK_TX_DAY_COLLAPSE;

/**
 * `YYYY-MM-DD` shape validator for the `dayFilter` deep-link
 * (`/finyk/transactions?date=...`). The URL param accepts either the
 * `"today"` shortcut (Overview's «Операції за сьогодні» row) or a concrete
 * Kyiv day key tapped from `MonthStrip` — anything else is ignored (falls
 * back to «показати всі дні» instead of an empty list).
 */
export const DAY_FILTER_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Localised date for the day-filter chip (`12 вересня`). UTC-anchored
 * parse — the same trick as `formatStickyDayLabel` below — so the label
 * doesn't drift a day off on a device west of UTC.
 */
export function formatDayFilterDate(dayKey: string): string {
  const [y = 1970, m = 1, d = 1] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export type DayCollapseOverrides = Record<string, boolean>;

/**
 * Build a `YYYY-MM-DD` key from a Mono UNIX-seconds timestamp.
 * Used to bucket transactions into days for the GroupedVirtuoso list.
 */
export function dayKeyFromTx(ts: number): string {
  // Kyiv-anchored (domain invariant): host-local components bucketed a
  // 23:30-Kyiv purchase under the wrong day on non-Kyiv devices and
  // disagreed with manual-expense keys (Kyiv via toLocalISODate).
  return getKyivDayKey(ts * 1000);
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
 * Мінімальний контракт ручного запису для авто-розгортання його дня.
 * Навмисно вужчий за `ManualExpense` — хелпер має приймати будь-який
 * список з `id` + `date` без casting-у з боку викликача.
 */
export interface ManualExpenseDayInput {
  id: string;
  date?: string | undefined;
}

/**
 * Day-key групи, у яку потрапить ручний запис. Рахуємо тим самим
 * `dayKeyFromTx`, що й групування списку (`manualExpenseToTransaction`
 * кладе `time = Date.parse(date) / 1000`), інакше «розгорнутий» ключ міг
 * би не збігтися з ключем реальної групи. `null` — якщо дати немає або
 * вона не парситься.
 */
export function manualExpenseDayKey(
  date: string | null | undefined,
): string | null {
  if (!date) return null;
  const ms = new Date(date).getTime();
  if (!Number.isFinite(ms)) return null;
  return dayKeyFromTx(Math.floor(ms / 1000));
}

/**
 * День щойно доданого ручного запису — для авто-розгортання групи
 * (знахідка B6: перша витрата «зникала» у згорнутій групі одразу після
 * створення, бо всі дні згорнуті за замовчуванням).
 *
 * Повертає day-key ЛИШЕ коли відносно `knownIds` зʼявився рівно один
 * новий запис — тобто це користувацьке додавання, а не bulk-гідрація
 * списку (SQLite read-overlay / cloud-pull підміняють масив цілком).
 * Ліміт «рівно один» — навмисний запобіжник: масове доливання не має
 * розгортати пів місяця.
 */
export function findAddedManualExpenseDayKey(
  knownIds: ReadonlySet<string>,
  expenses: readonly ManualExpenseDayInput[] | null | undefined,
): string | null {
  if (!expenses) return null;
  let added: ManualExpenseDayInput | null = null;
  for (const e of expenses) {
    if (!e || knownIds.has(e.id)) continue;
    if (added) return null;
    added = e;
  }
  return added ? manualExpenseDayKey(added.date) : null;
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

// Nominative weekday names, indexed by `Date.getDay()` (0=Sunday).
// As a group heading the weekday must read nominative ("субота, 2 травня").
// `toLocaleDateString(weekday:"long")` is unreliable here: some browser
// CLDR builds emit the accusative standalone form for uk ("суботу"), so we
// supply the weekday ourselves and let Intl format only the day + month
// (the genitive month "травня" is stable across engines).
const STICKY_WEEKDAYS_NOMINATIVE = [
  "неділя",
  "понеділок",
  "вівторок",
  "середа",
  "четвер",
  "пʼятниця",
  "субота",
] as const;

/**
 * Localised day label rendered inside the sticky header.
 * Today / Yesterday get word labels; everything else falls back to
 * the long Ukrainian weekday + day-of-month.
 */
export function formatStickyDayLabel(key: string): string {
  // Domain invariant: day keys are Europe/Kyiv-anchored (manual-expense
  // dates default to the Kyiv date via `toLocalISODate`). «Сьогодні» /
  // «Вчора» must therefore derive from the KYIV day key too — the old
  // host-local `new Date().setHours(0)` baseline drifted one day in the
  // 00:00–03:00 Kyiv window on non-Kyiv runtimes (UTC CI rendered a
  // fresh expense under a weekday header instead of «Сьогодні»).
  const todayKey = getKyivDayKey();
  if (key === todayKey) return "Сьогодні";

  const yesterdayKey = getKyivDayKey(new Date(Date.now() - 86400000));
  if (key === yesterdayKey) return "Вчора";
  const [y = 1970, m = 1, da = 1] = key.split("-").map(Number);
  // UTC-парс календарної дати ключа: weekday/day/month цієї дати
  // однакові в будь-якій TZ, host-local getters тут не потрібні.
  const d = new Date(Date.UTC(y, m - 1, da));
  const weekday = STICKY_WEEKDAYS_NOMINATIVE[d.getUTCDay()] ?? "";
  const dayMonth = d.toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return `${weekday}, ${dayMonth}`;
}
