/**
 * Onboarding default-picks experiment (S6.1) — A/B 50/50 between
 * `none` (opt-in, the new behaviour) and `all` (legacy fallback).
 *
 * The pre-S6.1 wizard pre-selected every module on splash and silently
 * fell back to `[...ALL_MODULES]` when the user finished with an
 * empty pick list. The audit (`docs/launch/ftux-sprint-plan.md` §2.1
 * / B-1) flagged this as the single biggest commitment-leak in FTUX:
 * "тап-через-усе" produces a populated dashboard the user never
 * actually chose, which depresses D7 retention.
 *
 * This experiment runs 50/50:
 *
 *   - `none` — wizard starts with `picks=[]`, primary CTA is disabled
 *     until the user picks ≥1 module, `finish()` never falls back to
 *     `ALL_MODULES`. The audit hypothesis is `completion ↓2pp` but
 *     `D7 retention ↑4pp` (active choice → commitment ↑).
 *
 *   - `all` — legacy behaviour. Wizard starts with all four modules
 *     pre-selected and `finish()` falls back to `ALL_MODULES` when
 *     the user manually unticks every chip. Kept as the control arm
 *     so the difference is measurable.
 *
 * Decision window: 14 days from rollout, per the sprint plan. After
 * that the winning arm is rolled to 100% via the standard
 * `weights: [1, 0]` flip; the loser is collapsed in a follow-up PR.
 *
 * Variant assignment is deterministic per device fingerprint and
 * persisted via `assignVariant(store, ONBOARDING_DEFAULT_PICKS_EXPERIMENT)`
 * — the same user always sees the same arm, so the wizard never
 * mid-flips between paints.
 */

import type { ExperimentDefinition } from "./abTest";

/**
 * Experiment definition for the onboarding default-picks A/B.
 * `none` is the new behaviour; `all` is the legacy fallback.
 *
 * 50/50 split is intentional — both arms produce valid wizard
 * completions, so neither needs a "safety net" weighting like
 * `onboarding_hero_copy_v2` (which keeps `outcome` at 40% as
 * the carry-over mainline while disciplined / safe / bold split
 * the remaining 60%).
 */
export const ONBOARDING_DEFAULT_PICKS_EXPERIMENT: ExperimentDefinition = {
  id: "onboarding_default_picks_v1",
  variants: ["none", "all"] as const,
  weights: [0.5, 0.5] as const,
};

export type OnboardingDefaultPicksVariant = "none" | "all";

/**
 * Type guard so callers can narrow a `string` returned by
 * `assignVariant` (the underlying API is untyped) without sprinkling
 * `as OnboardingDefaultPicksVariant` casts at every call site.
 */
export function isOnboardingDefaultPicksVariant(
  value: string,
): value is OnboardingDefaultPicksVariant {
  return value === "none" || value === "all";
}
