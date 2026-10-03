import type { messages as ukMessages, MessageGroupShape } from "./uk";

// Структурне дзеркало uk-групи `pricing`: кожен листовий ключ обовʼязковий,
// stub неможливий (див. shallow-merge контракт у `index.ts`).
export const pricingEn: MessageGroupShape<(typeof ukMessages)["pricing"]> = {
  pageTitle: "Plans",
  backLabel: "Back",
  plansAriaLabel: "Pricing plans",
  hero: {
    headlineLine1: "Sergeant is free for everyday use.",
    headlineLine2: "Premium, when you need everything at once.",
    subtitle: "One paid plan. No tiers, no lifetime deal.",
  },
  tiers: {
    freeName: "Free",
    freePrice: "₴0",
    freeCadence: "forever",
    freeTagline:
      "All modules, unlimited manual tracking. AI: 20 actions a week.",
    premiumName: "Premium",
    premiumPrice: "Soon",
    premiumCadence: "Price announced at launch",
    premiumTagline: "Everything unlocked. One plan, no tiers, no add-ons.",
  },
  features: {
    manualTracking: "Manual tracking with no numeric limits",
    aiActions: "AI actions: chat, advice, day plan, recipes",
    aiPhotoFoodShort: "AI meal photo",
    finykVision: "AI scan of receipts without QR and bank screenshots",
    monoAutoSync: "Monobank auto-sync",
    cloudSync: "Cross-device CloudSync",
    csvExport: "CSV export",
    voice: "Voice input",
    memoryRecall: "AI memory",
    pdfExport: "PDF report export",
    weekPlan: "Weekly meal plan",
    includedSr: "included:",
    excludedSr: "not included:",
  },
  limits: {
    perWeek: " / week",
    unlimited: "unlimited",
  },
  cta: {
    tryPremium: "Try Premium",
    openingCheckout: "Opening payment…",
    manageSubscription: "Manage subscription",
    openingPortal: "Opening management…",
    switchToFree: "Switch to Free",
    currentPlan: "Your current plan",
    signInToStart: "Sign in to start",
  },
  status: {
    checkoutCreatedPrefix: "Payment session created",
  },
  errors: {
    checkoutUnavailable:
      "Payment is temporarily unavailable. Leave your email below and we'll follow up when you can pay.",
    portalNoBillingCustomer:
      "No billing profile found. Reach out to support, we'll set it up manually.",
    portalUnavailable:
      "Subscription management is temporarily unavailable. Try again later.",
    portalGeneric:
      "Couldn't open subscription management. Check your connection and try again.",
  },
  toast: {
    subscriptionActive: "Subscription active, welcome to Premium!",
    subscriptionActiveCta: "Go to settings",
    paymentCanceled: "Payment canceled. No subscription was created.",
  },
  waitlist: {
    headline: "Waitlist email",
    subtitle: "One email when Premium launches. No spam, no auto-charges.",
  },
  footer:
    "Prices in UAH. UA payments go through LiqPay / Plata. Legacy Stripe subscriptions use a separate billing portal.",
};
