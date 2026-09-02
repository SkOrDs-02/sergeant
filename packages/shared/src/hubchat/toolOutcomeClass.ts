/**
 * AI-6 рішення 3 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`,
 * founder-рішення 2026-09-01) — класифікація HubChat tool-ів за тим, чи їхня
 * цінність залежить від СИНТЕЗУ другого туру (tool-result-повідомлення від
 * моделі), а не лише від виконання самого інструмента на клієнті.
 *
 * ПРОБЛЕМА. Коли другий тур падає (квота, 429, мережа — будь-яка причина),
 * `ChatActionCard` уже побудована з результату ВИКОНАННЯ tool-а на клієнті,
 * до того, як стало відомо, чи синтез взагалі відбудеться. Для двох груп
 * tool-ів це означає протилежні речі:
 *
 *   - `"state-mutating"` — дія вже сталась НЕЗАЛЕЖНО від синтезу
 *     (`mark_habit_done` уже записав відмітку, `create_transaction` уже
 *     створив транзакцію). Картка ПРАВИЛЬНО каже «Виконано» — синтез
 *     дає лише текстове пояснення поверх уже здійсненої дії.
 *   - `"advice"` — цінність інструмента — САМЕ синтезований текст
 *     (`suggest_meal` повертає з клієнта лише проміжні цифри — «зʼїдено
 *     X ккал, залишилось Y», а фактичну ПОРАДУ що зʼїсти формує тільки
 *     модель на другому турі). Без синтезу картка з «completed» статусом
 *     виглядає як завершена рекомендація, якою вона НЕ Є.
 *
 * Тому клас — не про «мутує/не мутує дані» в буквальному сенсі, а про
 * «чи потрібен другий тур, щоб картка сказала правду».
 *
 * ОДНЕ ДЖЕРЕЛО ІСТИНИ. 78 tool-ів (`ALL_HUBCHAT_TOOL_NAMES`) — забагато,
 * щоб тримати прапорець по кількох файлах: `TOOL_OUTCOME_CLASS` — єдина
 * мапа поруч із реєстром імен (`toolNames.ts`), а не власна копія в
 * `hubChatActionCards.ts` чи `useChatSend.ts`. `toolOutcomeClass.test.ts`
 * звіряє, що КОЖЕН tool з `ALL_HUBCHAT_TOOL_NAMES` має клас (drift-гейт,
 * той самий патерн, що `toolNames.test.ts`).
 *
 * Класифікація зроблена читанням клієнтських executor-ів
 * (`apps/web/src/core/lib/chatActions/*.ts`): `"advice"`, якщо executor
 * НЕ пише в жодне сховище (LS/SQLite) — лише читає й рахує; `"state-mutating"`,
 * якщо він персистить зміну. Прикордонні випадки, перевірені явно:
 *   - `export_report` / `export_module_data` — читають і форматують, нічого
 *     не пишуть → `"advice"`.
 *   - `plan_meals_for_day` — попри назву, лише рахує й повертає текст-
 *     рекомендацію, не створює daily-plan запис → `"advice"`.
 *   - `find_transaction` — пошук id для наступної дії, сам не мутує → `"advice"`.
 */

import type { HubChatToolName } from "./toolNames.js";

export type ToolOutcomeClass = "state-mutating" | "advice";

export const TOOL_OUTCOME_CLASS: Readonly<
  Record<HubChatToolName, ToolOutcomeClass>
> = {
  // ── Finyk ────────────────────────────────────────────────────────
  change_category: "state-mutating",
  find_transaction: "advice",
  batch_categorize: "state-mutating",
  create_debt: "state-mutating",
  create_receivable: "state-mutating",
  hide_transaction: "state-mutating",
  set_budget_limit: "state-mutating",
  set_monthly_plan: "state-mutating",
  create_transaction: "state-mutating",
  delete_transaction: "state-mutating",
  update_budget: "state-mutating",
  mark_debt_paid: "state-mutating",
  add_asset: "state-mutating",
  import_monobank_range: "state-mutating",
  split_transaction: "state-mutating",
  recurring_expense: "state-mutating",
  export_report: "advice",

  // ── Query Finyk (read-only) ──────────────────────────────────────
  query_transactions: "advice",
  aggregate_spending: "advice",
  compare_periods: "advice",

  // ── Fizruk ───────────────────────────────────────────────────────
  plan_workout: "state-mutating",
  log_set: "state-mutating",
  start_workout: "state-mutating",
  finish_workout: "state-mutating",
  log_measurement: "state-mutating",
  add_program_day: "state-mutating",
  log_wellbeing: "state-mutating",
  log_weight: "state-mutating",
  suggest_workout: "advice",
  copy_workout: "state-mutating",
  compare_progress: "advice",

  // ── Query Fizruk (read-only) ──────────────────────────────────────
  query_workouts: "advice",
  exercise_progress: "advice",
  training_stats: "advice",

  // ── Routine ──────────────────────────────────────────────────────
  mark_habit_done: "state-mutating",
  create_habit: "state-mutating",
  create_reminder: "state-mutating",
  complete_habit_for_date: "state-mutating",
  archive_habit: "state-mutating",
  add_calendar_event: "state-mutating",
  edit_habit: "state-mutating",
  reorder_habits: "state-mutating",
  habit_stats: "advice",
  set_habit_schedule: "state-mutating",
  pause_habit: "state-mutating",

  // ── Query Routine (read-only) ─────────────────────────────────────
  query_habits: "advice",
  habit_correlation: "advice",

  // ── Nutrition ────────────────────────────────────────────────────
  log_water: "state-mutating",
  log_meal: "state-mutating",
  add_recipe: "state-mutating",
  add_to_shopping_list: "state-mutating",
  consume_from_pantry: "state-mutating",
  clear_pantry: "state-mutating",
  set_daily_plan: "state-mutating",
  suggest_meal: "advice",
  copy_meal_from_date: "state-mutating",
  // Попри назву — лише рахує ккал/розподіл і повертає текст-рекомендацію,
  // жодного daily-plan запису не створює (`nutritionActions.ts`).
  plan_meals_for_day: "advice",

  // ── Query Nutrition (read-only) ───────────────────────────────────
  query_nutrition: "advice",
  nutrition_averages: "advice",

  // ── Cross-module ───────────────────────────────────────────────────
  morning_briefing: "advice",
  weekly_summary: "advice",
  set_goal: "state-mutating",
  spending_trend: "advice",
  weight_chart: "advice",
  category_breakdown: "advice",
  get_daily_series: "advice",
  detect_anomalies: "advice",
  habit_trend: "advice",
  compare_weeks: "advice",

  // ── Utility ──────────────────────────────────────────────────────
  calculate_1rm: "advice",
  convert_units: "advice",
  save_note: "state-mutating",
  list_notes: "advice",
  export_module_data: "advice",

  // ── Memory ───────────────────────────────────────────────────────
  remember: "state-mutating",
  forget: "state-mutating",
  my_profile: "advice",
  recall_memory: "advice",
};

/**
 * Класифікує будь-яке ім'я. Невідомий tool (не в реєстрі — не мало б
 * трапитись, `toolParity.test.ts` це гарантує) фолбечиться на `"advice"`:
 * консервативний варіант — картка перейде у `failed` замість того, щоб
 * помилково виглядати завершеною дією, якою вона могла й не бути.
 */
export function getToolOutcomeClass(name: string): ToolOutcomeClass {
  return TOOL_OUTCOME_CLASS[name as HubChatToolName] ?? "advice";
}

/** `true` для стейт-мутуючих tool-ів (дія вже сталась на клієнті). */
export function isStateMutatingTool(name: string): boolean {
  return getToolOutcomeClass(name) === "state-mutating";
}
