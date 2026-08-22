/**
 * Last validated: 2026-08-21
 * Status: Active
 *
 * Іконка категорії Фініка — `categoryId` → slug гліфа дизайн-системи.
 *
 * AI-CONTEXT (2026-08-21): раніше ця мапа жила в
 * `apps/web/.../txRowHelpers.ts`, тобто знав про неї лише рядок
 * транзакції у вебі. Решта поверхонь «іконку» діставала з емодзі-
 * префікса підпису (`"🛒 Продукти"`): картка ліміту показувала його як
 * є, мобільний `TxRow` різав рядок по першому пробілу
 * (`cat.label.split(" ")[0]`). Звідси й репорт тестувальника — у лімітах
 * «іконки» були, бо там лишилось емодзі, а у витратах стояла справжня
 * SVG. Тепер підпис завжди чистий (`manualTaxonomy.ts`), а гліф — ЛИШЕ
 * звідси.
 *
 * Патерн дзеркалить `packages/routine-domain/src/glyphs.ts`: закритий
 * набір slug-ів, кожен — валідне імʼя іконки дизайн-системи. Веб бере
 * `Icon` (`apps/web/src/shared/components/ui/Icon.tsx`), мобільний —
 * власну проєкцію на `lucide-react-native`
 * (`apps/mobile/src/modules/finyk/components/CategoryIcon.tsx`).
 * `Record<CategoryIconName, …>` на обох поверхнях змушує компілятор
 * ловити новий slug без іконки.
 *
 * Правити тут — не в похідних мапах.
 */
import { INTERNAL_TRANSFER_ID } from "../constants.js";
import {
  MANUAL_EXPENSE_TAXONOMY,
  MANUAL_INCOME_TAXONOMY,
} from "./manualTaxonomy.js";

/** Закритий набір гліфів, якими малюються категорії Фініка. */
export const CATEGORY_ICON_SLUGS = [
  "bell",
  "book",
  "briefcase",
  "coffee",
  "compass",
  "credit-card",
  "droplet",
  "dumbbell",
  "hand-coins",
  "heart",
  "home",
  "monitor",
  "package",
  "play",
  "refresh-cw",
  "repeat",
  "shopping-cart",
  "sparkles",
  "tag",
  "trending-down",
  "trending-up",
  "truck",
] as const;

export type CategoryIconName = (typeof CATEGORY_ICON_SLUGS)[number];

/** Гліф категорії без власного запису — зокрема кастомної. */
export const DEFAULT_CATEGORY_ICON: CategoryIconName = "tag";

/**
 * `categoryId` → slug гліфа.
 *
 * Ручна таксономія йде ПЕРШОЮ, щоб MCC-записи нижче лишались
 * сильнішими: збіжні id (`food`, `transport`, …) мають зберегти рівно ті
 * іконки, що були в каталозі MCC, а з таблиці ручних категорій потрібні
 * лише ті, яких у MCC немає — `groceries`, `cafe`, `tech`, `utilities`,
 * `other` і всі надходження.
 */
export const CATEGORY_ICON_NAMES: Readonly<Record<string, CategoryIconName>> = {
  ...Object.fromEntries(
    [...MANUAL_EXPENSE_TAXONOMY, ...MANUAL_INCOME_TAXONOMY].map((d) => [
      d.id,
      d.iconName,
    ]),
  ),
  food: "shopping-cart",
  restaurant: "coffee",
  transport: "truck",
  subscriptions: "bell",
  health: "droplet",
  shopping: "tag",
  entertainment: "play",
  sport: "dumbbell",
  beauty: "tag",
  smoking: "tag",
  education: "package",
  travel: "trending-up",
  debt: "credit-card",
  charity: "hand-coins",
  [INTERNAL_TRANSFER_ID]: "trending-down",
  // Легасі income-id з MCC-каталогу.
  in_salary: "briefcase",
  in_freelance: "briefcase",
  in_cashback: "tag",
  in_pension: "briefcase",
  in_other: "trending-up",
};

/**
 * Гліф для рендера. Невідомий чи кастомний id дає
 * {@link DEFAULT_CATEGORY_ICON} — малювати завжди є що, тож жодна
 * поверхня не має підстав повертатись до емодзі.
 */
export function categoryIconName(
  categoryId: string | null | undefined,
): CategoryIconName {
  if (!categoryId) return DEFAULT_CATEGORY_ICON;
  return CATEGORY_ICON_NAMES[categoryId] ?? DEFAULT_CATEGORY_ICON;
}
