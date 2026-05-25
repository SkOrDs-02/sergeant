/**
 * English message catalog for apps/web — **billing-surface-first subset**.
 *
 * Initiative 0010 (revenue-first launch) Status header lists EN locale as
 * pending. This catalog ships **only** the keys needed for revenue-conversion
 * surfaces (PaywallModal copy + the single connecting button label used in
 * the Mono-webhook paywall flow), since those are the surfaces a non-UA
 * visitor must read before the upsell can land.
 *
 * **What's in here.** Top-level groups that fully replace their UK counterpart
 * when the resolver picks `lang='en'`. Per the resolver contract in
 * `index.ts`, the merge is **shallow per top-level group** — `paywall: {...}`
 * here completely overrides `paywall: {...}` in `uk.ts`, while groups absent
 * here (auth, validation, sync, …) fall through to UK. This forces a clean
 * "translate the whole group or don't touch it" discipline.
 *
 * **What's NOT in here yet.** Everything else. PricingPage hardcoded copy,
 * PlanSection labels, TrialBanner pluralization rules, the 600+ other UK
 * strings — all stay UK-only until per-surface migration PRs land. This is
 * intentional: the conversion-funnel surface (paywall) is the only one a
 * UK-illiterate visitor MUST be able to read before paying. Settings copy
 * being UA is acceptable for a Pro user who's already paid; landing-page
 * copy is owned by a separate `/` route translation pass.
 *
 * **Voice & terminology.** Match the UK voice: 1st-person singular ("I"),
 * friendly-not-corporate, concrete-not-marketing. "Premium" stays
 * capitalized (it's the product tier name, locked in ADR-0051). Stripe
 * Checkout locale is handled separately by `stripe.ts` (initiated session
 * locale) — this catalog only covers our own UI copy.
 *
 * Roadmap: see `docs/i18n/readiness.md` (TODO: create) for the per-surface
 * migration sequence. PaywallModal callers + their direct copy props are the
 * first PR; PricingPage TIERS const is the second; PlanSection + TrialBanner
 * the third.
 */

import type { MessageCatalog } from "./uk";

/**
 * Partial English catalog. Top-level keys present here REPLACE the same
 * key in `uk.ts` when the resolver picks `lang='en'`. Top-level keys absent
 * fall through to `uk.ts`. See `index.ts → getMessages()` for merge semantics.
 *
 * Typed as `Partial<MessageCatalog>` so the resolver's merge produces a full
 * `MessageCatalog` regardless of which groups EN currently covers.
 */
export const messagesEn: Partial<MessageCatalog> = {
  // Phase 7 D2 — paywall feature gates. EN copy must keep `name` ≤ 35 chars
  // for the "Unlock {name}" CTA composition; titles/descriptions can flow
  // longer since the modal owns its own viewport space.
  paywall: {
    "ai-photo-analysis": {
      name: "AI meal photo analysis",
      title: "AI photo analysis — Premium",
      description:
        "AI estimates calories, protein, carbs and fat from a meal photo. Available on Premium.",
    },
    "multi-currency": {
      name: "Multi-currency assets",
      title: "Multi-currency — Premium",
      description:
        "Hold assets in USD, EUR, BTC and auto-convert to UAH — Premium only.",
    },
    "analytics-export-pdf": {
      name: "PDF export",
      title: "PDF reports — Premium",
      description:
        "Cross-module reports and PDF export — available on Premium.",
    },
  },

  // `loadingActions.connecting` is used by the Mono-webhook connect button
  // inside FinykSection's paywall-gated path. EN keeps the same 1st-person
  // singular voice ("I'm connecting…") as UK.
  loadingActions: {
    exiting: "Signing out…",
    signingIn: "Signing in…",
    registering: "Registering…",
    connecting: "Connecting…",
    loadingTransactions: "Loading transactions…",
    loadingWorkouts: "Loading workouts",
  },
};
