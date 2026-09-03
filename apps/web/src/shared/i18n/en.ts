import type { messages as ukMessages, MessageGroupShape } from "./uk";
import { pricingEn } from "./en.pricing";

/**
 * Full English catalog. Top-level keys present here REPLACE the same
 * key in `uk.ts` when the resolver picks `lang='en'`. Top-level keys absent
 * fall through to `uk.ts`. See `index.ts → getMessages()` for merge semantics.
 *
 * Type contract: структурне дзеркало `typeof uk`, Partial лише на верхньому
 * рівні. Оголосив групу — зобовʼязаний перекласти КОЖЕН її ключ, інакше
 * compile error. Це механічне втілення shallow-merge правила «translate the
 * whole group or don't touch it»: раніше тип був `Partial<MessageCatalog>`
 * (гола index-signature), і 3-ключовий stub групи `fizruk` мовчки затирав
 * 283 UA-ключі, даючи `undefined`/TypeError під `?lang=en`.
 */
export const messagesEn: Partial<{
  [K in keyof typeof ukMessages]: MessageGroupShape<(typeof ukMessages)[K]>;
}> = {
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
    errorNetwork: "Sync failed, check your connection.",
    errorServerRetryable: "The server is temporarily unresponsive. Try again.",
    errorServerNonRetryable: "Sync error. Check your input.",
    errorGeneric: "Sync error.",
    retryCta: "Try again",

    conflictResolved: "Conflict resolved automatically.",
    pushFailed: "Sync failed. We'll retry shortly.",
    offlineQueueRecovered: "Recovered from offline queue.",

    anonymousMigrationProgress:
      "Moving your data into the profile and saving it to the server…",
    anonymousMigrationFailure:
      "Could not finish the migration. The data on this device was not deleted, but it is not protected by sync yet.",
    anonymousMigrationRetry: "Retry",
    anonymousMigrationDefer: "Continue, I'll migrate later",
    anonymousMigrationDeferredToast:
      "Okay. The data stays on this device; I'll try to migrate it on the next launch.",
    anonymousMigrationDeferredNotice:
      "The data has not been moved to the profile yet, it lives only on this device.",
    anonymousMigrationDeferredRetry: "Try now",
    anonymousMigrationSuccess:
      "Data migrated and safely stored in your profile.",
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
    categoryNameRequired: "Enter a category name",
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
    hiddenValuePrefix: "Hidden",
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
    finykSections: "Finyk sections",
    fizrukSections: "Fizruk sections",
    routineSections: "Routine sections",
    nutritionSections: "Nutrition sections",
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

  durability: {
    localOnly: {
      title: "Data lives on this device only",
      body: "Cash expenses, assets, debts and your own categories for bank transactions are stored here only. Clearing browser data wipes them, and the bank cannot bring them back. Signing in enables a server copy.",
      signIn: "Sign in",
      backup: "Download a copy",
    },
  },

  dataExport: {
    busy: "Preparing export…",
    downloadJson: "Download JSON",
    downloadCsv: "Download CSV",
    formatsHint:
      "JSON is the complete file for moving your data elsewhere. CSV is a table for simply looking at it in Excel or Google Sheets.",
    doneJson: "Server export downloaded as JSON.",
    doneCsv: "Server export downloaded as CSV.",
    failed: "Could not create the server export. Check that you are signed in.",
    sections: {
      moduleData: "Module data",
      monoAccounts: "Monobank accounts",
      monoTransactions: "Monobank transactions",
      monoConnection: "Monobank connection",
      subscriptions: "Subscriptions",
      pushDevices: "Notification devices",
      aiUsage: "AI usage by day",
      aiMemories: "AI memory",
    },
    subprocessors: {
      title: "Where your data goes for AI",
      body: "To answer in chat, give advice and recognize photos, we send requests to Anthropic, and to Voyage AI for memory search. Before sending we strip email, phone, IBAN, card number and tax ID, and people's names from bank transfers.",
      photoNote:
        "Photos are the exception: part of the frame cannot be hidden, so it is sent whole. We warn you before the first photo.",
    },
    sunset: {
      title: "If Sergeant ever shuts down",
      body: "We will warn you at least 30 days ahead, and export will keep working the whole time. Your data is yours: take it whenever you like, no permission and no explanation needed.",
      bankNote:
        "One honest caveat: we do not duplicate bank transactions, they can always be pulled from the bank again. But if you no longer have access to the bank, nobody can restore that history.",
    },
  },

  hub: {
    destructiveConfirm: {
      title: "Confirm an irreversible action",
      body: "The assistant wants to do something that cannot be undone:",
      confirm: "Yes, do it",
      cancel: "Cancel",
    },
    otherTips: "More tips",
    chatQuickActions: "Quick scenarios",
    valueProgressAria: "Progress toward your goals",
    crossModulePreviewAria: "What Sergeant will show next",
    weeklyDigestTitle: "Weekly digest: stories",
    chatOfflineNotice:
      "The assistant is unavailable without internet. Module data is visible offline, but\n          AI responses require a connection.",

    chatEmptyTitle: "Ask me anything, I'm here to help",
    chatEmptyDescription:
      "Tap a suggestion, it fills the input so you can edit it before sending.",
    chatEmptyAiDisclosure:
      "You are talking to an AI, not a person. It can be wrong, so double-check anything important.",
    chatEmptyAriaLabel: "Chat starter suggestions",
    chatEmptySuggestionFinyk: "How much did I spend this week?",
    chatEmptySuggestionFizruk: "How are my workouts going?",
    chatEmptySuggestionNutrition: "What did I eat today?",
    chatEmptySuggestionRoutine: "Status of my habits",

    reportNoData: "No data",
    reportChartAria: "Chart",
    reportPrevious: "Previous:",
    reportDeltaFlat: "no change",

    overlayTitle: "AI assistant",
    closeChat: "Close chat",
    chatUsageUnit: "requests",
    chatUsageAriaPrefix: "Used",
    chatUsageAriaSuffix: "AI requests today",
    chatUsageExhausted: "AI request limit reached for today. See plans",
  },

  onboarding: {
    pickerAllOnHint: "Everything is on, switch off what you will not use.",
    hideChecklist: "Hide checklist",

    capabilitiesGroupTitle: "Capabilities",
    tourLaunchLabel: "What the app can do",
    appCapabilitiesHint:
      "What each section does and how they work together. Nothing changes in your data.",

    goalFirstHeading: "What matters most to you right now?",
    goalFirstSubtitle:
      "Choose your priority, Sergeant will suggest where to start.",
    goalFirstSkipLabel: "See everything",
    goalFirstAriaLabel: "Onboarding goals",

    presetSaveFailed: "Could not save. Try again.",
    demoBadgeText: "Demo",
    demoBadgeExit: "Exit",
    demoBadgeLabel: "Demo data: tap to exit and create your own profile",
    demoBadgeTitle: "Demo. Tap to exit and start from a clean slate.",
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

  // Групи fizruk / finyk / nutrition / routine НЕ оголошені навмисно:
  // за shallow-merge контрактом оголошена група повністю замінює UA-групу,
  // а перекладати 280+ ключів модуля частково заборонено (див. тип вище).
  // Історичні 3–7-ключові stub-и цих груп видалено 2026-08-28 — вони
  // затирали 560 UA-ключів і давали TypeError під `?lang=en`.

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
    currentUnknown:
      "Could not identify this device's session. Refresh the list to end sessions.",
  },

  experimentalSection: {
    // V-7 (2026-08-08): mirrors the uk.ts rename — see that file's comment.
    title: "Experimental features",
    intro:
      "These features are still being tested. Enable at your own risk, behavior may change in future versions.",
    warningBanner:
      "Experimental features may be unstable. Settings are saved on this device only.",
    optInLabel: "I understand this might break",
    optInHint:
      "Check this box to unlock the toggles. You'll only be asked once, until you clear site data.",
  },

  privacy: {
    chip: "Only you",
    chipTooltip: "All data is local, no cloud",
    bannerTitle: "Protect Sergeant with a lock",
    bannerHint: "PIN · Face ID: for your Mono token and health data",
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

    aiMemory: {
      sectionTitle: "What the AI remembers about you",
      // V-11 (2026-08-09): mirrors the uk.privacy.ts addition — see the
      // comment there for why this scope line exists.
      sectionScope:
        "Everything the assistant has remembered: from chat, modules and your profile.",
      sectionHint:
        "Each fact can be deleted individually. Deleted facts are gone for good.",
      loading: "Loading memory…",
      loadError: "Could not load AI memory.",
      empty:
        "The AI hasn't recorded anything about you yet. Facts appear when you mention something important in chat: an allergy, a goal, a constraint.",
      loadMore: "Show more",
      loadingMore: "Loading…",
      deleteAria: "Delete fact",
      confirmTitle: "Delete this fact?",
      confirmBody:
        "will be gone from the AI memory for good, there is no undo.",
      confirmButton: "Delete permanently",
      deleteError: "Could not delete the fact. Try again.",
      groupToggleAria: "Show facts from this source",
      expandFact: "Show in full",
      // The `profile` group is no longer a checklist with delete buttons:
      // it is a pointer card, since the single profile-facts editor now
      // lives in Profile -> "Memory bank" (owner decision 2026-08-30).
      // Mirrors uk.privacy.ts.
      profileGroupTitle: "Profile facts",
      profileGroupHint:
        "This is what you told us about yourself. Edit and delete it in your profile.",
      profileGroupAction: "Open profile",
      /** `{count}` — how many facts from this group are loaded so far. */
      profileGroupCount: "Facts: {count}",
      collapseFact: "Collapse",
      technicalGroupHints: {
        product:
          "App service markers: registration, onboarding, first action in a module, subscription. The assistant reads them as an action history, not as a fact about you.",
        digest:
          "Weekly reports the assistant compiled itself from your modules. This is not a fact you told it — it is its own summary.",
      },
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
    sexPlaceholder: "Select",
    activityLabel: "Activity level",
    activityPlaceholder: "Select",
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
    countWorkoutsLabel: "Count workouts in the target",
    countWorkoutsHint:
      "Off: the target comes from your activity level, which already accounts for training up front. On: the target starts at rest and adds what you actually burned today, and the activity level stops accounting for training.",
    save: "Save",
    saveSuccess: "Biometrics saved",
    saveError: "Could not save biometrics",
    heightRangeError: "Height must be between 80 and 260 cm",
    weightRangeError: "Weight must be between 20 and 400 kg",
    ageLabel: "Age",
    ageYearsSuffix: "years",
  },

  nutritionTdee: {
    triggerLabel: "Calculate from profile",
    triggerHint:
      "Fill in your biometrics in your profile (sex, age, height, weight, activity level) and we'll calculate your daily calorie target automatically.",
    missingPrefix: "Your profile is missing:",
    missingHeight: "height",
    missingBirthDate: "birth date",
    missingSex: "sex",
    missingActivity: "activity level",
    missingWeight: "weight",
    profileLink: "Fill in profile",
    goalCutting: "Cut weight (−500 kcal)",
    goalMaintenance: "Maintenance",
    goalBulking: "Bulk (+300 kcal)",
    appliedToast: "Targets applied from profile",
  },

  nutritionGoalRange: {
    kcalTooLow: "Under 800 kcal, not safe without medical supervision.",
    kcalTooHigh: "Over 6 000 kcal, that's a lot even for athletes.",
    proteinTooLow: "Under 30 g protein, risk of deficiency.",
    proteinTooHigh: "Over 300 g protein, that's a lot even for athletes.",
    fatTooLow: "Under 20 g fat, risk of essential fatty acid deficiency.",
    fatTooHigh: "Over 250 g fat, that's high for a typical diet.",
    carbsTooHigh: "Over 700 g carbs, that's a lot even for athletes.",
  },

  publicStatus: {
    pageTitle: "Sergeant · Status",
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
      "this is a working draft before public launch, not legal advice. Before open registration the founder or a lawyer must confirm the details, refunds, processors and applicable law.",
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
      title: "AI photo analysis: Premium",
      description:
        "AI estimates calories, protein, carbs and fat from a meal photo. Available on Premium.",
    },
    "multi-currency": {
      name: "Multi-currency assets",
      title: "Multi-currency: Premium",
      description:
        "Hold assets in USD or EUR. I show them separately for now, I don't fold them into your UAH net worth.",
    },
    "analytics-export-pdf": {
      name: "PDF export",
      title: "PDF reports: Premium",
      description: "Cross-module reports and PDF export, available on Premium.",
    },
  },

  pricing: pricingEn,
};
