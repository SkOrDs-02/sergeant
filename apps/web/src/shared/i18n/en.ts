/**
 * English message catalog for apps/web.
 *
 * Structurally complete — every top-level group present in `uk.ts` is also
 * present here so the EN locale can be used standalone via `getMessages("en")`.
 *
 * Voice: 1st-person singular ("I"), friendly-not-corporate, concrete.
 * "Premium" stays capitalized (ADR-0051). Interpolation placeholders are
 * preserved verbatim from the UK source.
 *
 * Merge contract (see `index.ts`): top-level keys here REPLACE the same key
 * in `uk.ts`. Groups must be fully translated — partial group coverage is
 * forbidden by the `messagesEn contract` test in `index.test.ts`.
 *
 * Roadmap: see `docs/i18n/readiness.md` for the per-surface migration
 * sequence.
 */

import type { MessageCatalog } from "./uk";

/**
 * Full English catalog. Top-level keys present here REPLACE the same
 * key in `uk.ts` when the resolver picks `lang='en'`. Top-level keys absent
 * fall through to `uk.ts`. See `index.ts → getMessages()` for merge semantics.
 *
 * Typed as `Partial<MessageCatalog>` so the resolver's merge produces a full
 * `MessageCatalog` regardless of which groups EN currently covers.
 */
export const messagesEn: Partial<MessageCatalog> = {
  auth: {
    // Generic fallback — used when the specific cause cannot be determined.
    genericFailure: "Sign-in failed. Please try again.",

    // Better Auth canonical error-codes:
    invalidEmailOrPassword: "Incorrect email or password.",
    invalidToken:
      "The password-reset link is invalid or has already been used. Request a new one from the sign-in page.",
    userAlreadyExists: "This email is already registered. Try signing in.",
    invalidEmail: "Invalid email format.",
    invalidPassword: "Incorrect password.",
    passwordTooShort: "Password is too short.",
    passwordTooLong: "Password is too long.",
    emailNotVerified: "Your email hasn't been verified yet. Check your inbox.",
    providerNotFound: "This sign-in provider is not configured.",
    sessionFailure: "Sign-in failed. Please try again.",

    // Server errors (rate-limiter, error handler):
    rateLimited: "Too many attempts. Wait a minute and try again.",
    serverDown: "The server is temporarily unavailable. Try again later.",

    // Round 16 — soft-auth prompt
    createAccount: "Create account",
  },

  sync: {
    errorNetwork: "Sync failed — check your connection.",
    errorServerRetryable: "The server is temporarily unresponsive. Try again.",
    errorServerNonRetryable: "Sync error. Check your input.",
    errorGeneric: "Sync error.",
    retryCta: "Try again",

    conflictResolved: "Conflict resolved automatically.",
    pushFailed: "Sync failed. We'll retry shortly.",
    offlineQueueRecovered: "Recovered from offline queue.",
  },

  validation: {
    /**
     * @deprecated PR-31: use `<entity>Required` keys instead.
     * @removeBy 2026-09-01
     */
    fieldRequired: "This field is required.",
    emailRequired: "Enter your email",
    emailInvalid: "Invalid email format",
    emailInvalidPublic: "Invalid email address",
    emailMax254: "Maximum 254 characters",
    passwordRequired: "Enter your password",
    passwordCurrentRequired: "Enter your current password",
    passwordMin8: "Minimum 8 characters",
    passwordMin10: "Minimum 10 characters",
    passwordMax128: "Maximum 128 characters",
    nameMax80: "Maximum 80 characters",
    noteMax200: "Maximum 200 characters",
    sleepHoursRange: "Sleep must be between 0 and 24 hours",
    weightKgRange: "Weight must be between 20 and 300 kg",
    tagNameRequired: "Enter a tag name",
    tagNameDuplicate: "A tag with this name already exists",
    categoryNameDuplicate: "A category with this name already exists",
    goalNameRequired: "Enter a goal name",
    goalAmountRequired: "Enter a goal amount greater than 0",
    goalSavedNonNegative: "Saved amount cannot be negative",
    limitAmountRequired: "Enter a limit greater than 0",
    categoryRequired: "Select a category",
    passwordResetMin10: "Password must be at least 10 characters.",
    passwordsDontMatchDot: "Passwords don't match.",
    passwordsDontMatch: "Passwords don't match",
  },

  actions: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    close: "Close",
    add: "Add",
    confirm: "Confirm",
    apply: "Apply",
    retry: "Retry",
    back: "Back",
    next: "Next",
    done: "Done",
    refresh: "Refresh",
    reset: "Reset",
    open: "Open",

    skip: "Skip",
    continue: "Continue",
    collapse: "Collapse",
    expand: "Expand",
    hide: "Hide",
    tryAgain: "Try again",
    later: "Later",
    change: "Change",
    restore: "Restore",
    reload: "Reload",
    clear: "Clear",
    remove: "Remove",
    send: "Send",
  },

  status: {
    loading: "Loading…",
    updating: "Updating…",
    done: "Done",
    doneLowercase: "done",
  },

  period: {
    today: "Today",
    day: "Day",
    week: "Week",
    month: "Month",
  },

  nav: {
    hubSections: "Hub sections",
    dashboard: "Home",
    profile: "Profile",
    chat: "Assistant chat",
    nutritionOverview: "Overview",
    finykOverview: "Overview",
    fizrukOverview: "Overview",
    nutritionLog: "Journal",
    reports: "Reports",
    openAssistant: "Open AI assistant",
    globalSearch: "Global search",
    searchPlaceholder: "Search across all modules…",
    moduleSwitcher: "Module switcher",
    closeSettings: "Close settings",
    closeMenu: "Close menu",
    quickActions: "Quick actions",
    voiceInput: "Voice input",
    welcome: "Welcome",
  },

  empty: {
    nothingYet: "Nothing here yet",
    noDataYet: "No data yet",
    nothingFound: "Nothing found",
    listEmpty: "List is empty",
    historyEmpty: "History is empty",
  },

  strategy: {
    title: "Strategic goals",
    weekPrefix: "Week of",
    placeholderTag: "placeholder UI (PR-34 skeleton)",
    addGoal: "Add goal",
    personaLabel: "Persona",
    goalTextLabel: "Goal text",
    goalTextPlaceholder:
      "e.g.: Cut spending in the 'Coffee' category by 60% by Sunday",
    saving: "Saving…",
    thisWeeksGoals: "This week's goals",
    loading: "Loading…",
    emptyStatePrefix: "No goals for the week of",
    emptyStateSuffix:
      "A WF-26 cron starts Monday 09:00 Kyiv, or add a goal manually using the form above.",
    goalTextRequired: "Goal text cannot be empty",
  },

  errors: {
    generic: {
      network: "Could not connect. Check your connection.",
      serverDown: "The server is temporarily unavailable. Try again later.",
      retry: "Try again",
      timeout: "Request timed out. Try again.",
      unknown: "Something went wrong. Try again.",

      title: "Error",
      somethingWrong: "Something went wrong",
      cannotRenderPage: "Could not display the page",
      sectionFailed:
        "This section crashed, but the rest of the module is working.",
      moduleFailed: "Module error",
      backToModulePicker: "Back to module picker",
      copyRequestId: "Copy",
      copyRequestIdAria: "Copy requestId",
    },
  },

  toast: {
    saved: "Saved",
    deleted: "Deleted",
    copied: "Copied",
    updated: "Updated",
    failed: "Action failed",
  },

  hub: {
    insights: "Insights",
    chatQuickActions: "Quick scenarios",
    valueProgressAria: "Progress toward your goals",
    crossModulePreviewAria: "What Sergeant will show next",
    weeklyDigestTitle: "Weekly digest — stories",
    chatOfflineNotice:
      "The assistant is unavailable without internet. Module data is visible offline, but\n          AI responses require a connection.",

    chatEmptyTitle: "Ask me anything — I'm here to help",
    chatEmptyDescription:
      "Tap a suggestion — it fills the input so you can edit it before sending.",
    chatEmptyAriaLabel: "Chat starter suggestions",
    chatEmptySuggestionFinyk: "How much did I spend this week?",
    chatEmptySuggestionFizruk: "How are my workouts going?",
    chatEmptySuggestionNutrition: "What did I eat today?",
    chatEmptySuggestionRoutine: "Status of my habits",

    reportNoData: "No data",
    reportChartAria: "Chart",
    reportPrevious: "Previous:",
  },

  onboarding: {
    hideChecklist: "Hide checklist",

    tourSettingsTitle: "App introduction",
    tourLaunchLabel: "View the intro tour",
    tourResetLabel: "Start the introduction over",
    tourCopyExplanation:
      "The tour shows the welcome screen again — your data won't change. Starting over lets you re-select modules and see the first tips again. Your module records stay as they are.",
    tourResetConfirmTitle: "Start the introduction over?",
    tourResetConfirmDescription:
      "You'll see the welcome screen and first tips again. Module data (transactions, workouts, meals) will remain unchanged.",
    tourResetConfirmAction: "Start over",
    tourResetSuccess: "Introduction restarted",

    goalFirstHeading: "What matters most to you right now?",
    goalFirstSubtitle:
      "Choose your priority — Sergeant will suggest where to start.",
    goalFirstSkipLabel: "See everything",
    goalFirstAriaLabel: "Onboarding goals",
  },

  welcomeModulePicker: {
    heading: "Where would you like to start?",
    subtitle:
      "Choose the modules you want to begin with. You can add more later.",
    gridAriaLabel: "Starter modules",
    cta: "Get started",
    emptyHint: "Select at least one module to continue.",
    lateHint: "You can add more later in settings.",
    demoCta: "See an example",
    haveAccount: "I already have an account",
    taglines: {
      finyk: "Expenses, budgets and trends",
      fizruk: "Workouts, progress and measurements",
      routine: "Habits, streaks and reminders",
      nutrition: "Calories, AI photo analysis and plans",
    },
  },

  form: {
    quickFill: "Quick fill",
  },

  loaders: {
    pageLoading: "Loading page",
    loadingSection: "Loading section",
  },

  loadingActions: {
    exiting: "Signing out…",
    signingIn: "Signing in…",
    registering: "Registering…",
    connecting: "Connecting…",
    loadingTransactions: "Loading transactions…",
    loadingWorkouts: "Loading workouts",
  },

  modules: {
    openSettings: "Module settings",
  },

  fizruk: {
    returnToActiveWorkout: "Return to active workout",
    workoutRest: "Rest",
    kgUnit: "kg",
  },

  nutrition: {
    fromPantry: "From pantry",
    mealType: "Meal type",
    templates: "Templates",
    reportHeading: "Nutrition (kcal/day)",
    kcalUnit: "kcal",
  },

  routine: {
    dayReport: "Day report",
    weekdays: "Weekdays",
    archive: "Archive",
    reportHeading: "Routine (habit completion)",
    firstRun: {
      title: "Your first habit — a preview",
      description:
        "Add any habit to get started. You can edit it and add more from the same dialog.",
    },
  },

  finyk: {
    reportHeading: "Finyk (expenses)",
    addLimitOrGoal: "+ Add limit or goal",
    transactionsFilterLabel: "Transaction filter",
    monoConnectErrors: {
      tokenRejected:
        "Mono rejected the token. Check that you copied it correctly.",
      networkUnavailable: "Could not reach Mono. Check your connection.",
    },
  },

  profileSessions: {
    sectionTitle: "Active sessions",
    refresh: "Refresh",
    loading: "Loading…",
    empty: "No sessions",
    loadFailed: "Could not load sessions",
    revoke: "End session",
    revokeSuccess: "Session ended",
    revokeFailed: "Could not end session",
    expired: "Expired",
    thisDevice: "This device",
    unknownIp: "IP unknown",
    unknownDevice: "Unknown device",
    lastSeenPrefix: "Active",
  },

  experimentalSection: {
    title: "Experimental",
    intro:
      "These features are still being tested. Enable at your own risk — behavior may change in future versions.",
    warningBanner:
      "Experimental features may be unstable. Settings are saved on this device only.",
    optInLabel: "I understand this might break",
    optInHint:
      "Check this box to unlock the toggles. You'll only be asked once — until you clear site data.",
  },

  privacy: {
    chip: "Only you",
    chipTooltip: "All data is local — no cloud",
    bannerTitle: "Protect Sergeant with a lock",
    bannerHint: "PIN · Face ID — for your Mono token and health data",
    bannerCta: "Set up",

    lock: {
      sectionTitle: "Privacy",
      enableLabel: "App lock",
      enableDescription:
        "Protect your data with a PIN. The app locks when you switch away or after 5 minutes of inactivity.",
      setupTitle: "Set PIN",
      setupSubtitle: "Enter 4–6 digits",
      changeTitle: "Change PIN",
      confirmTitle: "Confirm PIN",
      confirmSubtitle: "Enter your PIN again to confirm",
      unlockTitle: "Enter PIN",
      unlockSubtitle: "Enter your PIN to unlock",
      pinMismatch: "PINs don't match. Try again.",
      pinWrong: "Wrong PIN. Try again.",
      pinTooShort: "PIN must be 4 to 6 digits.",
      lockNow: "Lock now",
      changePin: "Change PIN",
      disableLabel: "Disable lock",
      disableConfirmTitle: "Disable lock?",
      disableConfirmBody: "The app will no longer ask for a PIN when opening.",
      disableConfirmButton: "Disable",
      recoveryHint: "Forgot your PIN? Reset it via account recovery.",
      next: "Next",
      back: "Back",
      open: "Open",
      deleteDigit: "Delete",
    },
  },

  biometrics: {
    sectionTitle: "Biometrics",
    statusReady: "Ready to calculate TDEE",
    statusIncomplete: "Fill in your data to calculate",
    heightLabel: "Height (cm)",
    birthDateLabel: "Date of birth",
    sexLabel: "Sex",
    sexMale: "Male",
    sexFemale: "Female",
    sexPlaceholder: "— Select —",
    activityLabel: "Activity level",
    activityPlaceholder: "— Select —",
    activitySedentaryLabel: "Sedentary",
    activitySedentaryHint: "Desk job, almost no exercise",
    activityLightLabel: "Light activity",
    activityLightHint: "Exercise 1–3 days a week",
    activityModerateLabel: "Moderate",
    activityModerateHint: "Exercise 3–5 days a week",
    activityActiveLabel: "Active",
    activityActiveHint: "Exercise 6–7 days a week",
    activityVeryActiveLabel: "Very active",
    activityVeryActiveHint: "Physical job or 2× daily training",
    weightLabel: "Current weight (kg)",
    weightSyncHint: "Synced with the Body journal in Fizruk",
    save: "Save",
    saveSuccess: "Biometrics saved",
    saveError: "Could not save biometrics",
    ageLabel: "Age",
    ageYearsSuffix: "years",
  },

  nutritionTdee: {
    triggerLabel: "Calculate from profile",
    triggerHint:
      "Fill in your biometrics in your profile (sex, age, height, weight, activity level) and we'll calculate your daily calorie target automatically.",
    profileLink: "Fill in profile",
    goalCutting: "Cut weight (−500 kcal)",
    goalMaintenance: "Maintenance",
    goalBulking: "Bulk (+300 kcal)",
    appliedToast: "Targets applied from profile",
  },

  nutritionGoalRange: {
    kcalTooLow: "Under 800 kcal — not safe without medical supervision.",
    kcalTooHigh: "Over 6 000 kcal — that's a lot even for athletes.",
    proteinTooLow: "Under 30 g protein — risk of deficiency.",
    proteinTooHigh: "Over 300 g protein — that's a lot even for athletes.",
    fatTooLow: "Under 20 g fat — risk of essential fatty acid deficiency.",
    fatTooHigh: "Over 250 g fat — that's high for a typical diet.",
    carbsTooHigh: "Over 700 g carbs — that's a lot even for athletes.",
  },

  publicStatus: {
    pageTitle: "Sergeant — Status",
    pollNote: "Current component status. Updated automatically every",
    pollNoteSuffix: "s.",
    loading: "Loading service status…",
    overallOperational: "All systems operational",
    overallDegraded: "Partial degradation",
    overallDown: "Major outage",
    pillOperational: "Operational",
    pillDegraded: "Degraded",
    pillDown: "Down",
    timestampPrefix: "updated",
    componentsLabel: "Components",
    lastIncidentNone: "No incidents in the last 7 days.",
    lastIncidentPrefix: "Last incident:",
    errorTitle: "Could not load status",
    errorRetry: "Try again",
    errorFallback: "Could not load service status.",
    errorHttpPrefix: "Server responded with HTTP",
  },

  legal: {
    linksNavAria: "Legal documents",
    homeLogoAria: "Sergeant home",
    reviewGateNotice:
      "this is a working draft before public launch — not legal advice. Before open registration the founder or a lawyer must confirm the details, refunds, processors and applicable law.",
    lastUpdatedPrefix: "Last updated:",
    goToPricing: "Go to pricing",
    signInOrCreate: "Sign in or create an account",
  },

  whatsNew: {
    badge: "What's new",
    dismiss: "Got it",
  },

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

  // Initiative 0010 Phase 6.2 — Landing page (`/`). Full EN translation of the
  // `landing` group so non-UA visitors see English copy end-to-end. Voice:
  // 1st-person singular, friendly-not-corporate, concrete. Tier names
  // ("Premium") capitalized per ADR-0051.
  landing: {
    // Header
    signIn: "Sign in",
    signInAria: "Sign in to your account",

    // Hero section
    heroAriaLabel: "Hero — introducing Sergeant",
    eyebrow: "Local-first · AI · In your language",
    heroHeadline:
      "One assistant for finances, workouts,\nnutrition and routines.",
    heroSubcopy:
      "Sergeant combines four modules — Finyk, Fizruk, Nutrition, Routine" +
      " — into one AI chat that remembers your goals and suggests the next step." +
      " No cloud by default. Full control over your data.",
    registerCta: "Create account",
    loginCta: "I already have an account",
    skipCta: "Try without an account",

    // Features section
    featuresAriaLabel: "Why Sergeant",
    features: {
      aiTitle: "AI assistant in your pocket",
      aiBody:
        "A chat that knows your finances, workouts, nutrition and routines — and suggests what to do next.",
      localFirstTitle: "Local-first by default",
      localFirstBody:
        "Your data lives on your device. Cloud sync is optional (Premium) and never turns on without your confirmation.",
      noHiddenTitle: "No surprise charges",
      noHiddenBody:
        "Free tier — forever. Premium — one paid plan, no surprise charges. Pricing will be announced at launch.",
    },

    // Waitlist section
    waitlistAriaLabel: "Subscribe to the Sergeant launch",
    waitlistHeadline: "Get notified when Premium is ready",
    waitlistSubcopy:
      "Leave your email for a launch update. Same interest list," +
      " now with `source=landing` attribution.",

    // Pricing section
    pricingAriaLabel: "View pricing",
    pricingHeadline: "Check out the plans",
    pricingSubcopy:
      "Free forever for everyday use. Premium unlocks unlimited AI chat," +
      " auto-Mono sync and cross-device CloudSync.",
    pricingCta: "See plans",

    // Footer
    footerText:
      "Sergeant is a Ukrainian project. No ads, no data reselling," +
      " no dark patterns. Telegram channel for updates and a public" +
      " changelog in the repo.",
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
        "One paid plan. No tiers, no lifetime deal, no trial timer. Tap Premium and payment opens (LiqPay / Plata).",
    },
    tiers: {
      freeName: "Free",
      freePrice: "₴0",
      freeCadence: "forever",
      freeTagline:
        "All modules, unlimited manual tracking. AI — 15 messages/day.",
      premiumName: "Premium",
      premiumCadence: "/ month (yearly plan — coming soon)",
      premiumTagline: "Everything unlocked. One plan — no tiers, no add-ons.",
    },
    features: {
      allModules: "All 4 modules — full access",
      manualTracking: "Manual tracking with no numeric limits",
      aiChat: "AI chat",
      cloudSync2Devices: "Cloud sync on 2 devices",
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
      monoAutoSync: "Monobank auto-sync",
      cloudSync: "Cross-device CloudSync",
    },
    limits: {
      // Leading space matches uk — composes as `${N} / month`.
      perMonth: " / month",
      unlimited: "unlimited",
      aiChatPerDay: "15 / day",
    },
    cta: {
      tryPremium: "Try Premium",
      openingCheckout: "Opening payment…",
      manageSubscription: "Manage subscription",
      openingPortal: "Opening management…",
      switchToFree: "Switch to Free",
      currentPlan: "Your current plan",
    },
    status: {
      checkoutCreatedPrefix: "Payment session created",
    },
    errors: {
      checkoutUnavailable:
        "Payment is temporarily unavailable. Leave your email below and we'll follow up when you can pay.",
      portalNoBillingCustomer:
        "No billing profile found. Reach out to support — we'll set it up manually.",
      portalUnavailable:
        "Subscription management is temporarily unavailable. Try again later.",
      portalGeneric:
        "Couldn't open subscription management. Check your connection and try again.",
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
      "Prices in UAH. UA payments go through LiqPay / Plata. Legacy Stripe subscriptions use a separate billing portal.",
  },
};
