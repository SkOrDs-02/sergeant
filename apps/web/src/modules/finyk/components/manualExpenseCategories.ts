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

// Era 1 upgrade map: bare UA label (lower-case) → slug.
// Covers all the pre-emoji strings that were stored before the emoji era.
const LEGACY_RAW_TO_SLUG: Record<string, CategorySlug> = {
  їжа: "food",
  продукти: "groceries",
  "кафе та ресторани": "cafe",
  кафе: "cafe",
  транспорт: "transport",
  розваги: "entertainment",
  "здоров'я": "health",
  здоров: "health",
  одяг: "shopping",
  покупки: "shopping",
  комунальні: "utilities",
  техніка: "tech",
  підписки: "subscriptions",
  навчання: "education",
  подорожі: "travel",
  інше: "other",
};

// Era 2 upgrade map: stripped UA label from emoji string → slug.
// Keys are the labels that appear AFTER the emoji prefix (lower-case).
// Identical to LEGACY_RAW_TO_SLUG — the strip makes them equivalent,
// so we reuse the same map for both eras.
const UA_LABEL_TO_SLUG = LEGACY_RAW_TO_SLUG;

/** Returns true if the value is a known slug. */
export function isCategorySlug(value: string): value is CategorySlug {
  return Object.prototype.hasOwnProperty.call(CATEGORY_DISPLAY, value);
}

/**
 * Strips leading emoji + space so "🍴 їжа" → "їжа".
 * Accepts any run of non-letter / non-digit grapheme chunks so compound
 * emoji (ZWJ sequences, variation selectors) are all peeled off.
 */
function stripLeadingEmoji(str: string): string {
  const s = String(str || "");
  let i = 0;
  // `s[i]` під `noUncheckedIndexedAccess` — `string | undefined`, хоча
  // умова `i < s.length` це вже виключає. Раніше тут стояв non-null
  // assertion; `?? ""` дає той самий результат без придушення перевірки:
  // порожній рядок не матчить `[\p{L}\p{N}]`, тобто недосяжна гілка
  // поводиться так само, як і була б із `!`.
  while (i < s.length && !/[\p{L}\p{N}]/u.test(s[i] ?? "")) i++;
  return s.slice(i).trim();
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

  // Era 2: emoji-prefixed string — strip emoji then map the UA label.
  // Era 1: bare UA label — also matched by the stripped path (no-op strip).
  const stripped = stripLeadingEmoji(trimmed).toLocaleLowerCase("uk-UA");
  const fromLabel = UA_LABEL_TO_SLUG[stripped];
  if (fromLabel) return fromLabel;

  // Unknown legacy value — graceful fallback.
  return DEFAULT_CATEGORY;
}

/**
 * `upgradeCategory`, який не з'їдає користувацькі категорії.
 *
 * `upgradeCategory` нормалізує будь-яке невідоме значення в
 * `DEFAULT_CATEGORY` — і це правильно для легасі-рядків трьох ер. Але id
 * власної категорії теж «невідомий» цій таксономії, тож на шляху
 * збереження ручної витрати він мовчки ставав «Інше»: людина обирала
 * «Кава з друзями», а в списку з'являлось інше слово. Підміна даних без
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
