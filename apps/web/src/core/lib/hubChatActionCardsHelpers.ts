import type { ChatActionCardModule } from "./hubChatActionCards";
import { MCC_CATEGORIES } from "@sergeant/finyk-domain";
import { MANUAL_TAXONOMY_BY_ID } from "@sergeant/finyk-domain/lib/manualTaxonomy";
import { isMealTypeId, labelForMealType } from "@sergeant/nutrition-domain";
import { loadRoutineState } from "../../modules/routine/lib/routineStorage";

export function moduleFor(name: string): ChatActionCardModule {
  // Finyk tools
  if (
    name === "create_transaction" ||
    name === "find_transaction" ||
    name === "batch_categorize" ||
    name === "change_category" ||
    name === "delete_transaction" ||
    name === "hide_transaction" ||
    name === "set_budget_limit" ||
    name === "set_monthly_plan" ||
    name === "create_debt" ||
    name === "create_receivable" ||
    name === "update_budget" ||
    name === "mark_debt_paid" ||
    name === "add_asset" ||
    name === "split_transaction" ||
    name === "recurring_expense" ||
    name === "export_report" ||
    name === "import_monobank_range" ||
    // Query / analytics ("talk to your data", PR1)
    name === "query_transactions" ||
    name === "aggregate_spending" ||
    name === "compare_periods"
  ) {
    return "finyk";
  }
  // Nutrition tools
  if (
    name === "log_meal" ||
    name === "log_water" ||
    name === "add_recipe" ||
    name === "add_to_shopping_list" ||
    name === "consume_from_pantry" ||
    name === "clear_pantry" ||
    name === "set_daily_plan" ||
    name === "suggest_meal" ||
    name === "copy_meal_from_date" ||
    name === "plan_meals_for_day" ||
    // Query / analytics ("talk to your data", PR3)
    name === "query_nutrition" ||
    name === "nutrition_averages"
  ) {
    return "nutrition";
  }
  // Fizruk tools
  if (
    name === "start_workout" ||
    name === "log_set" ||
    name === "plan_workout" ||
    name === "finish_workout" ||
    name === "log_measurement" ||
    name === "add_program_day" ||
    name === "log_wellbeing" ||
    name === "log_weight" ||
    name === "suggest_workout" ||
    name === "copy_workout" ||
    name === "compare_progress" ||
    // Query / analytics ("talk to your data", PR2)
    name === "query_workouts" ||
    name === "exercise_progress" ||
    name === "training_stats"
  ) {
    return "fizruk";
  }
  // Routine tools
  if (
    name === "mark_habit_done" ||
    name === "create_habit" ||
    name === "archive_habit" ||
    name === "set_habit_schedule" ||
    name === "pause_habit" ||
    name === "create_reminder" ||
    name === "complete_habit_for_date" ||
    name === "add_calendar_event" ||
    name === "edit_habit" ||
    name === "reorder_habits" ||
    name === "habit_stats" ||
    // Query / analytics ("talk to your data", PR3)
    name === "query_habits" ||
    name === "habit_correlation"
  ) {
    return "routine";
  }
  // Cross-module, utility, memory -> hub
  return "hub";
}

export function iconFor(name: string): string | undefined {
  switch (name) {
    // Finyk
    case "create_transaction":
    case "find_transaction":
    case "batch_categorize":
    case "change_category":
    case "delete_transaction":
    case "hide_transaction":
    case "set_budget_limit":
    case "update_budget":
    case "split_transaction":
      return "credit-card";
    case "set_monthly_plan":
    case "recurring_expense":
      return "calendar";
    case "create_debt":
    case "create_receivable":
    case "mark_debt_paid":
      return "landmark";
    case "add_asset":
      return "piggy-bank";
    case "export_report":
      return "file-text";
    case "import_monobank_range":
      return "refresh-cw";
    // Nutrition
    case "log_meal":
    case "copy_meal_from_date":
    case "plan_meals_for_day":
      return "utensils";
    case "log_water":
      return "droplet";
    case "add_recipe":
      return "book-open";
    case "add_to_shopping_list":
      return "shopping-cart";
    case "consume_from_pantry":
      return "check";
    case "clear_pantry":
      return "trash";
    case "set_daily_plan":
      return "target";
    case "suggest_meal":
      return "lightbulb";
    // Fizruk
    case "start_workout":
    case "plan_workout":
    case "copy_workout":
      return "dumbbell";
    case "log_set":
      return "activity";
    case "finish_workout":
      return "flag";
    case "log_measurement":
    case "log_weight":
      return "weighing-scale";
    case "add_program_day":
      return "calendar-days";
    case "log_wellbeing":
      return "smile";
    case "suggest_workout":
      return "zap";
    case "compare_progress":
      return "trending-up";
    // Routine
    case "mark_habit_done":
    case "create_habit":
    case "edit_habit":
      return "check";
    case "set_habit_schedule":
    case "create_reminder":
    case "add_calendar_event":
      return "calendar";
    case "pause_habit":
      return "pause-circle";
    case "archive_habit":
      return "archive";
    case "reorder_habits":
      return "arrow-up-down";
    case "habit_stats":
      return "bar-chart";
    case "complete_habit_for_date":
      return "calendar-check";
    // Cross-module
    case "morning_briefing":
      return "sun";
    case "weekly_summary":
    case "spending_trend":
    case "weight_chart":
    case "category_breakdown":
    case "habit_trend":
    case "compare_weeks":
      return "bar-chart";
    case "set_goal":
      return "target";
    case "detect_anomalies":
      return "alert-triangle";
    // Utility
    case "calculate_1rm":
      return "calculator";
    case "convert_units":
      return "arrow-right-left";
    case "save_note":
    case "list_notes":
      return "sticky-note";
    case "export_module_data":
      return "download";
    // Memory
    case "remember":
    case "forget":
      return "brain";
    case "my_profile":
      return "user";
    case "recall_memory":
      return "search";
    // Query / analytics ("talk to your data", PR1-3)
    case "aggregate_spending":
    case "training_stats":
    case "nutrition_averages":
    case "query_habits":
      return "bar-chart";
    case "compare_periods":
    case "exercise_progress":
    case "habit_correlation":
      return "trending-up";
    case "query_transactions":
    case "query_workouts":
    case "query_nutrition":
      return "search";
    default:
      return undefined;
  }
}

/**
 * AI-4 / AI-6 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`) —
 * один мапер ключ → підпис на всі три родини «карта показує сирий id/enum
 * замість людського тексту»: звичка (`hab_<uuid>`), категорія Фініка
 * (`restaurant`), тип прийому їжі (`dinner`). Кожна функція повертає
 * `undefined`, коли резолв не вдався (звичку видалено, категорію
 * не впізнано) — виклики нижче в `hubChatActionCardsRegistry.ts` тоді
 * падають назад на raw id, а не на порожній рядок.
 */

const MCC_CATEGORY_LABEL_BY_ID: ReadonlyMap<string, string> = new Map(
  MCC_CATEGORIES.map((c) => [c.id, c.label]),
);

/** Модель шле `id:`-префіксовані значення час від часу (той самий шум, що
 * `normalizeHabitId` у `chatActions/routineActions.ts` вже чистить для
 * запису) — тут та сама нормалізація для читання, окрема копія навмисно:
 * дві-три рядки не варті спільного експорту через модульну межу. */
function stripIdPrefix(raw: string): string {
  return raw
    .trim()
    .replace(/^id:\s*/i, "")
    .trim();
}

/**
 * Назва звички з локального стану Рутини (`loadRoutineState().habits`) —
 * той самий джерело істини, що читає UI. `undefined`, якщо звичку вже
 * видалено/архівовано локально або id не резолвиться — виклик нижче
 * falls back на сирий id, не ховає інформацію повністю.
 */
export function habitNameFor(habitId: string | undefined): string | undefined {
  if (!habitId) return undefined;
  const id = stripIdPrefix(habitId);
  if (!id) return undefined;
  return loadRoutineState().habits.find((h) => h.id === id)?.name;
}

/**
 * Людський підпис категорії Фініка з канонічного реєстру `MCC_CATEGORIES`
 * (той самий, що керує бюджетами/лімітами), з fallback на ручну таксономію
 * (`MANUAL_TAXONOMY_BY_ID`) для legacy manual-слагів. Користувацькі
 * (custom) категорії тут не резолвляться — картка тоді показує raw id,
 * що не гірше за поточну поведінку.
 */
export function categoryLabelFor(
  categoryId: string | undefined,
): string | undefined {
  if (!categoryId) return undefined;
  const id = categoryId.trim();
  if (!id) return undefined;
  return (
    MCC_CATEGORY_LABEL_BY_ID.get(id) ?? MANUAL_TAXONOMY_BY_ID.get(id)?.label
  );
}

/**
 * Українська назва типу прийому їжі через канонічний
 * `labelForMealType` з `@sergeant/nutrition-domain` (той самий, що керує
 * рендером плану харчування) — не власна копія словника.
 *
 * Tool-схема (`toolDefs/nutrition.ts`) описує `meal_type` як вільний
 * рядок із підказкою `'breakfast' | 'lunch' | 'dinner' | 'snack'` — БЕЗ
 * enum-обмеження, тож модель штатно шле і вже українське слово («обід»,
 * «сніданок»), яке саме по собі читабельне. Перекладаємо лише РОЗПІЗНАНИЙ
 * канонічний enum (`isMealTypeId`); усе інше повертаємо як є — інакше
 * `labelForMealType`-фолбек «Прийом їжі» затер би вже нормальний текст,
 * замінивши конкретне на загальне.
 */
export function mealTypeLabelFor(
  mealType: string | undefined,
): string | undefined {
  if (!mealType) return undefined;
  return isMealTypeId(mealType) ? labelForMealType(mealType) : mealType;
}

export function titleFor(name: string, status: "completed" | "failed"): string {
  const failedSuffix = status === "failed" ? ", не вийшло" : "";
  switch (name) {
    // Finyk
    case "create_transaction":
      return `Транзакцію записано${failedSuffix}`;
    case "find_transaction":
      return `Транзакції знайдено${failedSuffix}`;
    case "batch_categorize":
      return `Категорії оновлено${failedSuffix}`;
    case "change_category":
      return `Категорію змінено${failedSuffix}`;
    case "delete_transaction":
      return `Транзакцію видалено${failedSuffix}`;
    case "hide_transaction":
      return `Транзакцію приховано${failedSuffix}`;
    case "set_budget_limit":
    case "update_budget":
      return `Бюджет оновлено${failedSuffix}`;
    case "set_monthly_plan":
      return `Фінплан оновлено${failedSuffix}`;
    case "create_debt":
      return `Борг створено${failedSuffix}`;
    case "create_receivable":
      return `Дебіторку додано${failedSuffix}`;
    case "mark_debt_paid":
      return `Борг позначено як сплачений${failedSuffix}`;
    case "add_asset":
      return `Актив додано${failedSuffix}`;
    case "split_transaction":
      return `Транзакцію розділено${failedSuffix}`;
    case "recurring_expense":
      return `Періодичну витрату створено${failedSuffix}`;
    case "export_report":
      return `Звіт згенеровано${failedSuffix}`;
    // Nutrition
    case "log_meal":
      return `Прийом їжі залоговано${failedSuffix}`;
    case "log_water":
      return `Воду залоговано${failedSuffix}`;
    case "add_recipe":
      return `Рецепт збережено${failedSuffix}`;
    case "add_to_shopping_list":
      return `Продукт додано до списку покупок${failedSuffix}`;
    case "consume_from_pantry":
      return `Продукт спожито${failedSuffix}`;
    case "clear_pantry":
      return `Комору очищено${failedSuffix}`;
    case "set_daily_plan":
      return `Щоденний план оновлено${failedSuffix}`;
    case "suggest_meal":
      return `Пораду щодо їжі${failedSuffix}`;
    case "copy_meal_from_date":
      return `Прийом їжі скопійовано${failedSuffix}`;
    case "plan_meals_for_day":
      return `План харчування на день${failedSuffix}`;
    // Fizruk
    case "start_workout":
      return `Тренування стартувало${failedSuffix}`;
    case "log_set":
      return `Підхід записано${failedSuffix}`;
    case "plan_workout":
      return `Тренування заплановано${failedSuffix}`;
    case "finish_workout":
      return `Тренування завершено${failedSuffix}`;
    case "log_measurement":
      return `Заміри записано${failedSuffix}`;
    case "add_program_day":
      return `День програми додано${failedSuffix}`;
    case "log_wellbeing":
      return `Самопочуття записано${failedSuffix}`;
    case "log_weight":
      return `Вагу записано${failedSuffix}`;
    case "suggest_workout":
      return `Порада щодо тренування${failedSuffix}`;
    case "copy_workout":
      return `Тренування скопійовано${failedSuffix}`;
    case "compare_progress":
      return `Порівняння прогресу${failedSuffix}`;
    // Routine
    case "mark_habit_done":
      // Не «створено»: обидві дії ділили один заголовок, тож відмітка
      // виконання рапортувала користувачу створення нової звички
      // (браузерна реверифікація 2026-08-24). Картка дії — це звіт про те,
      // ЩО сталось; помилковий дієслівний час тут коштує рівно стільки ж,
      // скільки хибне «зроблено» в самій відповіді.
      return `Звичку відмічено${failedSuffix}`;
    case "create_habit":
      return `Звичку створено${failedSuffix}`;
    case "set_habit_schedule":
      return `Розклад звички оновлено${failedSuffix}`;
    case "pause_habit":
      return `Стан паузи звички оновлено${failedSuffix}`;
    case "create_reminder":
      return `Нагадування додано${failedSuffix}`;
    case "complete_habit_for_date":
      return `Виконання звички оновлено${failedSuffix}`;
    case "archive_habit":
      return `Архів звички оновлено${failedSuffix}`;
    case "add_calendar_event":
      return `Подію додано в календар${failedSuffix}`;
    case "edit_habit":
      return `Звичку відредаговано${failedSuffix}`;
    case "reorder_habits":
      return `Порядок звичок оновлено${failedSuffix}`;
    case "habit_stats":
      return `Статистика звички${failedSuffix}`;
    // Cross-module
    case "morning_briefing":
      return `Ранковий брифінг${failedSuffix}`;
    case "weekly_summary":
      return `Тижневий підсумок${failedSuffix}`;
    case "compare_weeks":
      return `Порівняння тижнів${failedSuffix}`;
    case "set_goal":
      return `Ціль встановлено${failedSuffix}`;
    case "spending_trend":
      return `Тренд витрат${failedSuffix}`;
    case "weight_chart":
      return `Графік ваги${failedSuffix}`;
    case "category_breakdown":
      return `Розбивка по категоріях${failedSuffix}`;
    case "detect_anomalies":
      return `Виявлення аномалій${failedSuffix}`;
    case "habit_trend":
      return `Тренд звичок${failedSuffix}`;
    // Utility
    case "calculate_1rm":
      return `1RM розраховано${failedSuffix}`;
    case "convert_units":
      return `Конвертацію одиниць${failedSuffix}`;
    case "save_note":
      return `Нотатку збережено${failedSuffix}`;
    case "list_notes":
      return `Список нотаток${failedSuffix}`;
    case "export_module_data":
      return `Експорт даних${failedSuffix}`;
    // Memory
    case "remember":
      return `Памʼять оновлено${failedSuffix}`;
    case "forget":
      return `Забуто${failedSuffix}`;
    case "my_profile":
      return `Профіль${failedSuffix}`;
    case "recall_memory":
      return `Спогад${failedSuffix}`;
    // Query / analytics ("talk to your data", PR1-3)
    case "query_transactions":
      return `Транзакції за запитом${failedSuffix}`;
    case "aggregate_spending":
      return `Розбивка витрат${failedSuffix}`;
    case "compare_periods":
      return `Порівняння періодів${failedSuffix}`;
    case "query_workouts":
      return `Тренування за запитом${failedSuffix}`;
    case "exercise_progress":
      return `Прогрес вправи${failedSuffix}`;
    case "training_stats":
      return `Статистика тренувань${failedSuffix}`;
    case "query_habits":
      return `Статистика звичок${failedSuffix}`;
    case "habit_correlation":
      return `Кореляція звички${failedSuffix}`;
    case "query_nutrition":
      return `Харчування за запитом${failedSuffix}`;
    case "nutrition_averages":
      return `Середнє харчування${failedSuffix}`;
    default:
      return name;
  }
}
