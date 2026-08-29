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
// Зіставлення назв із чека рітейлера з позиціями комори — детермінована
// частина мапінгу, що передує AI-маперу зі спеки Сільпо.
export * from "./receiptItemName.js";
// Щільність харчових рідин — спільна таблиця для зведення одиниць і
// списання. Межа «відома / невідома» і є продуктовим рішенням.
export * from "./density.js";
export * from "./pantryConsume.js";
// Одиниці виміру комори (вимір, база, фасування з чека) — одна таблиця на
// комору і список покупок; друга копія розʼїхалась би з першою.
export * from "./units.js";
// Картка продукту: варіанти позиції комори та інваріант суми.
export * from "./pantrySources.js";
// W1-PANTRY-APPEND стадія 2: типи журналу + чиста згортка залишку +
// детермінований id backfill-чекпойнта. `apps/web` тепер ПИШЕ сюди
// (readers — стадія 3+) — див. AI-CONTEXT у pantryLedger.ts.
export * from "./pantryLedger.js";
// W1-KBJU-APPEND стадія 2: типи журналу цілей + резолвер ефективної цілі
// дня. Споживачів поки немає за задумом (cutover — стадія 3, гейт
// founder-а) — див. AI-CONTEXT у nutritionGoals.ts.
export * from "./nutritionGoals.js";
export * from "./mergeItems.js";
export * from "./recipeIds.js";
export * from "./foodCategories.js";
export * from "./nutritionFormat.js";
// ADR-0078: device-local day-key helpers — межа доби логу їжі/води/денного
// підсумку належить пристрою, не Kyiv. Див. docstring у deviceDayKey.ts.
export * from "./deviceDayKey.js";

export * from "./nutritionTypes.js";
export * from "./nutritionPrefs.js";
export * from "./nutritionPantries.js";
export * from "./nutritionLog.js";
export * from "./quickStats.js";
// Модель тижневого ккал-графіка (стеля осі, лінія цілі, порожні дні) —
// спільна для web-`WeekKcalCard` і mobile-`WeekKcalChart`, щоб дзеркала не
// розходились у шкалі. Див. AI-CONTEXT у weekKcalChart.ts.
export * from "./weekKcalChart.js";
export * from "./waterLog.js";
export * from "./waterHistory.js";
export * from "./shoppingList.js";
// «Рівень 1» списку покупок (детермінований, без AI): точне віднімання
// залишків комори + авто-вливання low-stock позицій. Реюзить той самий
// low-stock поріг, що і бейдж комори (`pantryLowStock.ts`).
export * from "./pantryLowStock.js";
export * from "./shoppingListPantryMath.js";
export * from "./dailyPlanValidation.js";
