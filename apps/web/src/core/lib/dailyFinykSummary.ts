/**
 * Підрахунок щоденного зведення по Фініку (витрати за сьогодні + топ-категорія)
 * та легкі "sticky" сигнали для Hub-дашборду.
 *
 * Чиста функція: приймає `now` та `readLS` (за замовчуванням — localStorage),
 * не має побічних ефектів, легко тестується без дата-mocking.
 *
 * Дизайн-принципи нагадувань (м'які, не токсичні, без гейміфікації):
 * - ніколи не показуємо reminder новим користувачам (без історії витрат)
 * - reminder про "активний день без записів" з'являється лише якщо в інших
 *   модулях (routine/fizruk/nutrition) вже є активність сьогодні — тобто
 *   користувач явно в застосунку, але витрати забув
 * - reminder "не додано витрат сьогодні" активується лише з вечора (>=18:00)
 *   і лише якщо у користувача є регулярність (витрати принаймні у 3 з
 *   останніх 7 днів) — щоб не набридати нерегулярним користувачам
 * - усі нагадування dismissible на один день
 */

import { MCC_CATEGORIES, INCOME_CATEGORIES } from "@finyk/constants";
import { safeReadLS } from "@shared/lib/storage";

interface Category {
  id: string;
  label?: string;
  name?: string;
  mccs?: number[];
}

const ALL_CATS: Category[] = [...MCC_CATEGORIES, ...INCOME_CATEGORIES];

const BUILTIN_LABELS: Record<string, string> = {
  food: "🛒 Продукти",
  cafe: "🍽️ Кафе та ресторани",
  transport: "🚗 Транспорт",
  entertainment: "🎭 Розваги",
  health: "⚕️ Здоров'я",
  shopping: "🛍️ Покупки",
  utilities: "💡 Комунальні",
  other: "💳 Інше",
};

export const DAILY_SUMMARY_DISMISS_KEY = "hub_daily_finyk_dismissed_v1";

export type ReadLS = <T>(key: string, fallback: T) => T;

const defaultReadLS: ReadLS = <T>(key: string, fallback: T): T =>
  safeReadLS<T>(key, fallback) ?? fallback;

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveCatLabel(
  catIdOrMcc: string | number | null | undefined,
  customCategories: Category[],
): string {
  if (!catIdOrMcc || catIdOrMcc === "other") return BUILTIN_LABELS.other;
  const str = String(catIdOrMcc);
  const byId = [...ALL_CATS, ...(customCategories || [])].find(
    (c) => c.id === str,
  );
  if (byId) return byId.label ?? byId.name ?? str;
  if (BUILTIN_LABELS[str]) return BUILTIN_LABELS[str];
  const mcc = Number(str);
  if (Number.isFinite(mcc) && mcc > 0) {
    const byMcc = MCC_CATEGORIES.find(
      (c: Category) => Array.isArray(c.mccs) && c.mccs.includes(mcc),
    );
    if (byMcc) return byMcc.label ?? str;
  }
  return str;
}

interface BankTx {
  id: string;
  amount: number;
  time: number;
  mcc?: number;
}

interface ManualExpense {
  amount: number;
  date: string;
  category?: string;
}

interface TxSplit {
  categoryId?: string;
  amount: number;
}

interface RoutineState {
  habits?: Array<{ id: string; archived?: boolean }>;
  completions?: Record<string, string[]>;
}

interface FizrukWorkout {
  startedAt?: string;
}

interface NutritionLog {
  [dateKey: string]:
    | { meals?: Array<{ macros?: { kcal?: number } }> }
    | undefined;
}

function txTimestampMs(tx: BankTx | null | undefined): number {
  const t = Number(tx?.time);
  if (!Number.isFinite(t)) return NaN;
  return t > 1e10 ? t : t * 1000;
}

function toDayKeyFromTs(ts: number): string | null {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return null;
  return localDateKey(d);
}

/**
 * Повертає набір ключів днів (YYYY-MM-DD), в які користувач додавав витрати
 * протягом останніх `days` днів (не враховуючи сьогодні).
 */
function collectExpenseDaysWithin(
  {
    bankTxs,
    manualExpenses,
    hiddenIds,
    transferIds,
  }: {
    bankTxs: BankTx[];
    manualExpenses: ManualExpense[];
    hiddenIds: Set<string>;
    transferIds: Set<string>;
  },
  todayKey: string,
  days: number,
): Set<string> {
  const keys = new Set<string>();
  const now = Date.now();
  const minMs = now - days * 86_400_000;

  for (const tx of bankTxs) {
    if (!tx || (tx.amount ?? 0) >= 0) continue;
    if (hiddenIds.has(tx.id) || transferIds.has(tx.id)) continue;
    const ms = txTimestampMs(tx);
    if (!Number.isFinite(ms) || ms < minMs) continue;
    const key = toDayKeyFromTs(ms);
    if (key && key !== todayKey) keys.add(key);
  }

  for (const me of manualExpenses) {
    const d = me?.date ? new Date(`${me.date}T00:00:00`) : null;
    if (!d || !Number.isFinite(d.getTime())) continue;
    if (d.getTime() < minMs) continue;
    const key = localDateKey(d);
    if (key !== todayKey) keys.add(key);
  }

  return keys;
}

function isActivityTodayFromModules(now: Date, readLS: ReadLS): boolean {
  const todayKey = localDateKey(now);

  // Routine: будь-яка звичка позначена сьогодні
  const routine = readLS<RoutineState | null>("hub_routine_v1", null);
  if (routine && Array.isArray(routine.habits) && routine.completions) {
    for (const h of routine.habits) {
      if (h?.archived) continue;
      const arr = routine.completions[h.id];
      if (Array.isArray(arr) && arr.includes(todayKey)) return true;
    }
  }

  // Fizruk: тренування, що почалось сьогодні
  const workoutsRaw = readLS<
    FizrukWorkout[] | { workouts?: FizrukWorkout[] } | null
  >("fizruk_workouts_v1", null);
  const workouts: FizrukWorkout[] = Array.isArray(workoutsRaw)
    ? workoutsRaw
    : Array.isArray(workoutsRaw?.workouts)
      ? workoutsRaw.workouts
      : [];
  for (const w of workouts) {
    if (!w?.startedAt) continue;
    const ts = new Date(w.startedAt);
    if (!Number.isFinite(ts.getTime())) continue;
    if (localDateKey(ts) === todayKey) return true;
  }

  // Nutrition: щонайменше один прийом їжі сьогодні
  const log = readLS<NutritionLog | null>("nutrition_log_v1", null);
  const meals = log?.[todayKey]?.meals;
  if (Array.isArray(meals) && meals.length > 0) return true;

  return false;
}

export interface TopCategory {
  id: string;
  label: string;
  amount: number;
  pct: number;
}

export type DailyFinykSummaryStatus =
  | "hidden"
  | "has_expenses"
  | "quiet"
  | "reminder_no_expenses"
  | "reminder_active_day";

export interface DailyFinykSummary {
  status: DailyFinykSummaryStatus;
  todayKey: string;
  todaySpent: number;
  txCount: number;
  topCategory?: TopCategory | null;
}

/**
 * Основна функція. Повертає опис того, що показати на дашборді.
 *
 * Можливі значення `status`:
 * - `hidden`       — картку взагалі не показуємо (новий користувач без історії)
 * - `has_expenses` — є витрати сьогодні, показуємо суму + топ-категорію
 * - `quiet`        — витрат сьогодні нема, користувач нерегулярний, показуємо
 *                    просто neutral-стан ("Сьогодні витрат ще не було")
 * - `reminder_no_expenses` — м'яке нагадування: увечері, користувач регулярний
 * - `reminder_active_day`  — є активність в інших модулях, але фіністс пустий
 */
export function computeDailyFinykSummary({
  now = new Date(),
  readLS = defaultReadLS,
}: {
  now?: Date;
  readLS?: ReadLS;
} = {}): DailyFinykSummary {
  const todayKey = localDateKey(now);
  const hour = now.getHours();

  const txCache = readLS<{ txs?: BankTx[] } | BankTx[] | null>(
    "finyk_tx_cache",
    null,
  );
  const bankTxs: BankTx[] = Array.isArray(txCache)
    ? txCache
    : Array.isArray(txCache?.txs)
      ? txCache.txs
      : [];
  const manualExpenses: ManualExpense[] = (() => {
    const v = readLS<ManualExpense[]>("finyk_manual_expenses_v1", []);
    return Array.isArray(v) ? v : [];
  })();
  const txCategories =
    readLS<Record<string, string>>("finyk_tx_cats", {}) || {};
  const txSplitsRaw = readLS<Record<string, TxSplit[]>>("finyk_tx_splits", {});
  const txSplits: Record<string, TxSplit[]> =
    txSplitsRaw && typeof txSplitsRaw === "object" ? txSplitsRaw : {};
  const hiddenIds = new Set<string>(
    readLS<string[]>("finyk_hidden_txs", []) || [],
  );
  const customCategories = readLS<Category[]>("finyk_custom_cats_v1", []) || [];
  const transferIds = new Set<string>(
    Object.entries(txCategories)
      .filter(([, v]) => v === "internal_transfer")
      .map(([k]) => k),
  );

  // ── Агрегація сьогоднішніх витрат ────────────────────────────────────────
  let todaySpent = 0;
  let txCount = 0;
  const catAmounts: Record<string, number> = {};

  for (const tx of bankTxs) {
    if (!tx || (tx.amount ?? 0) >= 0) continue;
    if (hiddenIds.has(tx.id) || transferIds.has(tx.id)) continue;
    const ms = txTimestampMs(tx);
    if (!Number.isFinite(ms)) continue;
    if (localDateKey(new Date(ms)) !== todayKey) continue;

    const splits = Array.isArray(txSplits[tx.id]) ? txSplits[tx.id] : null;
    if (splits && splits.length > 0) {
      for (const s of splits) {
        if (!s || !s.categoryId || s.categoryId === "internal_transfer") {
          continue;
        }
        const amt = Math.abs(Number(s.amount) || 0);
        if (amt <= 0) continue;
        todaySpent += amt;
        catAmounts[s.categoryId] = (catAmounts[s.categoryId] || 0) + amt;
      }
      txCount++;
    } else {
      const amt = Math.abs(tx.amount / 100);
      todaySpent += amt;
      const catId = txCategories[tx.id] || tx.mcc || "other";
      const key = String(catId);
      catAmounts[key] = (catAmounts[key] || 0) + amt;
      txCount++;
    }
  }

  for (const me of manualExpenses) {
    if (!me || !me.date || me.date !== todayKey) continue;
    const amt = Math.abs(Number(me.amount) || 0);
    if (amt <= 0) continue;
    todaySpent += amt;
    const key = String(me.category || "other");
    catAmounts[key] = (catAmounts[key] || 0) + amt;
    txCount++;
  }

  // ── Топ-категорія ────────────────────────────────────────────────────────
  let topCategory: TopCategory | null = null;
  const catEntries = Object.entries(catAmounts).sort(([, a], [, b]) => b - a);
  if (catEntries.length > 0 && todaySpent > 0) {
    const [catId, amount] = catEntries[0];
    const roundedAmount = Math.round(amount);
    const pct = todaySpent > 0 ? Math.round((amount / todaySpent) * 100) : 0;
    topCategory = {
      id: catId,
      label: resolveCatLabel(catId, customCategories),
      amount: roundedAmount,
      pct,
    };
  }

  // ── Історія (для прийняття рішення про reminder) ─────────────────────────
  const recentDays = collectExpenseDaysWithin(
    { bankTxs, manualExpenses, hiddenIds, transferIds },
    todayKey,
    7,
  );
  const hasAnyHistory =
    bankTxs.some((t) => (t?.amount ?? 0) < 0) || manualExpenses.length > 0;

  if (todaySpent > 0 && topCategory) {
    return {
      status: "has_expenses",
      todayKey,
      todaySpent: Math.round(todaySpent),
      txCount,
      topCategory,
    };
  }

  // Немає витрат сьогодні — вирішуємо, який meaningful state показати.
  if (!hasAnyHistory) {
    return { status: "hidden", todayKey, todaySpent: 0, txCount: 0 };
  }

  const activeToday = isActivityTodayFromModules(now, readLS);
  const isRegular = recentDays.size >= 3;
  const isEvening = hour >= 18;

  if (activeToday) {
    return {
      status: "reminder_active_day",
      todayKey,
      todaySpent: 0,
      txCount: 0,
    };
  }

  if (isRegular && isEvening) {
    return {
      status: "reminder_no_expenses",
      todayKey,
      todaySpent: 0,
      txCount: 0,
    };
  }

  return {
    status: "quiet",
    todayKey,
    todaySpent: 0,
    txCount: 0,
  };
}

export function isDailySummaryDismissedToday({
  now = new Date(),
  readLS = defaultReadLS,
}: {
  now?: Date;
  readLS?: ReadLS;
} = {}): boolean {
  const todayKey = localDateKey(now);
  const v = readLS<{ date?: string } | null>(DAILY_SUMMARY_DISMISS_KEY, null);
  return Boolean(v && v.date === todayKey);
}
