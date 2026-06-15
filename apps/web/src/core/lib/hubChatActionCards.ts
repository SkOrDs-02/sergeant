// Lightweight mapper з tool-call result у структуровану action-картку.
// За специфікацією `docs/design/specs/archive/2026-04-24-assistant-quick-actions-v1-design.md` §3.
//
// Без змін у `executeAction`/Anthropic протоколі — карти будуються
// поруч і додаються до assistant-message як metadata. Якщо tool
// невідомий мапперу — повертаємо `null`, і UI лишає текстовий fallback.

import type { ChatAction } from "./chatActions/types";
import { moduleFor } from "./hubChatActionCardsHelpers";
import { iconFor } from "./hubChatActionCardsHelpers";
import { titleFor } from "./hubChatActionCardsHelpers";
import { summaryFor } from "./hubChatActionCardsSummary";

export type ChatActionCardModule =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "hub";

export type ChatActionCardStatus = "completed" | "failed";

export interface ChatActionCard {
  id: string;
  toolName: string;
  status: ChatActionCardStatus;
  title: string;
  summary: string;
  module: ChatActionCardModule;
  /** Іконка з shared Icon registry. Опційно — UI має fallback. */
  icon?: string | undefined;
  /**
   * Маркер ризикової дії (delete/forget/import). v1 лише підсвічує
   * картку, повний confirmation flow — у v2.
   */
  risky?: boolean | undefined;
  /**
   * Маркер "data result" — read-only query/analytics tool ("talk to
   * your data", PR4). UI (`ChatMessage`) рендерить таку картку через
   * `DataResultCard` (структурований розбір `summary`), а не звичайний
   * `ActionCard`. Текстовий fallback лишається для всіх інших карток.
   */
  data?: boolean | undefined;
}

/**
 * Read-only query/analytics tools ("talk to your data", PR1-3). Їхній
 * результат — числові відповіді / агрегації / порівняння періодів, тож
 * UI рендерить структуровану `DataResultCard` замість плоского
 * `ActionCard`. Жоден з них не мутує дані — отже й не risky.
 */
const QUERY_TOOLS: ReadonlySet<string> = new Set([
  // Finyk (PR1)
  "query_transactions",
  "aggregate_spending",
  "compare_periods",
  // Fizruk (PR2)
  "query_workouts",
  "exercise_progress",
  "training_stats",
  // Routine + Nutrition (PR3)
  "query_habits",
  "habit_correlation",
  "query_nutrition",
  "nutrition_averages",
]);

/** Tools, які класифіковані як ризикові за специфікацією §4. */
const RISKY_TOOLS: ReadonlySet<string> = new Set([
  "batch_categorize",
  "delete_transaction",
  "hide_transaction",
  "forget",
  "archive_habit",
  "import_monobank_range",
  "delete_workout",
]);

/**
 * Розширений сабсет tool names, для яких v1 малює картку.
 * Ціль: покрити всі tools з action cards.
 */
const KNOWN_TOOLS: ReadonlySet<string> = new Set([
  // Finyk
  "create_transaction",
  "find_transaction",
  "batch_categorize",
  "change_category",
  "delete_transaction",
  "hide_transaction",
  "set_budget_limit",
  "set_monthly_plan",
  "create_debt",
  "create_receivable",
  "update_budget",
  "mark_debt_paid",
  "add_asset",
  "split_transaction",
  "recurring_expense",
  "export_report",
  // Routine
  "mark_habit_done",
  "create_habit",
  "create_reminder",
  "complete_habit_for_date",
  "archive_habit",
  "add_calendar_event",
  "edit_habit",
  "set_habit_schedule",
  "pause_habit",
  "reorder_habits",
  "habit_stats",
  // Nutrition
  "log_water",
  "log_meal",
  "add_recipe",
  "add_to_shopping_list",
  "consume_from_pantry",
  "set_daily_plan",
  "suggest_meal",
  "copy_meal_from_date",
  "plan_meals_for_day",
  // Fizruk
  "start_workout",
  "log_set",
  "plan_workout",
  "finish_workout",
  "log_measurement",
  "log_wellbeing",
  "log_weight",
  "suggest_workout",
  "copy_workout",
  "compare_progress",
  // Cross-module
  "morning_briefing",
  "weekly_summary",
  "compare_weeks",
  "set_goal",
  "spending_trend",
  "weight_chart",
  "category_breakdown",
  "detect_anomalies",
  "habit_trend",
  // Utility
  "calculate_1rm",
  "convert_units",
  "save_note",
  "list_notes",
  "export_module_data",
  // Memory
  "remember",
  "forget",
  "my_profile",
  "recall_memory",
  // Query / analytics ("talk to your data", PR1-3) — rendered as a
  // structured DataResultCard (see QUERY_TOOLS).
  ...QUERY_TOOLS,
]);

interface CardInput {
  /** Назва tool-а від Anthropic — `action.name`. */
  name: string;
  /** Сирий input до tool-а (для генерації summary). */
  input: ChatAction["input"] | Record<string, unknown>;
  /** Текстовий результат `executeAction` — fallback summary. */
  result: string;
  /**
   * Ознака помилки: якщо result починається з «Помилка» / «Невідома дія»
   * — статус failed.
   */
  failed?: boolean;
}

const FAILURE_RE = /^(Помилка|Невідома дія)/;

function deriveStatus(
  result: string,
  explicitFailed?: boolean,
): ChatActionCardStatus {
  if (explicitFailed) return "failed";
  return FAILURE_RE.test(result) ? "failed" : "completed";
}

/**
 * Будує картку для одного tool-call. Якщо tool не у KNOWN_TOOLS —
 * повертає `null` (UI лишає лише текстовий fallback).
 */
export function buildActionCard(input: CardInput): ChatActionCard | null {
  if (!KNOWN_TOOLS.has(input.name)) return null;

  const status = deriveStatus(input.result, input.failed);
  const inputObj = (input.input || {}) as Record<string, unknown>;
  const title = titleFor(input.name, status);
  const summary = summaryFor(input.name, inputObj, input.result);
  const module = moduleFor(input.name);
  const icon = iconFor(input.name);
  const risky = RISKY_TOOLS.has(input.name);
  const data = QUERY_TOOLS.has(input.name);

  return {
    id: `card_${input.name}_${Math.random().toString(36).slice(2, 10)}`,
    toolName: input.name,
    status,
    title,
    summary,
    module,
    icon,
    ...(risky ? { risky: true } : {}),
    ...(data ? { data: true } : {}),
  };
}

export function isRiskyTool(name: string): boolean {
  return RISKY_TOOLS.has(name);
}

/**
 * `true` для read-only query/analytics tool-ів, чию картку UI рендерить
 * як структуровану `DataResultCard` ("talk to your data", PR4).
 */
export function isDataResultTool(name: string): boolean {
  return QUERY_TOOLS.has(name);
}
