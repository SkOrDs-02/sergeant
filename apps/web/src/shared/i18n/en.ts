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

  // Initiative 0010 Phase 6 — Pricing page (`/pricing`). Conversion-funnel
  // surface; EN translation is the gating reason a non-UA visitor can
  // self-checkout. Tier names ("Free", "Premium") are brand-stable across
  // locales — identical to UK.
  pricing: {
    pageTitle: "Plans",
    backLabel: "Back",
    plansAriaLabel: "Pricing plans",
    hero: {
      headlineLine1: "Sergeant is free for everyday use.",
      headlineLine2: "Premium — when you need everything at once.",
      subtitle:
        "One paid plan. No tiers, no lifetime deal, no trial timer. Tap Premium and Stripe Checkout opens.",
    },
    tiers: {
      freeName: "Free",
      freeCadence: "forever",
      freeTagline: "Basic limits across all 4 modules. Local-first, no cloud.",
      premiumName: "Premium",
      premiumCadence: "/mo",
      premiumTagline: "Everything unlocked. One plan — no tiers, no add-ons.",
    },
    features: {
      expensesFinyk: "Finyk expenses",
      aiPhotoFood: "AI meal photo in Nutrition",
      aiPhotoFoodShort: "AI meal photo",
      manualMeals: "Manual meal entries",
      activeWorkoutTemplate: "Active workout template",
      workoutTemplates: "Workout templates",
      activeHabits: "Active habits",
      habits: "Habits",
      pdfExport: "PDF report export",
      multiCurrency: "Multi-currency accounts",
      cloudSync: "Cross-device CloudSync",
    },
    limits: {
      // Leading space matches uk — composes as `${N} / month`.
      perMonth: " / month",
      unlimited: "unlimited",
    },
    cta: {
      tryPremium: "Try Premium",
      openingCheckout: "Opening checkout…",
      manageSubscription: "Manage subscription",
      openingPortal: "Opening portal…",
      switchToFree: "Switch to Free",
      currentPlan: "Your current plan",
    },
    status: {
      checkoutCreatedPrefix: "Checkout session created",
    },
    errors: {
      checkoutUnavailable:
        "Checkout is temporarily unavailable. Leave your email below and we'll get back with a checkout link.",
      portalNoBillingCustomer:
        "No Stripe billing profile found. Reach out to support — we'll set it up manually.",
      portalUnavailable:
        "Subscription management is temporarily unavailable. Try again later.",
      portalGeneric:
        "Couldn't open the portal. Check your connection and try again.",
    },
    toast: {
      subscriptionActive: "Subscription active — welcome to Premium!",
      subscriptionActiveCta: "Go to settings",
      paymentCanceled: "Payment canceled. No subscription was created.",
    },
    waitlist: {
      headline: "Waitlist email",
      subtitle: "One email when Premium launches. No spam, no auto-charges.",
    },
    footer:
      "Prices in EUR; Stripe charges the UAH-equivalent for the UA market. Final number lives in the pricing-strategy PR after market research.",
  },
};
