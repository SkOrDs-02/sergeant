/**
 * HubChat action-types barrel.
 *
 * Чисті action-payload-и + share-shape entities тепер живуть у
 * `types.<domain>.ts` (initiative 0001 Phase 2 — module-decomposition).
 * Цей файл лишається публічним entry-point-ом, тому жоден consumer
 * (`./serverActions`, `./crossActions`, `./finykActions`,
 * `./routineActions`, `./nutritionActions`, `./fizrukActions`, …)
 * не змінює свої імпорти.
 *
 * Тут зосереджено лише дві речі:
 *   1. Re-export усіх payload-ів і entities з доменних файлів.
 *   2. Дискримінований union `ChatAction`, який мусить бачити їх усіх,
 *      бо handler dispatch і Anthropic tool-schema спираються саме на нього.
 */

import type {
  ChangeCategoryAction,
  FindTransactionAction,
  BatchCategorizeAction,
  CreateDebtAction,
  CreateReceivableAction,
  HideTransactionAction,
  SetBudgetLimitAction,
  SetMonthlyPlanAction,
  CreateTransactionAction,
  DeleteTransactionAction,
  UpdateBudgetAction,
  MarkDebtPaidAction,
  AddAssetAction,
  ImportMonobankRangeAction,
  SplitTransactionAction,
  RecurringExpenseAction,
  ExportReportAction,
} from "./types.finyk";
import type {
  PlanWorkoutAction,
  LogSetAction,
  StartWorkoutAction,
  FinishWorkoutAction,
  LogMeasurementAction,
  AddProgramDayAction,
  LogWellbeingAction,
  LogWeightAction,
  SuggestWorkoutAction,
  CopyWorkoutAction,
  CompareProgressAction,
  Calculate1rmAction,
} from "./types.fizruk";
import type {
  MarkHabitDoneAction,
  CreateHabitAction,
  CreateReminderAction,
  CompleteHabitForDateAction,
  ArchiveHabitAction,
  AddCalendarEventAction,
  EditHabitAction,
  ReorderHabitsAction,
  HabitStatsAction,
  SetHabitScheduleAction,
  PauseHabitAction,
  HabitTrendAction,
} from "./types.routine";
import type {
  LogMealAction,
  LogWaterAction,
  AddRecipeAction,
  AddToShoppingListAction,
  ConsumeFromPantryAction,
  SetDailyPlanAction,
  SuggestMealAction,
  CopyMealFromDateAction,
  PlanMealsForDayAction,
} from "./types.nutrition";
import type {
  MorningBriefingAction,
  WeeklySummaryAction,
  SetGoalAction,
  SpendingTrendAction,
  WeightChartAction,
  CategoryBreakdownAction,
  DetectAnomaliesAction,
  CompareWeeksAction,
  ConvertUnitsAction,
  SaveNoteAction,
  ListNotesAction,
  ExportModuleDataAction,
  RememberAction,
  ForgetAction,
  MyProfileAction,
  RecallMemoryAction,
} from "./types.cross";

// Result-shape для handler-ів.
export type {
  ChatActionResult,
  ChatActionUndoableResult,
} from "./types.result";

// Доменні re-export-и (action payloads + share-shape entities).
export type {
  // Action payloads
  ChangeCategoryAction,
  FindTransactionAction,
  BatchCategorizeAction,
  CreateDebtAction,
  CreateReceivableAction,
  HideTransactionAction,
  SetBudgetLimitAction,
  SetMonthlyPlanAction,
  CreateTransactionAction,
  DeleteTransactionAction,
  UpdateBudgetAction,
  MarkDebtPaidAction,
  AddAssetAction,
  ImportMonobankRangeAction,
  SplitTransactionAction,
  RecurringExpenseAction,
  ExportReportAction,
  // Domain entities
  BudgetLimit,
  BudgetGoal,
  Budget,
  Debt,
  Receivable,
  MonthlyPlan,
} from "./types.finyk";

export type {
  // Action payloads
  PlanWorkoutAction,
  LogSetAction,
  StartWorkoutAction,
  FinishWorkoutAction,
  LogMeasurementAction,
  AddProgramDayAction,
  LogWellbeingAction,
  LogWeightAction,
  SuggestWorkoutAction,
  CopyWorkoutAction,
  CompareProgressAction,
  Calculate1rmAction,
  // Domain entities
  WorkoutSet,
  WorkoutItem,
  Workout,
} from "./types.fizruk";

export type {
  // Action payloads
  MarkHabitDoneAction,
  CreateHabitAction,
  CreateReminderAction,
  CompleteHabitForDateAction,
  ArchiveHabitAction,
  AddCalendarEventAction,
  EditHabitAction,
  ReorderHabitsAction,
  HabitStatsAction,
  SetHabitScheduleAction,
  PauseHabitAction,
  HabitTrendAction,
  // Domain entities
  HabitState,
} from "./types.routine";

export type {
  // Action payloads
  LogMealAction,
  LogWaterAction,
  AddRecipeAction,
  AddToShoppingListAction,
  ConsumeFromPantryAction,
  SetDailyPlanAction,
  SuggestMealAction,
  CopyMealFromDateAction,
  PlanMealsForDayAction,
  // Domain entities
  NutritionMeal,
  NutritionDay,
} from "./types.nutrition";

export type {
  MorningBriefingAction,
  WeeklySummaryAction,
  SetGoalAction,
  SpendingTrendAction,
  WeightChartAction,
  CategoryBreakdownAction,
  DetectAnomaliesAction,
  CompareWeeksAction,
  CompareWeeksModule,
  ConvertUnitsAction,
  SaveNoteAction,
  ListNotesAction,
  ExportModuleDataAction,
  RememberAction,
  ForgetAction,
  MyProfileAction,
  RecallMemoryAction,
} from "./types.cross";

/**
 * Дискримінований union усіх HubChat tool-payload-ів. Останній варіант —
 * `{ name: string; input: Record<string, unknown> }` — навмисно широкий
 * fallback для невідомих/нових tool-name-ів, які можуть прийти з
 * Anthropic API (forward-compat) до того, як ми додамо сюди типи.
 */
export type ChatAction =
  // finyk
  | ChangeCategoryAction
  | FindTransactionAction
  | BatchCategorizeAction
  | CreateDebtAction
  | CreateReceivableAction
  | HideTransactionAction
  | SetBudgetLimitAction
  | SetMonthlyPlanAction
  | CreateTransactionAction
  | DeleteTransactionAction
  | UpdateBudgetAction
  | MarkDebtPaidAction
  | AddAssetAction
  | ImportMonobankRangeAction
  | SplitTransactionAction
  | RecurringExpenseAction
  | ExportReportAction
  // fizruk
  | PlanWorkoutAction
  | LogSetAction
  | StartWorkoutAction
  | FinishWorkoutAction
  | LogMeasurementAction
  | AddProgramDayAction
  | LogWellbeingAction
  | LogWeightAction
  | SuggestWorkoutAction
  | CopyWorkoutAction
  | CompareProgressAction
  | Calculate1rmAction
  // routine
  | MarkHabitDoneAction
  | CreateHabitAction
  | CreateReminderAction
  | CompleteHabitForDateAction
  | ArchiveHabitAction
  | AddCalendarEventAction
  | EditHabitAction
  | ReorderHabitsAction
  | HabitStatsAction
  | SetHabitScheduleAction
  | PauseHabitAction
  | HabitTrendAction
  // nutrition
  | LogMealAction
  | LogWaterAction
  | AddRecipeAction
  | AddToShoppingListAction
  | ConsumeFromPantryAction
  | SetDailyPlanAction
  | SuggestMealAction
  | CopyMealFromDateAction
  | PlanMealsForDayAction
  // cross
  | MorningBriefingAction
  | WeeklySummaryAction
  | SetGoalAction
  | SpendingTrendAction
  | WeightChartAction
  | CategoryBreakdownAction
  | DetectAnomaliesAction
  | CompareWeeksAction
  | ConvertUnitsAction
  | SaveNoteAction
  | ListNotesAction
  | ExportModuleDataAction
  | RememberAction
  | ForgetAction
  | MyProfileAction
  | RecallMemoryAction
  | { name: string; input: Record<string, unknown> };
