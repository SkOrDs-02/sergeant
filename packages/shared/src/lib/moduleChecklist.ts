/**
 * Module onboarding checklists — shared, DOM-free logic.
 *
 * Each module has 3–4 actionable steps that guide the user from first
 * entry to "aha-moment". The checklist is visible for the first 7 days
 * of the **account** (or until all steps are done / dismissed).
 *
 * AI-CONTEXT: a step is "done" when EITHER real data proves it
 * (`ChecklistSignals`, derived in `moduleChecklistSignals.ts`) OR the
 * user tapped the row (`ChecklistState.completedSteps`, persisted per
 * module via KVStore). Tap-only was the original design and it made the
 * card unable to ever satisfy itself: nothing in the product marked a
 * step done when the user actually added an expense or connected a
 * bank, so a veteran user was permanently stuck at "0/4 виконано".
 *
 * AI-DANGER: signals are **positive-only evidence**. Several of them are
 * "today"-scoped (routine `todayDone`, nutrition `todayCal`, fizruk
 * `weekWorkouts`), so `false` means "no proof", never "not done" — a
 * user who simply skipped today must not have a step un-ticked. Keep the
 * resolution an OR and never let a falsy signal clear `completedSteps`.
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
  /**
   * Step ids whose completion logically entails this one — a user who
   * holds a 3-day streak has obviously already created and ticked a
   * habit. Resolved transitively by {@link resolveChecklistSteps}.
   */
  impliedBy?: readonly string[];
}

/**
 * Externally-derived, positive-only evidence that a step is done, keyed
 * by step id. `true` completes the step; `false` / absent leaves it to
 * the tap-recorded state. Built by `deriveChecklistSignals`.
 */
export type ChecklistSignals = Readonly<Record<string, boolean | undefined>>;

/** A checklist step with its resolved completion state. */
export interface ResolvedChecklistStep extends ChecklistStep {
  done: boolean;
  /** `true` when real data (not a tap) is what completed the step. */
  provenByData: boolean;
}

/**
 * Inputs that decide whether the checklist still belongs on screen.
 * Everything here is optional so legacy two-argument call-sites keep
 * compiling and fall back to the previous device-local behaviour.
 */
export interface ChecklistVisibilityContext {
  /**
   * Server-stamped Better Auth `user.createdAt` (ISO-8601). This is the
   * canonical age signal: it survives a storage wipe, a reinstall and a
   * switch of device or browser. `null` / omitted means anonymous or
   * unknown, and {@link sessionDays} is used instead.
   */
  accountCreatedAt?: string | null;
  /**
   * Distinct calendar days this *device* opened the Hub. Only consulted
   * when there is no account yet — a pre-auth user genuinely is new.
   */
  sessionDays?: number;
  /** Positive-only per-step evidence derived from real data. */
  signals?: ChecklistSignals;
  /** Injected clock (ms since epoch) for deterministic tests. */
  now?: number;
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
          impliedBy: ["complete_workout"],
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
          impliedBy: ["complete_habit"],
        },
        {
          id: "complete_habit",
          label: "Відмітити виконання",
          impliedBy: ["three_day_streak"],
        },
        { id: "three_day_streak", label: "Серія 3 дні" },
      ],
    },
    nutrition: {
      moduleId: "nutrition",
      title: "Їжа: Перші кроки",
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

/** Max age before the checklist auto-hides. */
export const CHECKLIST_MAX_AGE_DAYS = 7;
const CHECKLIST_MAX_AGE_MS = CHECKLIST_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Account age in whole days, or `null` when there is no usable
 * server-stamped timestamp (anonymous user, legacy row with a missing
 * `createdAt`, or an unparsable / future value).
 */
export function getAccountAgeDays(
  accountCreatedAt: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!accountCreatedAt) return null;
  const createdMs = new Date(accountCreatedAt).getTime();
  if (!Number.isFinite(createdMs)) return null;
  const ageMs = now - createdMs;
  // A createdAt in the future means clock skew, not a fresh account —
  // treat it as day 0 rather than letting a negative age read as "old".
  return Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
}

/**
 * Is the user still inside the FTUX window the checklist is meant for?
 *
 * Prefers the account's own age over the device-local session counter.
 * The counter (`recordSessionDay`) lives in localStorage/MMKV, so a
 * reinstall, a cleared Safari cache or simply a second device restarts
 * it at 1 and resurrects the checklist for someone who has been using
 * the product for months — the bug this function exists to close.
 */
export function isWithinChecklistWindow(
  ctx: ChecklistVisibilityContext = {},
): boolean {
  const { accountCreatedAt, sessionDays, now = Date.now() } = ctx;
  const accountAgeDays = getAccountAgeDays(accountCreatedAt, now);
  if (accountAgeDays !== null) return accountAgeDays <= CHECKLIST_MAX_AGE_DAYS;
  // No account yet (pre-auth FTUX): the device counter is the only
  // signal available, and for an anonymous user it is also the correct
  // one — there is no history anywhere else to contradict it.
  if (typeof sessionDays === "number") {
    return sessionDays <= CHECKLIST_MAX_AGE_DAYS;
  }
  return true;
}

/**
 * Resolve every step of a module's checklist against both sources of
 * truth: real-data signals and tap-recorded state. Implications
 * (`impliedBy`) are applied to a fixpoint so a chain like
 * `three_day_streak → complete_habit → create_habit` resolves fully.
 */
export function resolveChecklistSteps(
  store: KVStore,
  moduleId: DashboardModuleId,
  signals: ChecklistSignals = {},
): ResolvedChecklistStep[] {
  return resolveChecklistStepsFromState(
    MODULE_CHECKLISTS[moduleId],
    getChecklistState(store, moduleId),
    signals,
  );
}

/**
 * Storage-free core of {@link resolveChecklistSteps}. UI layers that
 * already hold the state in React state use this so rendering stays a
 * pure function of props/state instead of re-reading KV on every pass.
 */
export function resolveChecklistStepsFromState(
  def: ChecklistDefinition,
  state: ChecklistState,
  signals: ChecklistSignals = {},
): ResolvedChecklistStep[] {
  const tapped = new Set(state.completedSteps);

  const byData = new Set<string>();
  for (const step of def.steps) {
    if (signals[step.id] === true) byData.add(step.id);
  }

  // Fixpoint over `impliedBy`; bounded by the step count, so a cyclic
  // definition terminates instead of spinning.
  for (let pass = 0; pass < def.steps.length; pass += 1) {
    let grew = false;
    for (const step of def.steps) {
      if (byData.has(step.id)) continue;
      const implied = step.impliedBy?.some(
        (id) => byData.has(id) || tapped.has(id),
      );
      if (implied) {
        byData.add(step.id);
        grew = true;
      }
    }
    if (!grew) break;
  }

  return def.steps.map((step) => {
    const provenByData = byData.has(step.id);
    return { ...step, provenByData, done: provenByData || tapped.has(step.id) };
  });
}

export function isChecklistVisible(
  store: KVStore,
  moduleId: DashboardModuleId,
  ctx: ChecklistVisibilityContext = {},
): boolean {
  const state = getChecklistState(store, moduleId);
  if (state.dismissed) return false;

  const steps = resolveChecklistSteps(store, moduleId, ctx.signals);
  if (steps.every((step) => step.done)) return false;

  if (!isWithinChecklistWindow(ctx)) return false;

  const now = ctx.now ?? Date.now();
  if (state.firstSeenAt) {
    const age = now - new Date(state.firstSeenAt).getTime();
    if (age > CHECKLIST_MAX_AGE_MS) return false;
  }
  return true;
}

export function getChecklistProgress(
  store: KVStore,
  moduleId: DashboardModuleId,
  signals: ChecklistSignals = {},
): { completed: number; total: number } {
  const steps = resolveChecklistSteps(store, moduleId, signals);
  return {
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
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
