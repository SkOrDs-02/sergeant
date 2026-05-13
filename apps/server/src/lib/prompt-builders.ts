import {
  formatPantryForPrompt,
  type PantryPromptFormatOptions,
} from "./pantryFormat.js";

/**
 * Попередньо визначені пресети для `formatPantryForPrompt`. Кожен
 * nutrition-ендпоінт використовує один із них — жодного інлайн-дублювання.
 */
export const PANTRY_PRESETS = {
  dayPlan: {
    itemFormat: "nameQuantity",
    limit: 50,
    joinWith: "\n- ",
    fallbackWhenEmpty: "продукти не вказані",
  },
  recipes: {
    itemFormat: "nameQuantityNotes",
    limit: 60,
    joinWith: "\n- ",
  },
  weekPlan: {
    itemFormat: "nameOnly",
    limit: 50,
    joinWith: "\n- ",
  },
  shoppingList: {
    itemFormat: "nameOnly",
    joinWith: ", ",
    fallbackWhenEmpty: "нічого",
  },
} as const satisfies Record<string, PantryPromptFormatOptions>;

export type PantryPresetKey = keyof typeof PANTRY_PRESETS;

export interface PantryPromptSectionOptions {
  pantry: unknown;
  preset: PantryPresetKey;
  label?: string;
}

/**
 * Будує секцію промпту з відформатованим списком комори. Повертає готовий
 * рядок виду:
 *
 *   Наявні продукти:
 *   - яйця — 10 шт
 *   - молоко — 1 л
 *
 * Для flat-формату (shopping-list: `joinWith: ", "`) — без `- ` prefix.
 */
export function pantryPromptSection({
  pantry,
  preset,
  label = "Наявні продукти",
}: PantryPromptSectionOptions): string {
  const opts = PANTRY_PRESETS[preset];
  const formatted = formatPantryForPrompt(pantry, opts);
  const isList = opts.joinWith.includes("\n");
  return isList ? `${label}:\n- ${formatted}` : `${label}:\n${formatted}`;
}
