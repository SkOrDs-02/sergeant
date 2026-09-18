/**
 * Last validated: 2026-08-31
 * Status: Active
 *
 * Мапа гліфів Харчування ↔ домен. Доменні `iconName` типізовані як
 * `string`, тож пропущену іконку компілятор не ловить: категорія просто
 * малюється нейтральним `Package`, і причина лишається невидимою. Саме
 * так каталог комори виріс 13 → 17, а мобільна мапа знала десять імен.
 */
import { FOOD_CATEGORIES, MEAL_TYPES } from "@sergeant/nutrition-domain";

import { NUTRITION_GLYPH_ICONS } from "./NutritionIcon";

describe("NUTRITION_GLYPH_ICONS", () => {
  it("покриває кожен iconName домену", () => {
    const missing = [
      ...FOOD_CATEGORIES.map((c) => [c.id, c.iconName] as const),
      ...MEAL_TYPES.map((m) => [m.id, m.iconName] as const),
    ]
      .filter(([, icon]) => !NUTRITION_GLYPH_ICONS[icon])
      .map(([id, icon]) => `${id} → "${icon}"`);
    expect(missing).toEqual([]);
  });

  it("покриває фолбек «Іншого»", () => {
    expect(NUTRITION_GLYPH_ICONS.package).toBeDefined();
  });
});
