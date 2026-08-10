import type { PantryMode } from "@sergeant/shared";

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
  /**
   * Режим комори з запиту. `ignore` — користувач попросив НЕ спиратись на
   * наявні продукти. Дефолт `prefer` = історична поведінка.
   */
  mode?: PantryMode;
}

/**
 * Секція промпту, яка стає на місце списку комори, коли режим — `ignore`.
 *
 * AI-CONTEXT: список тут навмисно НЕ рендериться. Посилити словами
 * («ігноруй наявне») недостатньо: модель бачить перелік продуктів і все одно
 * тягне з нього страви, бо решта промпту просить «реалістичний план». Єдиний
 * надійний важіль — не показувати того, чого не можна використати.
 */
export const PANTRY_IGNORE_SECTION =
  "Комору НЕ враховуй: користувач попросив план без огляду на наявні вдома продукти. " +
  "Список комори тобі свідомо не передано — не згадуй його, не питай про нього і не припускай, що там лежить.";

/**
 * Будує секцію промпту з відформатованим списком комори. Повертає готовий
 * рядок виду:
 *
 *   Наявні продукти:
 *   - яйця — 10 шт
 *   - молоко — 1 л
 *
 * Для flat-формату (shopping-list: `joinWith: ", "`) — без `- ` prefix.
 * Для `mode: "ignore"` — [`PANTRY_IGNORE_SECTION`] без жодної позиції.
 */
export function pantryPromptSection({
  pantry,
  preset,
  label = "Наявні продукти",
  mode = "prefer",
}: PantryPromptSectionOptions): string {
  if (mode === "ignore") return PANTRY_IGNORE_SECTION;
  const opts = PANTRY_PRESETS[preset];
  const formatted = formatPantryForPrompt(pantry, opts);
  const isList = opts.joinWith.includes("\n");
  const section = isList
    ? `${label}:\n- ${formatted}`
    : `${label}:\n${formatted}`;
  return mode === "only"
    ? `${section}\n\nВикористовуй ТІЛЬКИ ці продукти — плюс сіль, олія, вода й базові спеції. Позиції поза списком не пропонуй.`
    : section;
}
