/**
 * Module onboarding checklists — shared, DOM-free logic.
 *
 * Each module has 3–4 actionable steps that guide the user from first
 * entry to "aha-moment". State is persisted per-module via KVStore so
 * progress survives restarts. The checklist is visible for the first
 * 7 days (or until all steps are completed / dismissed).
 */

import type { DashboardModuleId } from "./dashboard";
import { readJSON, writeJSON, type KVStore } from "../storage/kv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecklistStep {
  id: string;
  label: string;
  /** Optional deep-link action hint (e.g. "add_expense", "open_analytics"). */
  action?: string;
}

export interface ChecklistDefinition {
  moduleId: DashboardModuleId;
  title: string;
  steps: ChecklistStep[];
}

export interface ChecklistState {
  completedSteps: string[];
  dismissed: boolean;
  /** ISO timestamp of first checklist view. */
  firstSeenAt: string | null;
}

const EMPTY_STATE: ChecklistState = {
  completedSteps: [],
  dismissed: false,
  firstSeenAt: null,
};

// ---------------------------------------------------------------------------
// Checklist definitions per module
// ---------------------------------------------------------------------------

export const MODULE_CHECKLISTS: Record<DashboardModuleId, ChecklistDefinition> =
  {
    finyk: {
      moduleId: "finyk",
      title: "Фінік: Перші кроки",
      steps: [
        {
          id: "add_expense",
          label: "Додати першу витрату",
          action: "add_expense",
        },
        { id: "set_budget", label: "Встановити бюджет", action: "set_budget" },
        {
          id: "connect_bank",
          label: "Підключити Monobank",
          action: "connect_bank",
        },
        {
          id: "view_analytics",
          label: "Переглянути аналітику",
          action: "view_analytics",
        },
      ],
    },
    fizruk: {
      moduleId: "fizruk",
      title: "Фізрук: Перші кроки",
      steps: [
        {
          id: "start_workout",
          label: "Розпочати тренування",
          action: "start_workout",
        },
        { id: "complete_workout", label: "Завершити тренування" },
        { id: "set_program", label: "Обрати програму", action: "set_program" },
        {
          id: "check_progress",
          label: "Переглянути прогрес",
          action: "check_progress",
        },
      ],
    },
    routine: {
      moduleId: "routine",
      title: "Рутина: Перші кроки",
      steps: [
        {
          id: "create_habit",
          label: "Створити першу звичку",
          action: "create_habit",
        },
        { id: "complete_habit", label: "Відмітити виконання" },
        { id: "three_day_streak", label: "Серія 3 дні" },
      ],
    },
    nutrition: {
      moduleId: "nutrition",
      title: "Харчування: Перші кроки",
      steps: [
        { id: "log_meal", label: "Залогати прийом їжі", action: "log_meal" },
        {
          id: "photo_analysis",
          label: "Спробувати фото-аналіз",
          action: "photo_analysis",
        },
        {
          id: "daily_plan",
          label: "Переглянути денний план",
          action: "daily_plan",
        },
      ],
    },
  };

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function storageKey(moduleId: DashboardModuleId): string {
  return `${moduleId}_checklist_v1`;
}

export function getChecklistState(
  store: KVStore,
  moduleId: DashboardModuleId,
): ChecklistState {
  const data = readJSON<ChecklistState>(store, storageKey(moduleId));
  if (!data || typeof data !== "object") return { ...EMPTY_STATE };
  return {
    completedSteps: Array.isArray(data.completedSteps)
      ? data.completedSteps.filter((s): s is string => typeof s === "string")
      : [],
    dismissed: typeof data.dismissed === "boolean" ? data.dismissed : false,
    firstSeenAt: typeof data.firstSeenAt === "string" ? data.firstSeenAt : null,
  };
}

export function saveChecklistState(
  store: KVStore,
  moduleId: DashboardModuleId,
  state: ChecklistState,
): void {
  writeJSON(store, storageKey(moduleId), state);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function markChecklistStepDone(
  store: KVStore,
  moduleId: DashboardModuleId,
  stepId: string,
): ChecklistState {
  const state = getChecklistState(store, moduleId);
  if (!state.completedSteps.includes(stepId)) {
    state.completedSteps = [...state.completedSteps, stepId];
  }
  saveChecklistState(store, moduleId, state);
  return state;
}

export function dismissChecklist(
  store: KVStore,
  moduleId: DashboardModuleId,
): ChecklistState {
  const state = getChecklistState(store, moduleId);
  state.dismissed = true;
  saveChecklistState(store, moduleId, state);
  return state;
}

export function markChecklistSeen(
  store: KVStore,
  moduleId: DashboardModuleId,
): ChecklistState {
  const state = getChecklistState(store, moduleId);
  if (!state.firstSeenAt) {
    state.firstSeenAt = new Date().toISOString();
    saveChecklistState(store, moduleId, state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** Max age (in ms) before checklist auto-hides. */
const CHECKLIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isChecklistVisible(
  store: KVStore,
  moduleId: DashboardModuleId,
): boolean {
  const def = MODULE_CHECKLISTS[moduleId];
  const state = getChecklistState(store, moduleId);
  if (state.dismissed) return false;
  if (state.completedSteps.length >= def.steps.length) return false;
  if (state.firstSeenAt) {
    const age = Date.now() - new Date(state.firstSeenAt).getTime();
    if (age > CHECKLIST_MAX_AGE_MS) return false;
  }
  return true;
}

export function getChecklistProgress(
  store: KVStore,
  moduleId: DashboardModuleId,
): { completed: number; total: number } {
  const def = MODULE_CHECKLISTS[moduleId];
  const state = getChecklistState(store, moduleId);
  return {
    completed: state.completedSteps.filter((s) =>
      def.steps.some((step) => step.id === s),
    ).length,
    total: def.steps.length,
  };
}

/** Reset all checklists (used in onboarding reset). */
export function resetAllChecklists(store: KVStore): void {
  const moduleIds: DashboardModuleId[] = [
    "finyk",
    "fizruk",
    "routine",
    "nutrition",
  ];
  for (const id of moduleIds) {
    store.remove(storageKey(id));
  }
}
