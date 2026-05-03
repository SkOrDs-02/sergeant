import {
  morningBriefing,
  weeklySummary,
} from "./crossActions/briefingHandlers";
import { compareWeeks } from "./crossActions/compareWeeksHandler";
import { exportModuleData } from "./crossActions/exportHandler";
import {
  categoryBreakdown,
  detectAnomalies,
  spendingTrend,
} from "./crossActions/financeAnalytics";
import { convertUnits, setGoal } from "./crossActions/goalAndUtility";
import { forget, myProfile, remember } from "./crossActions/memoryHandlers";
import { listNotes, saveNote } from "./crossActions/noteHandlers";
import type {
  CategoryBreakdownAction,
  ChatAction,
  ChatActionResult,
  CompareWeeksAction,
  ConvertUnitsAction,
  DetectAnomaliesAction,
  ExportModuleDataAction,
  ForgetAction,
  ListNotesAction,
  MyProfileAction,
  RememberAction,
  SaveNoteAction,
  SetGoalAction,
  SpendingTrendAction,
} from "./types";

/**
 * Cross-module HubChat tool dispatcher. Routes each `ChatAction.name` to
 * the matching per-domain handler in `crossActions/*`. Handlers return
 * either a `string` (plain `tool_result`) or `ChatActionUndoableResult`
 * (string + undo callback). The original switch-statement implementation
 * was decomposed in PR #1407 to keep `crossActions.ts` < 100 LOC.
 */
export function handleCrossAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "morning_briefing":
      return morningBriefing();
    case "weekly_summary":
      return weeklySummary();
    case "set_goal":
      return setGoal(action as SetGoalAction);
    case "spending_trend":
      return spendingTrend(action as SpendingTrendAction);
    case "category_breakdown":
      return categoryBreakdown(action as CategoryBreakdownAction);
    case "detect_anomalies":
      return detectAnomalies(action as DetectAnomaliesAction);
    case "convert_units":
      return convertUnits(action as ConvertUnitsAction);
    case "save_note":
      return saveNote(action as SaveNoteAction);
    case "list_notes":
      return listNotes(action as ListNotesAction);
    case "remember":
      return remember(action as RememberAction);
    case "forget":
      return forget(action as ForgetAction);
    case "my_profile":
      return myProfile(action as MyProfileAction);
    case "export_module_data":
      return exportModuleData(action as ExportModuleDataAction);
    case "compare_weeks":
      return compareWeeks(action as CompareWeeksAction);
    default:
      return undefined;
  }
}
