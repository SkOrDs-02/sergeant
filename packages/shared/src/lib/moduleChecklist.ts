/**
 * Module onboarding checklists — shared, DOM-free logic.
 *
 * Each module has 3–4 actionable steps that guide the user from first
 * entry to "aha-moment". The checklist is visible for the first 7 days
 * of the **account** (or until all steps are done / dismissed).
 *
 * AI-CONTEXT: a step is "done" exactly when `provenByData` is true (see
 * {@link resolveChecklistStepsFromState}). `provenByData` merges two
 * sources before resolution runs: (1) a *live* signal from
 * `ChecklistSignals` (derived in `moduleChecklistSignals.ts`), which can
 * legitimately flip back to `false` if the proving record disappears
 * (e.g. a seeded demo expense gets deleted), and (2) a *latched* id in
 * `ChecklistState.completedSteps`, written once and never cleared.
 *
 * The latch is what makes achievement permanent — F3 audit (2026-09-11)
 * decision: "a step stays achieved once proven; it's a learning event,
 * not a live data state." `markChecklistStepDone` is the only writer of
 * the latch; callers decide WHEN to call it, and that decision is the
 * whole fix:
 *   - web (`apps/web/src/core/onboarding/ModuleChecklist.tsx`) never
 *     calls it from a row tap — a tap there is pure navigation. It calls
 *     it from an effect that watches the live signal and latches the
 *     moment it first turns true, so a tap can never credit a step the
 *     underlying data doesn't back (the original defect: tap-only
 *     resolution let ANY row click complete ANY step, proven or not).
 *   - mobile (`apps/mobile/src/core/onboarding/ModuleChecklist.tsx`)
 *     still calls it directly from a row tap for the handful of
 *     action-only steps that have no automatic signal at all
 *     (`check_progress`, `photo_analysis`) — untouched by this fix.
 *
 * AI-DANGER: live signals are **positive-only evidence**. Several of
 * them are "today"-scoped (routine `todayDone`, nutrition `todayCal`,
 * fizruk `weekWorkouts`), so `false` means "no proof", never "not done" —
 * a user who simply skipped today must not have a step un-ticked. That's
 * exactly what the latch protects against: once a step id has ever
 * entered `completedSteps`, it stays there permanently, regardless of
 * what the live signal says on any later render.
 */

import type { DashboardModuleId } from "./dashboard";
import { readJSON, writeJSON, type KVStore } from "../storage/kv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Canonical action ids a {@link ChecklistStep} may declare. This is the
 * ONE place a new checklist action gets introduced — the Hub's runtime
 * gate (`apps/web/src/shared/lib/modules/hubNav.ts` — `HubModuleAction` /
 * `VALID_HUB_ACTIONS`) derives its checklist-facing vocabulary from this
 * very array, so a step can never reference an action id the gate
 * doesn't already recognize.
 *
 * F3 audit (2026-09-11): before this existed, `VALID_HUB_ACTIONS` was a
 * hand-maintained, *narrower*, independently-declared list — three of
 * Фінік's four checklist actions (`set_budget`, `connect_bank`,
 * `view_analytics`) silently failed the gate and were dropped without a
 * trace. Adding a step with an action missing here is now a compile
 * error at the `MODULE_CHECKLISTS` definition site, not a `CustomEvent`
 * that quietly goes nowhere.
 */
export const CHECKLIST_ACTIONS = [
  "add_expense",
  "set_budget",
  "connect_bank",
  "view_analytics",
  "start_workout",
  "set_program",
  "check_progress",
  "create_habit",
  "log_meal",
  "photo_analysis",
  "daily_plan",
] as const satisfies readonly string[];

export type ChecklistAction = (typeof CHECKLIST_ACTIONS)[number];

export interface ChecklistStep {
  id: string;
  label: string;
  /**
   * Deep-link action hint dispatched via the Hub's
   * `openHubModuleWithAction`. Typed against {@link ChecklistAction} —
   * see its doc for why that matters.
   */
  action?: ChecklistAction;
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
 * whatever is already latched in `ChecklistState.completedSteps`. Built
 * by `deriveChecklistSignals` (+ web-only overlays in
 * `useChecklistSignals.ts`).
 */
export type ChecklistSignals = Readonly<Record<string, boolean | undefined>>;

/** A checklist step with its resolved completion state. */
export interface ResolvedChecklistStep extends ChecklistStep {
  done: boolean;
  /**
   * As of F3 (2026-09-11) this is always equal to `done` — there is no
   * other source of completion left. Kept as a distinct field for API
   * stability (existing call sites destructure it explicitly).
   */
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
  /**
   * Версія семантики засувки `completedSteps`.
   *
   * AI-DANGER: відсутнє поле означає запис ЕПОХИ ТАПУ, і довіряти його
   * `completedSteps` не можна. До F3 (2026-09-11) будь-який тап по рядку
   * чекліста писав `stepId` сюди без жодного доказу даними — це і був
   * дефект, який F3 закривав. Ключ сховища (`<module>_checklist_v1`) при
   * цьому не змінювався, тож після фіксу ті самі неперевірені id почали
   * читатись уже як постійний доказ (`provenByData`) — дефект пережив
   * власний фікс для всіх, хто встиг тапнути (знахідка рев'ю до PR #1106).
   *
   * Тому засувці без цього поля не віримо. Ключ НЕ бампаємо: у тому ж
   * записі лежать `dismissed` і `firstSeenAt`, а їх скидати підстав немає —
   * людина, яка сховала чекліст, не має побачити його знову через чужий
   * баг. Втрата невелика: крок, доведений даними, засувається назад на
   * першому ж рендері з живого сигналу. Реально скидаються лише кроки
   * без автоматичного сигналу (мобільні `check_progress`, `photo_analysis`) —
   * а вони й були зараховані тапом, тобто тим самим, чому ми не віримо.
   */
  latchVersion?: number;
}

/**
 * Поточна версія семантики засувки. Піднімай, коли міняється те, ЩО
 * означає запис у `completedSteps`, — не коли міняється форма стану.
 */
const LATCH_VERSION = 2;

const EMPTY_STATE: ChecklistState = {
  completedSteps: [],
  dismissed: false,
  firstSeenAt: null,
  latchVersion: LATCH_VERSION,
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
  // Міграція читанням, не записом: запис без `latchVersion` — епохи тапу,
  // тож його `completedSteps` відкидаємо (чому саме — у полі типу вище).
  // Читання лишається чистим; нову версію проставить перший же запис.
  const trusted = data.latchVersion === LATCH_VERSION;
  return {
    completedSteps:
      trusted && Array.isArray(data.completedSteps)
        ? data.completedSteps.filter((s): s is string => typeof s === "string")
        : [],
    dismissed: typeof data.dismissed === "boolean" ? data.dismissed : false,
    firstSeenAt: typeof data.firstSeenAt === "string" ? data.firstSeenAt : null,
    latchVersion: LATCH_VERSION,
  };
}

export function saveChecklistState(
  store: KVStore,
  moduleId: DashboardModuleId,
  state: ChecklistState,
): void {
  // Версію ставить ПИСАР, а не викликач. Інакше будь-який виклик із
  // рукописним обʼєктом (наприклад `seedDemoData/seedChecklists.ts`, який
  // засіває всі кроки демо-акаунта) писав би запис без поля — а читання
  // такий запис навмисно не бере на віру, тож засівання мовчки не діяло б.
  // Так інваріант «немає поля = дані епохи тапу» тримається в одному місці.
  writeJSON(store, storageKey(moduleId), {
    ...state,
    latchVersion: LATCH_VERSION,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Permanently latch `stepId` as done. This is the ONE writer of
 * `ChecklistState.completedSteps` — see the file header for who calls it
 * and when. It is intentionally unconditional (it does not check
 * `signals`): callers are trusted to invoke it only once they already
 * have real evidence, whether that's a live `ChecklistSignals` entry
 * (web's auto-latch effect) or an action-only step with no automatic
 * signal at all (mobile's row tap).
 */
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
 * Resolve every step of a module's checklist against its one source of
 * truth: `provenByData` (live signals, folded together with whatever is
 * already latched in storage). Implications (`impliedBy`) are applied to
 * a fixpoint so a chain like `three_day_streak → complete_habit →
 * create_habit` resolves fully.
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
 *
 * F3 (2026-09-11): `done` has exactly one definition — `provenByData` —
 * built by folding `state.completedSteps` (the permanent latch; see the
 * file header) together with the *live* `signals` for this render. There
 * is no separate "tapped" OR-branch anymore: a step's storage entry is
 * itself evidence of proof, not an independent, unconditional override.
 * A latched id therefore behaves exactly like a live signal that never
 * turns back off — which is precisely the "stays achieved" contract the
 * owner asked for.
 */
export function resolveChecklistStepsFromState(
  def: ChecklistDefinition,
  state: ChecklistState,
  signals: ChecklistSignals = {},
): ResolvedChecklistStep[] {
  const byData = new Set<string>(state.completedSteps);
  for (const step of def.steps) {
    if (signals[step.id] === true) byData.add(step.id);
  }

  // Fixpoint over `impliedBy`; bounded by the step count, so a cyclic
  // definition terminates instead of spinning.
  for (let pass = 0; pass < def.steps.length; pass += 1) {
    let grew = false;
    for (const step of def.steps) {
      if (byData.has(step.id)) continue;
      const implied = step.impliedBy?.some((id) => byData.has(id));
      if (implied) {
        byData.add(step.id);
        grew = true;
      }
    }
    if (!grew) break;
  }

  return def.steps.map((step) => {
    const provenByData = byData.has(step.id);
    return { ...step, provenByData, done: provenByData };
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
