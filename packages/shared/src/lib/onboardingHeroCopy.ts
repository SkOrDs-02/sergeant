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
 * Three alternative arms are kept for A/B-testing:
 *   - `safe`         — conservative rewrite that just removes "хаб"
 *   - `bold`         — provocative framing that targets the "втомився забувати"
 *                       cohort. Higher conversion-or-bounce variance expected.
 *   - `disciplined`  — "disciplined helper" tone (PR-04, master tracker §4):
 *                       «Менше хаосу. Більше зробленого.» Targets the cohort
 *                       that wants a coach-tone, not a product-tone.
 *
 * Experiment id was bumped to `onboarding_hero_copy_v2` when the
 * `disciplined` variant landed (PR-04). Existing v1 assignments remain in
 * KVStore but are not surfaced — `assignVariant` keys on `experiment.id`,
 * so v1 users get re-rolled into the v2 split on first /welcome render.
 *
 * Default weights ([0.4, 0.2, 0.2, 0.2]) keep `outcome` favoured (since it
 * has been the production mainline) while exposing the three alternatives
 * across ~60% of new traffic. Per `docs/launch/posthog-ftux-dashboards.md`,
 * the winning metric is `wizard_started → wizard_completed` per-arm.
 */

import type { ExperimentDefinition } from "./abTest";

/**
 * Experiment definition for the OnboardingWizard hero copy A/B.
 * `outcome` stays the mainline (40%). `safe`, `bold`, `disciplined` each
 * receive 20% of new assignments for the v2 split.
 */
export const ONBOARDING_HERO_COPY_EXPERIMENT: ExperimentDefinition = {
  id: "onboarding_hero_copy_v2",
  variants: ["outcome", "safe", "bold", "disciplined"] as const,
  weights: [0.4, 0.2, 0.2, 0.2] as const,
};

export type OnboardingHeroCopyVariant =
  | "outcome"
  | "safe"
  | "bold"
  | "disciplined";

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
  /**
   * Secondary CTA label (PR-05 — demo mode as first-class). Rendered
   * directly inside the splash card under the primary CTA so the
   * "просто подивитись" cohort doesn't have to scan past the wizard
   * card to reach the demo entry point. Same string for every variant
   * — copy stays canonical ("Подивитись приклад") so the demo entry
   * is recognisable across A/B arms and the share-of-traffic SLO
   * (`DEMO_STARTED { source: "welcome" } / ONBOARDING_STARTED ≥ 15%`)
   * isn't biased by per-arm copy drift.
   */
  secondaryCta: string;
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
  if (variant === "disciplined") return DISCIPLINED_COPY;
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
 *
 * S1.1 copy-review 2026-05-07: "зум" replaced with "запис" — clearer,
 * no collision with Zoom™. "cloud-у" replaced with "хмари" — native UA.
 */
const OUTCOME_COPY: OnboardingHeroCopy = {
  title: "Один запис — і побачиш, куди йде твоє життя.",
  subtitle: "Бюджет, тренування, звички, їжа — за 30 секунд, без реєстрації.",
  badges: ["Без реєстрації", "Без хмари", "Без реклами"],
  primaryCta: "Розпочати — 30 секунд",
  secondaryCta: "Подивитись приклад",
};

/**
 * Variant `safe` — conservative rewrite. Keeps the four-domain list
 * but removes "хаб" and the "все в одному місці" cliché. Useful as a
 * fallback if `outcome` tests as too aggressive for the audience.
 *
 * S1.1 copy-review 2026-05-07: "cloud-у" → "хмари".
 */
const SAFE_COPY: OnboardingHeroCopy = {
  title: "Один екран замість шести застосунків.",
  subtitle: "Гроші, тренування, звички, їжа. Без акаунта. Без хмари.",
  badges: ["Без реєстрації", "Без хмари", "Без реклами"],
  primaryCta: "Розпочати — 30 секунд",
  secondaryCta: "Подивитись приклад",
};

/**
 * Variant `bold` — provocative framing. Targets the «втомився
 * забувати» cohort with an exclusionary lead («Не для всіх. Для тих,
 * хто…»). Expected higher variance: better conversion among matched
 * audience, higher early bounce among mismatched.
 *
 * S1.1 copy-review 2026-05-07: "cloud-у" → "хмари".
 */
const BOLD_COPY: OnboardingHeroCopy = {
  title: "Не для всіх. Для тих, хто втомився забувати.",
  subtitle:
    "Записуй один раз — Sergeant пам'ятає за тебе. Офлайн, без акаунта.",
  badges: ["Без реєстрації", "Без хмари", "Без реклами"],
  primaryCta: "Спробувати — 30 секунд",
  secondaryCta: "Подивитись приклад",
};

/**
 * Variant `disciplined` — "disciplined helper" tone (PR-04 / master
 * tracker §4 decision). Frames Sergeant as a coach who keeps you in
 * line, not a tool that organises four domains. Headline trades the
 * outcome-first promise for a value-prop the disciplined cohort
 * actually believes («менше хаосу — більше зробленого»). CTA stays
 * action-orientated; subtitle keeps the no-account / no-cloud
 * commitments to avoid drift from the verifiable badges.
 *
 * S1.1 copy-review 2026-05-07: "cloud-у" → "хмари".
 */
const DISCIPLINED_COPY: OnboardingHeroCopy = {
  title: "Менше хаосу. Більше зробленого.",
  subtitle:
    "Один екран для грошей, тіла, звичок і їжі. Без акаунта. Без хмари.",
  badges: ["Без реєстрації", "Без хмари", "Без реклами"],
  primaryCta: "Розпочати — 30 секунд",
  secondaryCta: "Подивитись приклад",
};
