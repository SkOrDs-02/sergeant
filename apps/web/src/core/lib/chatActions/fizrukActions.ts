import { calculate1rm } from "./fizrukActions/calculator";
import { logMeasurement } from "./fizrukActions/measurements";
import { addProgramDay } from "./fizrukActions/programs";
import {
  compareProgress,
  suggestWorkout,
  weightChart,
} from "./fizrukActions/analytics";
import { logWellbeing } from "./fizrukActions/wellbeing";
import {
  copyWorkout,
  finishWorkout,
  logSet,
  planWorkout,
  startWorkout,
} from "./fizrukActions/workouts";
import type {
  AddProgramDayAction,
  Calculate1rmAction,
  ChatAction,
  ChatActionResult,
  CompareProgressAction,
  CopyWorkoutAction,
  FinishWorkoutAction,
  LogMeasurementAction,
  LogSetAction,
  LogWellbeingAction,
  PlanWorkoutAction,
  StartWorkoutAction,
  SuggestWorkoutAction,
  WeightChartAction,
} from "./types";

/**
 * Fizruk-domain HubChat tool dispatcher. Routes each `ChatAction.name`
 * до відповідного per-feature handler у `fizrukActions/*`. Handlers
 * повертають `string` (plain `tool_result`) або `ChatActionUndoableResult`
 * (string + undo callback). Original 672-LOC switch був декомпозований
 * на 6 файлів за фічами (workouts/measurements/programs/wellbeing/
 * analytics/calculator); цей файл лишається thin router < 100 LOC.
 */
export function handleFizrukAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "plan_workout":
      return planWorkout(action as PlanWorkoutAction);
    case "log_set":
      return logSet(action as LogSetAction);
    case "start_workout":
      return startWorkout(action as StartWorkoutAction);
    case "finish_workout":
      return finishWorkout(action as FinishWorkoutAction);
    case "log_measurement":
      return logMeasurement(action as LogMeasurementAction);
    case "add_program_day":
      return addProgramDay(action as AddProgramDayAction);
    case "log_wellbeing":
      return logWellbeing(action as LogWellbeingAction);
    case "suggest_workout":
      return suggestWorkout(action as SuggestWorkoutAction);
    case "copy_workout":
      return copyWorkout(action as CopyWorkoutAction);
    case "compare_progress":
      return compareProgress(action as CompareProgressAction);
    case "weight_chart":
      return weightChart(action as WeightChartAction);
    case "calculate_1rm":
      return calculate1rm(action as Calculate1rmAction);
    default:
      return undefined;
  }
}
