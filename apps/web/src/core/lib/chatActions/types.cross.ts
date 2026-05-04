/**
 * Крос-модульні chat-action payload-и: briefing, summary, аналітика,
 * notes/memory, утиліти, export/import. Виокремлено з `types.ts`
 * (initiative 0001 Phase 2).
 */

import type { ModuleAccent } from "@sergeant/design-tokens";

// ─── Briefing / weekly summary ─────────────────────────────────────────────

export interface MorningBriefingAction {
  name: "morning_briefing";
  input: Record<string, never>;
}

export interface WeeklySummaryAction {
  name: "weekly_summary";
  input: { include_recommendations?: boolean };
}

// ─── Goal / progress ───────────────────────────────────────────────────────

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

// ─── Аналітика (cross-module dashboards) ───────────────────────────────────

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

export type CompareWeeksModule = ModuleAccent;

export interface CompareWeeksAction {
  name: "compare_weeks";
  input: {
    week_a?: string;
    week_b?: string;
    modules?: CompareWeeksModule[];
  };
}

// ─── Утиліти ───────────────────────────────────────────────────────────────

export interface ConvertUnitsAction {
  name: "convert_units";
  input: { value: number | string; from: string; to: string };
}

// ─── Notes / memory ────────────────────────────────────────────────────────

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
