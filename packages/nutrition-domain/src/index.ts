// Публічна поверхня пакета `@sergeant/nutrition-domain` — DOM-free
// бізнес-логіка Харчування, яку споживають `apps/web` і `apps/mobile`
// без платформних залежностей (`localStorage`, `window`, `document`).
//
// Phase 7 / PR 1: meal-types, pantry-text-parser, merge-items, recipe-ids,
// food-categories, nutrition-format.
// Phase 7 / PR 2: pure core storage shapes + mutations — nutrition-log,
// water-log, shopping-list, pantries, prefs. `load*`/`persist*` I/O-шари
// живуть у `apps/web` (createModuleStorage) і пізніше в `apps/mobile`
// (MMKV) — обидва кладуть ті самі normalize/mutation-функції поверх
// власного KVStore.
export * from "./mealTypes.js";
export * from "./pantryTextParser.js";
export * from "./pantryConsume.js";
export * from "./mergeItems.js";
export * from "./recipeIds.js";
export * from "./foodCategories.js";
export * from "./nutritionFormat.js";

export * from "./nutritionTypes.js";
export * from "./nutritionPrefs.js";
export * from "./nutritionPantries.js";
export * from "./nutritionLog.js";
export * from "./waterLog.js";
export * from "./shoppingList.js";
export * from "./dailyPlanValidation.js";
