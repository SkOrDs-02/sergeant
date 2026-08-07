/**
 * Canonical HubChat tool-name registry — single source of truth for the
 * contract between server tool *definitions*
 * (`apps/server/src/modules/chat/toolDefs/*.ts`) and client tool
 * *executors* (`apps/web/src/core/lib/chatActions/*.ts`).
 *
 * WHY THIS EXISTS (audit gap #2, 2026-08): the server declares tool names
 * to Anthropic (`toolDefs/*.ts` → `tools.ts` → `TOOLS`) and the web app
 * dispatches `tool_use` blocks by name (`chatActions/*.ts` switch
 * statements). Nothing previously enforced that the two lists stayed in
 * sync — a tool added on one side without the other either (a) is
 * offered to the model but silently no-ops on the client, or (b) has a
 * client handler nothing ever calls. This registry is the literal source
 * of truth both sides parity-test against:
 *
 *   - server: `apps/server/src/modules/chat/toolDefs/toolNamesRegistry.test.ts`
 *     asserts every `TOOLS` entry name is in `ALL_HUBCHAT_TOOL_NAMES` and
 *     vice versa (fails on drift in either direction).
 *   - web: `apps/web/src/core/lib/chatActions/**` should assert the same
 *     against its dispatcher's handled-name set.
 *
 * Grouping mirrors the domain split in `apps/server/src/modules/chat/
 * toolDefs/*.ts` (and the import order in `toolDefs/../tools.ts`) purely
 * for readability — it carries no runtime meaning of its own. When adding
 * a tool: add its name here in the matching group FIRST, then wire the
 * server `toolDefs/*.ts` entry and the web executor. The parity test will
 * fail loudly if either side is forgotten.
 */

export const FINYK_TOOL_NAMES = [
  "change_category",
  "find_transaction",
  "batch_categorize",
  "create_debt",
  "create_receivable",
  "hide_transaction",
  "set_budget_limit",
  "set_monthly_plan",
  "create_transaction",
  "delete_transaction",
  "update_budget",
  "mark_debt_paid",
  "add_asset",
  "import_monobank_range",
  "split_transaction",
  "recurring_expense",
  "export_report",
] as const;

export const QUERY_FINYK_TOOL_NAMES = [
  "query_transactions",
  "aggregate_spending",
  "compare_periods",
] as const;

export const FIZRUK_TOOL_NAMES = [
  "plan_workout",
  "log_set",
  "start_workout",
  "finish_workout",
  "log_measurement",
  "add_program_day",
  "log_wellbeing",
  "log_weight",
  "suggest_workout",
  "copy_workout",
  "compare_progress",
] as const;

export const QUERY_FIZRUK_TOOL_NAMES = [
  "query_workouts",
  "exercise_progress",
  "training_stats",
] as const;

export const ROUTINE_TOOL_NAMES = [
  "mark_habit_done",
  "create_habit",
  "create_reminder",
  "complete_habit_for_date",
  "archive_habit",
  "add_calendar_event",
  "edit_habit",
  "reorder_habits",
  "habit_stats",
  "set_habit_schedule",
  "pause_habit",
] as const;

export const QUERY_ROUTINE_TOOL_NAMES = [
  "query_habits",
  "habit_correlation",
] as const;

export const NUTRITION_TOOL_NAMES = [
  "log_water",
  "log_meal",
  "add_recipe",
  "add_to_shopping_list",
  "consume_from_pantry",
  "clear_pantry",
  "set_daily_plan",
  "suggest_meal",
  "copy_meal_from_date",
  "plan_meals_for_day",
] as const;

export const QUERY_NUTRITION_TOOL_NAMES = [
  "query_nutrition",
  "nutrition_averages",
] as const;

export const CROSS_MODULE_TOOL_NAMES = [
  "morning_briefing",
  "weekly_summary",
  "set_goal",
  "spending_trend",
  "weight_chart",
  "category_breakdown",
  "get_daily_series",
  "detect_anomalies",
  "habit_trend",
  "compare_weeks",
] as const;

export const UTILITY_TOOL_NAMES = [
  "calculate_1rm",
  "convert_units",
  "save_note",
  "list_notes",
  "export_module_data",
] as const;

export const MEMORY_TOOL_NAMES = [
  "remember",
  "forget",
  "my_profile",
  "recall_memory",
] as const;

/**
 * Flat union of every group above, in the same order as `tools.ts`
 * spreads `TOOLS`. This is the array both the server parity test and any
 * web-side parity test should diff their own name lists against.
 */
export const ALL_HUBCHAT_TOOL_NAMES = [
  ...FINYK_TOOL_NAMES,
  ...QUERY_FINYK_TOOL_NAMES,
  ...ROUTINE_TOOL_NAMES,
  ...QUERY_ROUTINE_TOOL_NAMES,
  ...FIZRUK_TOOL_NAMES,
  ...QUERY_FIZRUK_TOOL_NAMES,
  ...NUTRITION_TOOL_NAMES,
  ...QUERY_NUTRITION_TOOL_NAMES,
  ...CROSS_MODULE_TOOL_NAMES,
  ...UTILITY_TOOL_NAMES,
  ...MEMORY_TOOL_NAMES,
] as const;

/** Union type of every canonical HubChat tool name. */
export type HubChatToolName = (typeof ALL_HUBCHAT_TOOL_NAMES)[number];

/** O(1) membership check set, derived from `ALL_HUBCHAT_TOOL_NAMES`. */
export const HUBCHAT_TOOL_NAME_SET: ReadonlySet<HubChatToolName> = new Set(
  ALL_HUBCHAT_TOOL_NAMES,
);

/** Type guard — narrows an arbitrary string to `HubChatToolName`. */
export function isHubChatToolName(name: string): name is HubChatToolName {
  return HUBCHAT_TOOL_NAME_SET.has(name as HubChatToolName);
}
