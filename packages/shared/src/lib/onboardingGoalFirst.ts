/**
 * Onboarding goal-first wizard A/B variant (PR-13, S5.1).
 *
 * Pre-PR-13 the wizard is *module-first*: «Sergeant — твій хаб», then
 * a 4-row module checklist. The hypothesis behind master tracker
 * §7.1 / FTUX sprint plan S5.1 is that outcome-first framing
 * («Що для тебе зараз важливо?» → one goal → module derived from
 * the goal) increases D7 retention by ≥ 5pp versus the module-first
 * control because the user makes a single commitment with an
 * explicit promise instead of a multi-checkbox shopping cart.
 *
 * This module ships the **shared invariant** only:
 *   • experiment definition (id, variants, 50/50 weights);
 *   • outcome → module mapping (one outcome maps to exactly one
 *     module — the same lookup table is reused by the web
 *     `GoalFirstScreen` and the mobile parity PR);
 *   • outcome copy (headline + body that the screen renders).
 *
 * The render-shell + assignment glue live in
 * `apps/web/src/core/onboarding/` (`GoalFirstScreen.tsx`,
 * `useOnboardingWizardState.ts`).
 *
 * Decision window: 14 days from full rollout — same procedure as
 * S6.1 (`onboarding_default_picks_v1`). After the window, the
 * winning arm is rolled to 100% via `weights: [1, 0]` and the loser
 * is collapsed in a follow-up PR.
 */
import type { ExperimentDefinition } from "./abTest";
import { DASHBOARD_MODULE_IDS, type DashboardModuleId } from "./dashboard";

/**
 * Experiment definition for the goal-first wizard A/B.
 *
 * `control` is the module-first wizard that currently ships on
 * `main`; `goal_first` is the new outcome-first flow. 50/50 split
 * keeps both arms statistically usable inside the standard 14-day
 * window. `control` first in the variants tuple so the legacy arm
 * stays the index-0 fallback for fingerprint hashes that miss the
 * assignment map.
 */
export const ONBOARDING_GOAL_FIRST_EXPERIMENT: ExperimentDefinition = {
  id: "onboarding_goal_first_v1",
  variants: ["control", "goal_first"] as const,
  weights: [0.5, 0.5] as const,
};

export type OnboardingGoalFirstVariant = "control" | "goal_first";

/**
 * Outcome that the user selects on the goal-first screen. Each
 * outcome maps deterministically to a single primary module — the
 * screen does not expose the module choice directly so the framing
 * stays outcome-first («що я хочу») instead of feature-first («який
 * модуль»). Multi-pick is intentionally rejected: PR-13's whole
 * hypothesis is single-commitment.
 */
export type OnboardingOutcomeId =
  "spend-less" | "stay-in-shape" | "build-habits" | "eat-better";

export interface OnboardingOutcomeCopy {
  /** Outcome id. */
  id: OnboardingOutcomeId;
  /** Headline rendered on the outcome card. ≤ 38 Cyrillic chars. */
  headline: string;
  /** Body / promise rendered under the headline. ≤ 90 chars. */
  body: string;
  /** Primary module this outcome maps to. */
  module: DashboardModuleId;
}

/**
 * Source-of-truth outcome catalog. Ordering matches the layout the
 * screen renders (top-left → bottom-right on the 2×2 grid). The list
 * stays in lockstep with `DASHBOARD_MODULE_IDS` so the audit-test
 * can assert every module has exactly one outcome backing it.
 */
export const ONBOARDING_OUTCOMES: readonly OnboardingOutcomeCopy[] = [
  {
    id: "spend-less",
    headline: "Менше витрачати, більше відкласти",
    body: "Записуй витрати — побачиш, скільки лишилось до зарплати.",
    module: "finyk",
  },
  {
    id: "stay-in-shape",
    headline: "Тримати тіло у формі",
    body: "Признач тренування — у п'ятницю побачиш, що зробив за тиждень.",
    module: "fizruk",
  },
  {
    id: "build-habits",
    headline: "Зробити звички автоматичними",
    body: "Обери звичку — два дні підряд і мозок підхоплює ритм.",
    module: "routine",
  },
  {
    id: "eat-better",
    headline: "Краще їсти і знати що з'їв",
    body: "Логуй прийоми — за тиждень побачиш свій pattern по БЖВ.",
    module: "nutrition",
  },
];

/**
 * Look up an outcome by id. Returns `null` for unknown ids so the
 * screen can gracefully fall back to control framing if a future
 * outcome is added to the variants tuple but not yet to the catalog
 * (the audit-test in `onboardingGoalFirst.test.ts` blocks that
 * scenario from shipping, but the runtime fallback keeps the
 * wizard from crashing on a partial deploy).
 */
export function getOutcomeById(
  id: OnboardingOutcomeId | string | null | undefined,
): OnboardingOutcomeCopy | null {
  if (!id) return null;
  return ONBOARDING_OUTCOMES.find((o) => o.id === id) ?? null;
}

/**
 * Resolve the module a user just picked an outcome for. Convenience
 * wrapper that mirrors the shape `useOnboardingWizardState` expects
 * (single module id → `picks` array of length 1).
 */
export function getOutcomeModule(
  id: OnboardingOutcomeId | string | null | undefined,
): DashboardModuleId | null {
  return getOutcomeById(id)?.module ?? null;
}

/**
 * Distinct module ids backing the outcomes. Kept as a typed iterable
 * so the audit-test can assert it equals `DASHBOARD_MODULE_IDS`
 * without `Set` round-trips bleeding into the type signature.
 */
export const ONBOARDING_OUTCOME_MODULES: readonly DashboardModuleId[] =
  DASHBOARD_MODULE_IDS;
