/**
 * Last validated: 2026-07-29
 * Status: Active
 *
 * Pure form helpers for ManualExpenseSheet — schema, amount chips,
 * category sort. Extracted so the sheet stays under Hard Rule #18
 * (`max-lines: 600`). No React.
 */
import { z } from "zod";
import {
  amountStringSchema,
  amountStringToHryvnia,
} from "@shared/lib/format/amountSchema";
import {
  classifyDateBound,
  DATE_INVALID_MESSAGE,
} from "@shared/lib/time/dateBounds";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import {
  CANONICAL_TO_MANUAL_LABEL,
  type FrequentCategory,
  type FrequentMerchant,
} from "@sergeant/finyk-domain/domain/personalization";
import {
  CATEGORY_SLUGS,
  isCategorySlug,
  upgradeCategory,
  type CategorySlug,
} from "./manualExpenseCategories";

// Amount suggestion pills. Defaults give a first-run user sane round
// values; personalised «часті» amounts (from top merchants' average
// spend) are merged into the same row and rendered first, marked with
// a small dot so the user can still tell which suggestion is based on
// their own history. One row instead of two separately-labelled rows
// cuts visual chrome without hiding the personalised shortcuts.
const DEFAULT_AMOUNTS = [50, 100, 200, 500];
const MAX_AMOUNT_CHIPS = 6;
const DAY_NOON_UTC = "T12:00:00.000Z";

export function toExpenseInstant(dayKey: string): string {
  // API stores an ISO instant; UTC noon preserves the selected day key
  // without reading the host-local timezone.
  return new Date(Date.parse(`${dayKey}${DAY_NOON_UTC}`)).toISOString();
}

export function buildAmountSuggestions(
  frequentMerchants: FrequentMerchant[] | undefined,
) {
  const frequentRaw: number[] = [];
  for (const m of frequentMerchants || []) {
    if (!m || typeof m.total !== "number" || !m.count) continue;
    const avg = Math.round(m.total / m.count);
    if (avg > 0 && !frequentRaw.includes(avg)) frequentRaw.push(avg);
    if (frequentRaw.length >= 3) break;
  }
  const frequent = frequentRaw.map((v) => ({ value: v, personal: true }));
  const quick = DEFAULT_AMOUNTS.filter((v) => !frequentRaw.includes(v)).map(
    (v) => ({ value: v, personal: false }),
  );
  return [...frequent, ...quick].slice(0, MAX_AMOUNT_CHIPS);
}

// `amount` зберігається як string (бо Input value="" легше описується як
// string); межі й нормалізація — у спільному `parseAmountToMinor`.
// description / category / date — string-поля; category стає порожньою
// після зміни типу й вимагає нового вибору. `date` перевіряється лише на
// жорстке вікно — мʼяке вікно рендериться як попередження в аркуші.
export const expenseFormSchema = z.object({
  description: z.string().max(NAME_MAX_LEN),
  // Без власного повідомлення — канонічні тексти парсера вже точні
  // («Вкажи суму» для порожнього, «Сума має бути більше 0» для нуля).
  amount: amountStringSchema(),
  category: z.string().min(1, "Обери категорію"),
  date: z
    .string()
    .refine(
      (v) => v === "" || classifyDateBound(v) !== "invalid",
      DATE_INVALID_MESSAGE,
    ),
});

/**
 * Гривні для write-path. Схема вже гарантує валідність, тож нуль тут —
 * недосяжна гілка, а не тиха втрата даних.
 */
export const expenseAmountHryvnia = amountStringToHryvnia;

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

/**
 * Сортує доступні підписи категорій за персональною частотою, зберігаючи
 * стабільний порядок для категорій без статистики.
 */
export function sortCategoriesByFrequency(
  frequentCategories: FrequentCategory[] = [],
): CategorySlug[] {
  if (!frequentCategories.length) return CATEGORY_SLUGS;
  // Перетворюємо частотну статистику на індекс slug → rank.
  // manualLabel може зберігати будь-яку з 3 ер — upgradeCategory нормалізує.
  // CANONICAL_TO_MANUAL_LABEL повертає slug (F5b), тож подвійне upgradeCategory
  // — no-op для Era 3; безпечно для Era 2/1.
  const rank = new Map<CategorySlug, number>();
  frequentCategories.forEach((cat, idx) => {
    const rawLabel = cat.manualLabel
      ? upgradeCategory(cat.manualLabel)
      : cat.id
        ? upgradeCategory(CANONICAL_TO_MANUAL_LABEL[cat.id] ?? null)
        : null;
    const slug = rawLabel && isCategorySlug(rawLabel) ? rawLabel : null;
    if (slug && CATEGORY_SLUGS.includes(slug) && !rank.has(slug)) {
      rank.set(slug, idx);
    }
  });
  const withRank = CATEGORY_SLUGS.map((slug, originalIdx) => ({
    slug,
    rank: rank.has(slug) ? (rank.get(slug) ?? Infinity) : Infinity,
    originalIdx,
  }));
  withRank.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.originalIdx - b.originalIdx;
  });
  return withRank.map((x) => x.slug);
}
