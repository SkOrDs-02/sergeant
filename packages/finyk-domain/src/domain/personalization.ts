// Rule-based персоналізація Фініка.
//
// Чисті селектори (без React / localStorage / window) над уже завантаженими
// банківськими транзакціями та manual-витратами. Використовуються у quick add,
// dashboard та рекомендаціях, щоб показувати найрелевантніші категорії
// і мерчантів «за звичкою» користувача.
//
// Склад "частотності" — прості правила:
//  - вікно спостереження (дефолт 60 днів);
//  - пріоритет: count → total → lastUsedTs;
//  - для мерчантів додатково зберігаємо найчастішу категорію
//    (щоб quick add міг підставити її автоматично).
// Без ML, без ваг на зразок TF-IDF — тільки підрахунки + сортування.
import { getCategory } from "../utils";
import { INTERNAL_TRANSFER_ID } from "../constants";
import type { Category, Transaction } from "./types";

/** Manual-витрата як зберігається у localStorage (`finyk_manual_expenses_v1`). */
export interface ManualExpense {
  id: string;
  date: string;
  description?: string;
  amount: number;
  category?: string;
}

export interface FrequentCategory {
  /** Canonical id (food/transport/…), custom cat id, або підпис manual-категорії. */
  id: string;
  /** Читабельна мітка для UI. */
  label: string;
  /** Скільки разів використано у вікні. */
  count: number;
  /** Сума витрат у вікні, UAH. */
  total: number;
  /** Останнє використання, ms epoch. */
  lastUsedTs: number;
  /** Підпис manual-категорії як його вводить користувач (якщо є). */
  manualLabel?: string;
}

export interface FrequentMerchant {
  /** Відображувана назва (перша зустрінута форма). */
  name: string;
  /** Нормалізований ключ для групування. */
  key: string;
  count: number;
  total: number;
  lastUsedTs: number;
  /** Найчастіша категорія для цього мерчанта (для prefill у quick add). */
  suggestedCategoryId?: string;
  /** Manual-label, який у ManualExpenseSheet відповідає `suggestedCategoryId`. */
  suggestedManualCategory?: string;
}

export interface PersonalizationOptions {
  /** Скільки днів дивитись назад. 0/негативні = весь час. */
  windowDays?: number;
  /** Максимум елементів у результаті. */
  limit?: number;
  /** Користувацькі категорії (для резолву id → label). */
  customCategories?: Category[];
  /** Довідкова «поточна» дата — корисно у тестах. */
  now?: Date;
  /** Id транзакцій, які треба ігнорувати (excludedTxIds / transfers). */
  excludedTxIds?: Set<string> | Iterable<string>;
  /** Оверрайди категорій з finyk_tx_cats. */
  txCategories?: Record<string, string | undefined>;
}

// Мапа manual-підписів (як у ManualExpenseSheet) на canonical id з MCC_CATEGORIES.
// Якщо користувач вводить щось інше (custom manual-категорія) — зберігаємо
// «як є» і використовуємо сам підпис як id.
const MANUAL_CATEGORY_ID_MAP: Record<string, string> = {
  їжа: "food",
  продукти: "food",
  "кафе та ресторани": "restaurant",
  кафе: "restaurant",
  транспорт: "transport",
  підписки: "subscriptions",
  розваги: "entertainment",
  "здоров'я": "health",
  здоров: "health",
  одяг: "shopping",
  покупки: "shopping",
  комунальні: "utilities",
  техніка: "shopping",
  спорт: "sport",
  краса: "beauty",
  подорожі: "travel",
  навчання: "education",
  інше: "other",
};

// Зворотний пошук: canonical id → відповідний manual-label, який є серед
// кнопок у ManualExpenseSheet (щоб при кліку по картці у dashboard виставляти
// коректний вибір у списку). Повертаємо нові emoji-labels — `ManualExpenseSheet`
// also runs them through `upgradeCategory` to stay tolerant of legacy strings.
export const CANONICAL_TO_MANUAL_LABEL: Record<string, string> = {
  food: "🍴 їжа",
  restaurant: "🍔 кафе та ресторани",
  transport: "🚗 транспорт",
  entertainment: "🎮 розваги",
  health: "💊 здоров'я",
  shopping: "🛍️ покупки",
  utilities: "🏠 комунальні",
  subscriptions: "🎵 підписки",
  sport: "🎮 розваги",
  beauty: "🛍️ покупки",
  travel: "✈️ подорожі",
  education: "📚 навчання",
  other: "🏷 інше",
};

// Labels in `ManualExpenseSheet` are now emoji-prefixed (e.g. "🍴 їжа").
// Strip leading non-letter / non-digit runs (emoji, ZWJ sequences,
// variation selectors, whitespace) before lookup so map keys stay
// stable across legacy and new entries.
function stripLeadingSymbols(str: string): string {
  let i = 0;
  // `str[i]` під strict noUncheckedIndexedAccess — `string | undefined`,
  // але цикл уже обмежений `i < str.length`, тож non-null-assert безпечний.
  while (i < str.length && !/[\p{L}\p{N}]/u.test(str[i]!)) i++;
  return str.slice(i);
}

function normalizeManualLabel(label: string | undefined | null): string {
  return stripLeadingSymbols((label || "").trim())
    .trim()
    .toLocaleLowerCase("uk-UA");
}

/** Підпис manual-категорії → canonical id або сам підпис (для custom). */
export function manualCategoryToCanonicalId(label: string | undefined): string {
  const norm = normalizeManualLabel(label);
  if (!norm) return "other";
  return MANUAL_CATEGORY_ID_MAP[norm] || norm;
}

function toTimestampMs(tx: Transaction): number {
  if (!tx || !tx.time) return 0;
  return tx.time > 1e10 ? tx.time : tx.time * 1000;
}

function toManualTs(me: ManualExpense): number {
  const ts = new Date(me.date).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function buildWindowFilter(
  now: Date,
  windowDays: number | undefined,
): (ts: number) => boolean {
  if (!windowDays || windowDays <= 0) return () => true;
  const cutoff = now.getTime() - windowDays * 86_400_000;
  return (ts) => ts >= cutoff;
}

function toExcludedSet(
  excluded: PersonalizationOptions["excludedTxIds"],
): Set<string> {
  if (excluded instanceof Set) return excluded;
  return new Set<string>(excluded || []);
}

function resolveCategoryLabel(
  id: string,
  customCategories: Category[] = [],
  manualLabel?: string,
): string {
  // Канонічні MCC-категорії: повертаємо їх label (з емодзі).
  // Ми не імпортуємо MCC_CATEGORIES безпосередньо — resolveExpenseCategoryMeta
  // робить те саме, але вже тягне shared/utils. Щоб не ускладнювати типізацію,
  // викликаємо getCategory з "порожнім" описом і overrideId.
  const meta = getCategory("", 0, id, customCategories);
  if (meta && meta.id === id) return meta.label;
  if (manualLabel) return manualLabel;
  return id;
}

/**
 * Топ категорій користувача (банк + manual) за лічильником використання
 * у вікні `windowDays` днів.
 */
export function getFrequentCategories(
  transactions: readonly Transaction[] | null | undefined,
  manualExpenses: readonly ManualExpense[] | null | undefined,
  opts: PersonalizationOptions = {},
): FrequentCategory[] {
  const {
    windowDays = 60,
    limit = 8,
    customCategories = [],
    now = new Date(),
    excludedTxIds,
    txCategories = {},
  } = opts;
  const inWindow = buildWindowFilter(now, windowDays);
  const excluded = toExcludedSet(excludedTxIds);

  const byId = new Map<string, FrequentCategory>();

  const add = (
    id: string,
    label: string,
    amount: number,
    ts: number,
    manualLabel?: string,
  ) => {
    if (!id) return;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, {
        id,
        label,
        count: 1,
        total: amount,
        lastUsedTs: ts,
        manualLabel,
      });
      return;
    }
    prev.count += 1;
    prev.total += amount;
    if (ts > prev.lastUsedTs) prev.lastUsedTs = ts;
    if (!prev.manualLabel && manualLabel) prev.manualLabel = manualLabel;
  };

  const txList = Array.isArray(transactions) ? transactions : [];
  for (const tx of txList) {
    if (!tx || excluded.has(tx.id)) continue;
    // Враховуємо лише витрати — для цілей «quick add» та рекомендацій.
    if (typeof tx.amount !== "number" || tx.amount >= 0) continue;
    const ts = toTimestampMs(tx);
    if (!inWindow(ts)) continue;
    const overrideId = txCategories[tx.id];
    const cat = getCategory(
      tx.description || "",
      tx.mcc || 0,
      overrideId,
      customCategories,
    );
    if (!cat || cat.id === INTERNAL_TRANSFER_ID) continue;
    add(cat.id, cat.label, Math.abs(tx.amount / 100), ts);
  }

  const manualList = Array.isArray(manualExpenses) ? manualExpenses : [];
  for (const me of manualList) {
    if (!me) continue;
    const ts = toManualTs(me);
    if (!inWindow(ts)) continue;
    const canonicalId = manualCategoryToCanonicalId(me.category);
    if (canonicalId === INTERNAL_TRANSFER_ID) continue;
    const label = resolveCategoryLabel(
      canonicalId,
      customCategories,
      me.category,
    );
    add(canonicalId, label, Math.abs(Number(me.amount) || 0), ts, me.category);
  }

  const arr = Array.from(byId.values());
  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.total !== a.total) return b.total - a.total;
    return b.lastUsedTs - a.lastUsedTs;
  });
  return arr.slice(0, limit);
}

function merchantKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");
}

/**
 * Частотний топ мерчантів (банк + manual-витрати) за вікном `windowDays`.
 */
export function getFrequentMerchants(
  transactions: readonly Transaction[] | null | undefined,
  manualExpenses: readonly ManualExpense[] | null | undefined,
  opts: PersonalizationOptions = {},
): FrequentMerchant[] {
  const {
    windowDays = 60,
    limit = 5,
    customCategories = [],
    now = new Date(),
    excludedTxIds,
    txCategories = {},
  } = opts;
  const inWindow = buildWindowFilter(now, windowDays);
  const excluded = toExcludedSet(excludedTxIds);

  interface Bucket extends FrequentMerchant {
    categoryCounts: Map<string, { count: number; manualLabel?: string }>;
  }
  const byKey = new Map<string, Bucket>();

  const addHit = (
    rawName: string,
    amount: number,
    ts: number,
    categoryId: string,
    manualLabel?: string,
  ) => {
    const name = rawName.trim();
    if (!name) return;
    const key = merchantKey(name);
    if (!key) return;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        name,
        key,
        count: 0,
        total: 0,
        lastUsedTs: 0,
        categoryCounts: new Map(),
      };
      byKey.set(key, bucket);
    }
    bucket.count += 1;
    bucket.total += amount;
    if (ts > bucket.lastUsedTs) bucket.lastUsedTs = ts;
    const prev = bucket.categoryCounts.get(categoryId) || {
      count: 0,
      manualLabel,
    };
    bucket.categoryCounts.set(categoryId, {
      count: prev.count + 1,
      manualLabel: prev.manualLabel || manualLabel,
    });
  };

  const txList = Array.isArray(transactions) ? transactions : [];
  for (const tx of txList) {
    if (!tx || excluded.has(tx.id)) continue;
    if (typeof tx.amount !== "number" || tx.amount >= 0) continue;
    const ts = toTimestampMs(tx);
    if (!inWindow(ts)) continue;
    const overrideId = txCategories[tx.id];
    const cat = getCategory(
      tx.description || "",
      tx.mcc || 0,
      overrideId,
      customCategories,
    );
    if (!cat || cat.id === INTERNAL_TRANSFER_ID) continue;
    addHit(
      tx.merchant || tx.description || "",
      Math.abs(tx.amount / 100),
      ts,
      cat.id,
    );
  }

  const manualList = Array.isArray(manualExpenses) ? manualExpenses : [];
  for (const me of manualList) {
    if (!me) continue;
    const ts = toManualTs(me);
    if (!inWindow(ts)) continue;
    const canonicalId = manualCategoryToCanonicalId(me.category);
    if (canonicalId === INTERNAL_TRANSFER_ID) continue;
    addHit(
      me.description || "",
      Math.abs(Number(me.amount) || 0),
      ts,
      canonicalId,
      me.category,
    );
  }

  const arr: FrequentMerchant[] = Array.from(byKey.values()).map((bucket) => {
    let bestId: string | undefined;
    let bestCount = 0;
    let bestManual: string | undefined;
    for (const [id, info] of bucket.categoryCounts) {
      if (info.count > bestCount) {
        bestId = id;
        bestCount = info.count;
        bestManual = info.manualLabel;
      }
    }
    return {
      name: bucket.name,
      key: bucket.key,
      count: bucket.count,
      total: Math.round(bucket.total),
      lastUsedTs: bucket.lastUsedTs,
      suggestedCategoryId: bestId,
      suggestedManualCategory:
        bestManual ||
        (bestId ? CANONICAL_TO_MANUAL_LABEL[bestId] : undefined) ||
        undefined,
    };
  });

  arr.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.total !== a.total) return b.total - a.total;
    return b.lastUsedTs - a.lastUsedTs;
  });
  // Ховаємо випадкові одноразові мерчанти — персоналізація має сенс від 2-го
  // використання; limit лишаємо прозорим — виклик може взяти менше.
  return arr.filter((m) => m.count >= 2).slice(0, limit);
}
