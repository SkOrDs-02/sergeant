import type { ModuleAccent } from "@sergeant/design-tokens";

/**
 * Виконані mutator-handler-и можуть опційно повернути об'єкт з полем
 * `undo`, яке HubChat сам пропустить через `showUndoToast`. Read-only
 * tools (`find_transaction`, `weekly_summary`, …) залишаються
 * `string` — там нема що реверсити. Це навмисно дискриміноване
 * об'єднання, а не загальне `unknown`-розширення: тип дозволяє
 * перевіряти `typeof out === "string"` як «не було undo» без додаткових
 * runtime-перевірок.
 */
export interface ChatActionUndoableResult {
  /** Текст для `tool_result` (та чату). Identical до того, що раніше було сам по собі `string`. */
  result: string;
  /**
   * Реверсує мутацію handler-а. Викликається з обробника `showUndoToast`
   * у HubChat, тож має бути ідемпотентним і не кидати на повторний клік
   * (показ undo-toast гарантує максимум одне натискання, але safer is safer).
   */
  undo: () => void;
}

/**
 * Уніфікований результат handler-а. Старі handler-и далі повертають
 * `string` без жодних змін; нові mutator-и повертають
 * `ChatActionUndoableResult` коли мають reverse-snapshot.
 */
export type ChatActionResult = string | ChatActionUndoableResult;

export interface ChangeCategoryAction {
  name: "change_category";
  input: { tx_id: string; category_id: string };
}

export interface FindTransactionAction {
  name: "find_transaction";
  input: {
    query?: string;
    amount?: number | string;
    amount_tolerance?: number | string;
    date_from?: string;
    date_to?: string;
    limit?: number | string;
  };
}

export interface BatchCategorizeAction {
  name: "batch_categorize";
  input: {
    pattern: string;
    category_id: string;
    dry_run?: boolean;
    amount?: number | string;
    amount_tolerance?: number | string;
    date_from?: string;
    date_to?: string;
    limit?: number | string;
  };
}

export interface CreateDebtAction {
  name: "create_debt";
  input: {
    name: string;
    amount: number | string;
    due_date?: string;
    emoji?: string;
  };
}

export interface CreateReceivableAction {
  name: "create_receivable";
  input: { name: string; amount: number | string };
}

export interface HideTransactionAction {
  name: "hide_transaction";
  input: { tx_id: string };
}

export interface SetBudgetLimitAction {
  name: "set_budget_limit";
  input: { category_id: string; limit: number | string };
}

export interface SetMonthlyPlanAction {
  name: "set_monthly_plan";
  input: {
    income?: number | string | null;
    expense?: number | string | null;
    savings?: number | string | null;
  };
}

export interface MarkHabitDoneAction {
  name: "mark_habit_done";
  input: { habit_id: string; date?: string };
}

export interface PlanWorkoutAction {
  name: "plan_workout";
  input: {
    date?: string;
    time?: string;
    note?: string;
    exercises?: Array<{
      name: string;
      sets?: number | string;
      reps?: number | string;
      weight?: number | string;
    }>;
  };
}

export interface LogMealAction {
  name: "log_meal";
  input: {
    name?: string;
    kcal?: number | string;
    protein_g?: number | string;
    fat_g?: number | string;
    carbs_g?: number | string;
  };
}

export interface CreateHabitAction {
  name: "create_habit";
  input: {
    name: string;
    emoji?: string;
    recurrence?: string;
    weekdays?: number[];
    time_of_day?: string;
  };
}

export interface CreateTransactionAction {
  name: "create_transaction";
  input: {
    type?: string;
    amount: number | string;
    category?: string;
    description?: string;
    date?: string;
  };
}

export interface LogSetAction {
  name: "log_set";
  input: {
    exercise_name: string;
    weight_kg?: number | string;
    reps: number | string;
    sets?: number | string;
  };
}

export interface LogWaterAction {
  name: "log_water";
  input: {
    amount_ml: number | string;
    date?: string;
  };
}

export interface DeleteTransactionAction {
  name: "delete_transaction";
  input: { tx_id: string };
}

export interface UpdateBudgetAction {
  name: "update_budget";
  input: {
    scope: "limit" | "goal";
    category_id?: string;
    limit?: number | string;
    name?: string;
    target_amount?: number | string;
    saved_amount?: number | string;
  };
}

export interface MarkDebtPaidAction {
  name: "mark_debt_paid";
  input: {
    debt_id: string;
    amount?: number | string;
    note?: string;
  };
}

export interface AddAssetAction {
  name: "add_asset";
  input: {
    name: string;
    amount: number | string;
    currency?: string;
  };
}

export interface ImportMonobankRangeAction {
  name: "import_monobank_range";
  input: { from: string; to: string };
}

export interface StartWorkoutAction {
  name: "start_workout";
  input: { note?: string; date?: string; time?: string };
}

export interface FinishWorkoutAction {
  name: "finish_workout";
  input: { workout_id?: string };
}

export interface LogMeasurementAction {
  name: "log_measurement";
  input: Record<string, number | string | undefined>;
}

export interface AddProgramDayAction {
  name: "add_program_day";
  input: {
    weekday: number | string;
    name: string;
    exercises?: Array<{
      name: string;
      sets?: number | string;
      reps?: number | string;
      weight?: number | string;
    }>;
  };
}

export interface LogWellbeingAction {
  name: "log_wellbeing";
  input: {
    weight_kg?: number | string;
    sleep_hours?: number | string;
    energy_level?: number | string;
    mood_score?: number | string;
    note?: string;
  };
}

export interface CreateReminderAction {
  name: "create_reminder";
  input: { habit_id: string; time: string };
}

export interface CompleteHabitForDateAction {
  name: "complete_habit_for_date";
  input: { habit_id: string; date: string; completed?: boolean };
}

export interface ArchiveHabitAction {
  name: "archive_habit";
  input: { habit_id: string; archived?: boolean };
}

export interface AddCalendarEventAction {
  name: "add_calendar_event";
  input: { name: string; date: string; time?: string; emoji?: string };
}

export interface AddRecipeAction {
  name: "add_recipe";
  input: {
    title: string;
    ingredients?: string[];
    steps?: string[];
    servings?: number | string;
    time_minutes?: number | string;
    kcal?: number | string;
    protein_g?: number | string;
    fat_g?: number | string;
    carbs_g?: number | string;
  };
}

export interface AddToShoppingListAction {
  name: "add_to_shopping_list";
  input: {
    name: string;
    quantity?: string;
    note?: string;
    category?: string;
  };
}

export interface ConsumeFromPantryAction {
  name: "consume_from_pantry";
  input: { name: string };
}

export interface SetDailyPlanAction {
  name: "set_daily_plan";
  input: {
    kcal?: number | string;
    protein_g?: number | string;
    fat_g?: number | string;
    carbs_g?: number | string;
    water_ml?: number | string;
  };
}

export interface LogWeightAction {
  name: "log_weight";
  input: { weight_kg: number | string; note?: string };
}

export interface SuggestWorkoutAction {
  name: "suggest_workout";
  input: { focus?: string };
}

export interface CopyWorkoutAction {
  name: "copy_workout";
  input: { source_workout_id?: string; date?: string };
}

export interface CompareProgressAction {
  name: "compare_progress";
  input: {
    exercise_name?: string;
    muscle_group?: string;
    period_days?: number | string;
  };
}

export interface SplitTransactionAction {
  name: "split_transaction";
  input: {
    tx_id: string;
    parts: Array<{ category_id: string; amount: number | string }>;
  };
}

export interface RecurringExpenseAction {
  name: "recurring_expense";
  input: {
    name: string;
    amount: number | string;
    day_of_month?: number | string;
    category?: string;
  };
}

export interface ExportReportAction {
  name: "export_report";
  input: { period?: string; from?: string; to?: string };
}

export interface EditHabitAction {
  name: "edit_habit";
  input: {
    habit_id: string;
    name?: string;
    emoji?: string;
    recurrence?: string;
    weekdays?: number[];
  };
}

export interface ReorderHabitsAction {
  name: "reorder_habits";
  input: { habit_ids: string[] };
}

export interface HabitStatsAction {
  name: "habit_stats";
  input: { habit_id: string; period_days?: number | string };
}

export interface SetHabitScheduleAction {
  name: "set_habit_schedule";
  input: { habit_id: string; days: string[] };
}

export interface PauseHabitAction {
  name: "pause_habit";
  input: { habit_id: string; paused?: boolean };
}

export interface SuggestMealAction {
  name: "suggest_meal";
  input: { focus?: string; meal_type?: string };
}

export interface CopyMealFromDateAction {
  name: "copy_meal_from_date";
  input: { source_date: string; meal_index?: number | string };
}

export interface PlanMealsForDayAction {
  name: "plan_meals_for_day";
  input: {
    target_kcal?: number | string;
    meals_count?: number | string;
    preferences?: string;
  };
}

export interface MorningBriefingAction {
  name: "morning_briefing";
  input: Record<string, never>;
}

export interface WeeklySummaryAction {
  name: "weekly_summary";
  input: { include_recommendations?: boolean };
}

export interface SetGoalAction {
  name: "set_goal";
  input: {
    description: string;
    target_weight_kg?: number | string;
    target_date?: string;
    daily_kcal?: number | string;
    workouts_per_week?: number | string;
  };
}

export interface SpendingTrendAction {
  name: "spending_trend";
  input: { period_days?: number | string };
}

export interface WeightChartAction {
  name: "weight_chart";
  input: { period_days?: number | string };
}

export interface CategoryBreakdownAction {
  name: "category_breakdown";
  input: { period_days?: number | string };
}

export interface DetectAnomaliesAction {
  name: "detect_anomalies";
  input: {
    period_days?: number | string;
    threshold_multiplier?: number | string;
  };
}

export interface HabitTrendAction {
  name: "habit_trend";
  input: { habit_id?: string; period_days?: number | string };
}

export type CompareWeeksModule = ModuleAccent;

export interface CompareWeeksAction {
  name: "compare_weeks";
  input: {
    week_a?: string;
    week_b?: string;
    modules?: CompareWeeksModule[];
  };
}

export interface Calculate1rmAction {
  name: "calculate_1rm";
  input: {
    weight_kg: number | string;
    reps: number | string;
    exercise_name?: string;
  };
}

export interface ConvertUnitsAction {
  name: "convert_units";
  input: { value: number | string; from: string; to: string };
}

export interface SaveNoteAction {
  name: "save_note";
  input: { text: string; tag?: string };
}

export interface ListNotesAction {
  name: "list_notes";
  input: { tag?: string; limit?: number | string };
}

export interface ExportModuleDataAction {
  name: "export_module_data";
  input: { module: string; format?: string };
}

export interface RememberAction {
  name: "remember";
  input: { fact: string; category?: string };
}

export interface ForgetAction {
  name: "forget";
  input: { fact_id: string };
}

export interface MyProfileAction {
  name: "my_profile";
  input: { category?: string };
}

export interface RecallMemoryAction {
  name: "recall_memory";
  input: {
    query: string;
    top_k?: number | string;
    sources?: string[];
  };
}

export type ChatAction =
  | ChangeCategoryAction
  | FindTransactionAction
  | BatchCategorizeAction
  | CreateDebtAction
  | CreateReceivableAction
  | HideTransactionAction
  | SetBudgetLimitAction
  | SetMonthlyPlanAction
  | MarkHabitDoneAction
  | PlanWorkoutAction
  | LogMealAction
  | CreateHabitAction
  | CreateTransactionAction
  | LogSetAction
  | LogWaterAction
  | DeleteTransactionAction
  | UpdateBudgetAction
  | MarkDebtPaidAction
  | AddAssetAction
  | ImportMonobankRangeAction
  | StartWorkoutAction
  | FinishWorkoutAction
  | LogMeasurementAction
  | AddProgramDayAction
  | LogWellbeingAction
  | CreateReminderAction
  | CompleteHabitForDateAction
  | ArchiveHabitAction
  | AddCalendarEventAction
  | AddRecipeAction
  | AddToShoppingListAction
  | ConsumeFromPantryAction
  | SetDailyPlanAction
  | LogWeightAction
  | SuggestWorkoutAction
  | CopyWorkoutAction
  | CompareProgressAction
  | SplitTransactionAction
  | RecurringExpenseAction
  | ExportReportAction
  | EditHabitAction
  | ReorderHabitsAction
  | HabitStatsAction
  | SetHabitScheduleAction
  | PauseHabitAction
  | SuggestMealAction
  | CopyMealFromDateAction
  | PlanMealsForDayAction
  | MorningBriefingAction
  | WeeklySummaryAction
  | SetGoalAction
  | SpendingTrendAction
  | WeightChartAction
  | CategoryBreakdownAction
  | DetectAnomaliesAction
  | HabitTrendAction
  | CompareWeeksAction
  | Calculate1rmAction
  | ConvertUnitsAction
  | SaveNoteAction
  | ListNotesAction
  | ExportModuleDataAction
  | RememberAction
  | ForgetAction
  | MyProfileAction
  | RecallMemoryAction
  | { name: string; input: Record<string, unknown> };

export interface BudgetLimit {
  id: string;
  type: "limit";
  categoryId: string;
  limit: number;
}

export interface BudgetGoal {
  id: string;
  type: "goal";
  name: string;
  targetAmount: number;
  savedAmount?: number;
}

export type Budget = BudgetLimit | BudgetGoal;

export interface Debt {
  id: string;
  name: string;
  totalAmount: number;
  dueDate: string;
  emoji: string;
  linkedTxIds: string[];
}

export interface Receivable {
  id: string;
  name: string;
  amount: number;
  linkedTxIds: string[];
}

export interface MonthlyPlan {
  income?: string;
  expense?: string;
  savings?: string;
}

export interface HabitState {
  habits: Array<{ id: string; name?: string; emoji?: string }>;
  completions: Record<string, string[]>;
}

export interface WorkoutSet {
  weightKg: number;
  reps: number;
}

export interface WorkoutItem {
  id: string;
  nameUk: string;
  type: "strength";
  musclesPrimary: string[];
  musclesSecondary: string[];
  sets: WorkoutSet[];
  durationSec: number;
  distanceM: number;
}

export interface Workout {
  id: string;
  startedAt: string;
  endedAt: string | null;
  items: WorkoutItem[];
  groups: unknown[];
  warmup: unknown | null;
  cooldown: unknown | null;
  note: string;
  planned: boolean;
}

export interface NutritionMeal {
  id: string;
  name: string;
  macros: {
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
  };
  addedAt: string;
}

export interface NutritionDay {
  meals: NutritionMeal[];
}
