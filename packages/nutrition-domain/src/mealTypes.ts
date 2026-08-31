// unification-modules.md #2.25: канонічний тип живе в
// `@sergeant/shared/schemas` (zod-енум для API-контракту), обидва пакети
// вже залежать від `shared` — тут лишається реекспорт, не друге оголошення.
import type { MealTypeId } from "@sergeant/shared";
export type { MealTypeId };

export interface MealType {
  id: MealTypeId;
  label: string;
  /**
   * Імʼя гліфа дизайн-системи. До 2026-08-21 тут стояло емодзі
   * (`"🌅"`, `"☀️"`, `"🌙"`, `"🍎"`) — воно малювалось системним
   * emoji-шрифтом, тобто по-різному на кожній ОС, не брало
   * `currentColor` і не мало теми. Веб бере `Icon`, мобільний —
   * `lucide-react-native`.
   */
  iconName: string;
}

export interface MealMeta {
  label: string;
  iconName: string;
}

export const MEAL_ORDER: readonly MealTypeId[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

export const MEAL_TYPES: readonly MealType[] = [
  { id: "breakfast", label: "Сніданок", iconName: "coffee" },
  { id: "lunch", label: "Обід", iconName: "utensils" },
  { id: "dinner", label: "Вечеря", iconName: "moon" },
  { id: "snack", label: "Перекус", iconName: "apple" },
];

export const MEAL_META: Record<MealTypeId, MealMeta> = Object.fromEntries(
  MEAL_TYPES.map((t) => [t.id, { label: t.label, iconName: t.iconName }]),
) as Record<MealTypeId, MealMeta>;

const MEAL_TYPE_SET = new Set<string>(MEAL_ORDER);

export function isMealTypeId(id: unknown): id is MealTypeId {
  return typeof id === "string" && MEAL_TYPE_SET.has(id);
}

/** Міграція зі старих записів, де тип був лише в label. */
export function mealTypeFromLabel(label: unknown): MealTypeId {
  const s = String(label ?? "").trim();
  for (const t of MEAL_TYPES) {
    if (t.label === s) return t.id;
  }
  return "snack";
}

export function labelForMealType(id: MealTypeId | string): string {
  return MEAL_TYPES.find((t) => t.id === id)?.label || "Прийом їжі";
}

/**
 * Time-of-day → most likely meal type. Used to seed the "Додати прийом їжі"
 * form so the default doesn't say "Сніданок" at 9 PM. Bands are wide and
 * contiguous between 5:00–22:00 on purpose — we'd rather pick an obvious-
 * enough option than force the user to tap the picker just to flip it.
 *
 * Bands: 5–10 breakfast · 11–15 lunch · 16–21 dinner · else snack. Dinner
 * intentionally covers 16:00 so the picker doesn't collapse to "Перекус" at
 * 4 PM (that was a gap in the original 11–15 / 17–21 split).
 */
export function mealTypeByHour(hour: number): MealTypeId {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

export function mealTypeByNow(now: Date = new Date()): MealTypeId {
  return mealTypeByHour(now.getHours());
}
