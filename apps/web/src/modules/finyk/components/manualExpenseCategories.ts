/**
 * Last validated: 2026-05-29
 * Status: Active
 *
 * Category-slug system for ManualExpenseSheet. Extracted from
 * `ManualExpenseSheet.tsx` so that component stays under the 600-LOC
 * `max-lines` gate (Hard Rule #18 / initiative 0013). Pure logic + data —
 * no React.
 */
import type { IconName } from "@shared/components/ui/Icon";
import {
  legacyManualCategoryId,
  MANUAL_EXPENSE_PICKER,
  MANUAL_EXPENSE_TAXONOMY,
} from "@sergeant/finyk-domain/lib/manualTaxonomy";

// ─── Category slug system (F5b, 2026-05) ────────────────────────────────────
//
// Era 1 — pre-emoji (legacy): category stored as bare UA label, e.g. "їжа",
//   "транспорт". Upgraded at read-time via LEGACY_RAW_TO_SLUG.
//
// Era 2 — emoji-prefixed (legacy): "🍴 їжа", "🚗 транспорт". Upgraded at
//   read-time by stripping leading emoji, then mapping the UA label to slug
//   via UA_LABEL_TO_SLUG.
//
// Era 3 — slug (current): "food", "transport", "groceries", etc. Used
//   directly. Write path always emits a slug.
//
// Historical records in localStorage are NOT batch-migrated. upgradeCategory()
// normalises them on every read, then the result (always a slug) is stored
// on submit.

/** Typed category slugs. */
export type CategorySlug =
  | "food"
  | "groceries"
  | "cafe"
  | "transport"
  | "entertainment"
  | "health"
  | "shopping"
  | "utilities"
  | "tech"
  | "subscriptions"
  | "education"
  | "travel"
  | "other";

export interface CategoryDisplay {
  iconName: IconName;
  /** Human-readable Ukrainian label shown in the chip. */
  label: string;
}

/**
 * Canonical display map: slug → { iconName, label }.
 * Single source of truth for rendering. No emoji — icons only.
 *
 * Похідна від `MANUAL_EXPENSE_TAXONOMY` (`@sergeant/finyk-domain`): та
 * сама таблиця живить підпис у резолверах домену, колірний аліас і
 * іконку в рядку транзакції. Доки список був продубльований тут, вони
 * розходились непомітно — `utilities` мала колір, але не мала іконки.
 */
export const CATEGORY_DISPLAY: Record<CategorySlug, CategoryDisplay> =
  Object.fromEntries(
    MANUAL_EXPENSE_TAXONOMY.map((d) => [
      d.id,
      { iconName: d.iconName as IconName, label: d.label },
    ]),
  ) as Record<CategorySlug, CategoryDisplay>;

/**
 * The ordered list of slugs used for the category picker.
 *
 * Свідомо БЕЗ legacy-аліасів (`MANUAL_EXPENSE_PICKER`), на відміну від
 * `CATEGORY_DISPLAY` вище — той лишається повним. Якби `groceries` зник
 * і звідти, `isCategorySlug("groceries")` став би `false`, а
 * `upgradeCategory` звів би вже збережені записи до «Інше» — тобто
 * рівно та підміна даних, від якої застерігає
 * `upgradeCategoryAllowingCustom` нижче.
 */
export const CATEGORY_SLUGS: CategorySlug[] = MANUAL_EXPENSE_PICKER.map(
  (d) => d.id as CategorySlug,
);

export const DEFAULT_CATEGORY: CategorySlug = "other";

// Ери 1–2 (голий і емодзі-префіксований український підпис) резолвить
// `legacyManualCategoryId` із `@sergeant/finyk-domain`. Раніше та сама
// мапа стояла тут окремим літералом — пʼятою копією списку категорій, і
// саме вона розійшлась із доменом: рядок транзакції показував «Інше»
// там, де форма редагування показувала правильну категорію, бо мапу
// бачила лише форма.
/** Returns true if the value is a known slug. */
export function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(CATEGORY_DISPLAY, value);
}

/**
 * Normalises any stored category value to a CategorySlug.
 *
 * Era 3 (slug): returned directly if recognised.
 * Era 2 (emoji-prefixed): emoji stripped, UA label looked up in UA_LABEL_TO_SLUG.
 * Era 1 (bare UA label): looked up directly in LEGACY_RAW_TO_SLUG.
 * Unknown: falls back to "other".
 *
 * @example
 * upgradeCategory("food")      // Era 3 → "food"
 * upgradeCategory("🍴 їжа")   // Era 2 → "food"
 * upgradeCategory("їжа")       // Era 1 → "food"
 * upgradeCategory(null)         // → "other"
 */
export function upgradeCategory(raw: string | null | undefined): CategorySlug {
  if (!raw) return DEFAULT_CATEGORY;

  const trimmed = raw.trim();

  // Era 3: known slug — use directly.
  if (isCategorySlug(trimmed)) return trimmed;

  // Ери 1–2 — спільний резолвер домену (емодзі зрізається всередині).
  const fromLabel = legacyManualCategoryId(trimmed);
  if (fromLabel && isCategorySlug(fromLabel)) return fromLabel;

  // Unknown legacy value — graceful fallback.
  return DEFAULT_CATEGORY;
}

/**
 * `upgradeCategory`, який не зʼїдає користувацькі категорії.
 *
 * `upgradeCategory` нормалізує будь-яке невідоме значення в
 * `DEFAULT_CATEGORY` — і це правильно для легасі-рядків трьох ер. Але id
 * власної категорії теж «невідомий» цій таксономії, тож на шляху
 * збереження ручної витрати він мовчки ставав «Інше»: людина обирала
 * «Кава з друзями», а в списку зʼявлялось інше слово. Підміна даних без
 * сліду гірша за відмову — той самий висновок, що й у `parseDecimalInput`.
 *
 * Тому власні id перевіряються ПЕРШИМИ і повертаються як є. Колізія з
 * вбудованим слагом нешкідлива: рядок той самий.
 *
 * Повертає `string`, а не `CategorySlug`: власна категорія за визначенням
 * поза union-ом, і тип тут має про це чесно попереджати, а не вдавати,
 * що будь-яка категорія витрати — вбудована.
 */
export function upgradeCategoryAllowingCustom(
  raw: string | null | undefined,
  customIds: ReadonlySet<string>,
): string {
  const trimmed = raw?.trim();
  if (trimmed && customIds.has(trimmed)) return trimmed;
  return upgradeCategory(raw);
}
