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
 */
export const CATEGORY_DISPLAY: Record<CategorySlug, CategoryDisplay> = {
  food: { iconName: "utensils", label: "Їжа" },
  groceries: { iconName: "shopping-cart", label: "Продукти" },
  cafe: { iconName: "coffee", label: "Кафе та ресторани" },
  transport: { iconName: "truck", label: "Транспорт" },
  entertainment: { iconName: "sparkles", label: "Розваги" },
  health: { iconName: "heart", label: "Здоров'я" },
  shopping: { iconName: "tag", label: "Покупки" },
  utilities: { iconName: "home", label: "Комунальні" },
  tech: { iconName: "monitor", label: "Техніка" },
  subscriptions: { iconName: "repeat", label: "Підписки" },
  education: { iconName: "book", label: "Навчання" },
  travel: { iconName: "compass", label: "Подорожі" },
  other: { iconName: "tag", label: "Інше" },
};

/**
 * The ordered list of slugs used for the category picker.
 * Matches the former CATEGORIES array in display order.
 */
export const CATEGORY_SLUGS: CategorySlug[] = [
  "food",
  "groceries",
  "cafe",
  "transport",
  "entertainment",
  "health",
  "shopping",
  "utilities",
  "tech",
  "subscriptions",
  "education",
  "travel",
  "other",
];

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
  while (i < s.length && !/[\p{L}\p{N}]/u.test(s[i]!)) i++;
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
