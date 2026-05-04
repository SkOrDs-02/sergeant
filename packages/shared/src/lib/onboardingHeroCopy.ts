/**
 * Copy generator for the OnboardingWizard splash hero (S1.1 + S1.2) — A/B-ready.
 *
 * The pre-S1.1 copy was feature-driven:
 *   «Sergeant — твій хаб.» / «Гроші, тіло, звички, їжа — все в одному місці.»
 * That copy reads like marketer-speak («хаб», «все в одному місці») and
 * frames the product as a *category*, not as a *user outcome*. The audit
 * (`docs/audits/2026-05-03-ftux-onboarding-roast.md`) flagged this as the
 * single biggest «benefit→feature» drift in the funnel.
 *
 * The new mainline (`outcome`) is outcome-first: it leads with what the
 * user *gets* in the next 30 seconds, not with the product's category.
 * Two alternative arms are kept for A/B-testing:
 *   - `safe`  — conservative rewrite that just removes "хаб"
 *   - `bold`  — provocative framing that targets the "втомився забувати"
 *               cohort. Higher conversion-or-bounce variance expected.
 *
 * `assignVariant(ONBOARDING_HERO_COPY_EXPERIMENT)` defaults to 100% `outcome`
 * (`weights: [1, 0, 0]`); flip the weights or call `overrideVariant` to
 * start a real split. Per `docs/launch/posthog-ftux-dashboards.md`, the
 * winning metric is `wizard_started → wizard_completed` per-arm.
 */

import type { ExperimentDefinition } from "./abTest";

/**
 * Experiment definition for the OnboardingWizard hero copy A/B.
 * `outcome` is the mainline; `safe` and `bold` are preserved for testing.
 */
export const ONBOARDING_HERO_COPY_EXPERIMENT: ExperimentDefinition = {
  id: "onboarding_hero_copy_v1",
  variants: ["outcome", "safe", "bold"] as const,
  weights: [1, 0, 0] as const,
};

export type OnboardingHeroCopyVariant = "outcome" | "safe" | "bold";

export interface OnboardingHeroCopy {
  /** Hero headline (h2). ≤ 64 chars. */
  title: string;
  /** Subtext under the headline. ≤ 140 chars. */
  subtitle: string;
  /**
   * Three trust-fasets shown as inline icon+label pills under the
   * subtitle. Each label ≤ 16 chars so it fits on one line on a 320px
   * viewport.
   */
  badges: readonly [string, string, string];
  /** Primary CTA label. Always action-orientated. ≤ 32 chars. */
  primaryCta: string;
}

/**
 * Pure copy resolver. Web and mobile call the same function so the
 * surface stays in sync — no platform-specific copy drift.
 */
export function getOnboardingHeroCopy(
  variant: OnboardingHeroCopyVariant,
): OnboardingHeroCopy {
  if (variant === "safe") return SAFE_COPY;
  if (variant === "bold") return BOLD_COPY;
  return OUTCOME_COPY;
}

/**
 * Variant `outcome` — current mainline (S1.1 + S1.2).
 *
 * Outcome-first framing: leads with the *next-30-seconds promise* and
 * uses domain words the user actually thinks in («перший запис», «куди
 * йде твоє життя») instead of category words («хаб», «все в одному
 * місці»). Trust badges flip from generic privacy claims to three
 * concrete *negative claims* the user can verify.
 */
const OUTCOME_COPY: OnboardingHeroCopy = {
  title: "Запиши перший зум — і побачиш, куди йде твоє життя.",
  subtitle: "Бюджет, тренування, звички, їжа — за 30 секунд, без реєстрації.",
  badges: ["Без реєстрації", "Без cloud-у", "Без реклами"],
  primaryCta: "Розпочати — 30 секунд",
};

/**
 * Variant `safe` — conservative rewrite. Keeps the four-domain list
 * but removes "хаб" and the "все в одному місці" cliché. Useful as a
 * fallback if `outcome` tests as too aggressive for the audience.
 */
const SAFE_COPY: OnboardingHeroCopy = {
  title: "Один екран замість шести застосунків.",
  subtitle: "Гроші, тренування, звички, їжа. Без акаунта. Без cloud-у.",
  badges: ["Без реєстрації", "Без cloud-у", "Без реклами"],
  primaryCta: "Розпочати — 30 секунд",
};

/**
 * Variant `bold` — provocative framing. Targets the «втомився
 * забувати» cohort with an exclusionary lead («Не для всіх. Для тих,
 * хто…»). Expected higher variance: better conversion among matched
 * audience, higher early bounce among mismatched.
 */
const BOLD_COPY: OnboardingHeroCopy = {
  title: "Не для всіх. Для тих, хто втомився забувати.",
  subtitle:
    "Записуй один раз — Sergeant пам'ятає за тебе. Офлайн, без акаунта.",
  badges: ["Без реєстрації", "Без cloud-у", "Без реклами"],
  primaryCta: "Спробувати — 30 секунд",
};
