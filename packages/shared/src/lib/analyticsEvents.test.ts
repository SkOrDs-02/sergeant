import { describe, it, expect } from "vitest";
import { ANALYTICS_EVENTS, type AnalyticsEventName } from "./analyticsEvents";
import { VALUE_LOOP_ANALYTICS_EVENTS } from "./analyticsEvents.valueLoops";

describe("ANALYTICS_EVENTS registry", () => {
  it("is frozen so callsites cannot mutate event names at runtime", () => {
    expect(Object.isFrozen(ANALYTICS_EVENTS)).toBe(true);
  });

  it("keeps all event names unique (no accidental duplicates)", () => {
    const values = Object.values(ANALYTICS_EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("keeps event strings snake_case and stable", () => {
    for (const value of Object.values(ANALYTICS_EVENTS)) {
      expect(value).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    }
  });

  // Canonical event names — if any of these change, dashboards / funnels in
  // PostHog must move with them in the same PR. The registry is the source
  // of truth, but this assertion makes a rename impossible by accident.
  it("exposes the HubChat / CloudSync / Subscription groups verbatim", () => {
    expect(ANALYTICS_EVENTS.HUBCHAT_MESSAGE_SENT).toBe("hubchat_message_sent");
    expect(ANALYTICS_EVENTS.HUBCHAT_TOOL_INVOKED).toBe("hubchat_tool_invoked");
    expect(ANALYTICS_EVENTS.HUBCHAT_ERROR).toBe("hubchat_error");

    expect(ANALYTICS_EVENTS.SYNC_STARTED).toBe("sync_started");
    expect(ANALYTICS_EVENTS.SYNC_SUCCEEDED).toBe("sync_succeeded");
    expect(ANALYTICS_EVENTS.SYNC_FAILED).toBe("sync_failed");
    expect(ANALYTICS_EVENTS.SYNC_CONFLICT_RESOLVED).toBe(
      "sync_conflict_resolved",
    );

    expect(ANALYTICS_EVENTS.SIGNUP_COMPLETED).toBe("signup_completed");

    // PR-07 — `onboarding_completed` is the once-per-account funnel
    // milestone in WF-60 (`signup_completed → onboarding_completed →
    // first_action_completed`). Renaming the string breaks dashboards
    // that rely on it; this assertion makes a silent rename impossible.
    expect(ANALYTICS_EVENTS.ONBOARDING_COMPLETED).toBe("onboarding_completed");

    expect(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED).toBe("subscription_started");
    expect(ANALYTICS_EVENTS.SUBSCRIPTION_CANCELED).toBe(
      "subscription_canceled",
    );
    expect(ANALYTICS_EVENTS.SUBSCRIPTION_RENEWED).toBe("subscription_renewed");
  });

  it("exposes the feedback-loop group verbatim", () => {
    // `nps_survey_eligible` is referenced verbatim by the PostHog Survey
    // display condition (dashboard-side config), and `feedback_submitted`
    // by the feedback-inbox insight. A rename here silently kills the NPS
    // survey trigger — pin the strings.
    expect(ANALYTICS_EVENTS.FEEDBACK_WIDGET_OPENED).toBe(
      "feedback_widget_opened",
    );
    expect(ANALYTICS_EVENTS.FEEDBACK_SUBMITTED).toBe("feedback_submitted");
    expect(ANALYTICS_EVENTS.NPS_SURVEY_ELIGIBLE).toBe("nps_survey_eligible");
  });

  it("exposes the billing-failure (observability) event verbatim", () => {
    // Fired server-side from the Stripe webhook handler; PostHog funnels for
    // checkout drop-rate / 3DS-fail rate key off this exact string. Renaming
    // it silently breaks those dashboards — pin it here.
    expect(ANALYTICS_EVENTS.PAYMENT_FAILED).toBe("payment_failed");
  });

  it("exposes the Pricing / Waitlist (Phase 0 monetization) group verbatim", () => {
    expect(ANALYTICS_EVENTS.PRICING_VIEWED).toBe("pricing_viewed");
    expect(ANALYTICS_EVENTS.PRICING_CTA_CLICKED).toBe("pricing_cta_clicked");
    expect(ANALYTICS_EVENTS.WAITLIST_SUBMITTED).toBe("waitlist_submitted");
  });

  it("exposes the Revenue / Activation / Landing groups (initiative 0010 Phases 4–6) verbatim", () => {
    // Paywall + checkout funnel — referenced by `PaywallModal`,
    // `PricingPage` and the Stripe webhook handler.
    expect(ANALYTICS_EVENTS.PAYWALL_VIEWED).toBe("paywall_viewed");
    expect(ANALYTICS_EVENTS.CHECKOUT_OPENED).toBe("checkout_opened");

    // Activation v2 (initiative 0010 Phase 5).
    expect(ANALYTICS_EVENTS.ACTIVATION_V2_HIT).toBe("activation_v2_hit");

    // Landing surfaces (initiative 0010 Phase 6.1).
    expect(ANALYTICS_EVENTS.LANDING_VIEWED).toBe("landing_viewed");
    expect(ANALYTICS_EVENTS.LANDING_EMAIL_CAPTURED).toBe(
      "landing_email_captured",
    );
    expect(ANALYTICS_EVENTS.LANDING_TELEGRAM_CLICKED).toBe(
      "landing_telegram_clicked",
    );
    expect(ANALYTICS_EVENTS.LANDING_WIDGET_CHANGED).toBe(
      "landing_widget_changed",
    );
    expect(ANALYTICS_EVENTS.LANDING_FAQ_OPENED).toBe("landing_faq_opened");

    // Auth multi-provider (initiative 0010 Phase 4.3).
    expect(ANALYTICS_EVENTS.SIGNUP_PROVIDER_SELECTED).toBe(
      "signup_provider_selected",
    );
  });

  it("exposes the UX-roast 2026-Q2 event groups verbatim", () => {
    // App Lock — PR-0 / PR-1a / PR-1b
    expect(ANALYTICS_EVENTS.APP_LOCK_SETUP_STARTED).toBe(
      "app_lock_setup_started",
    );
    expect(ANALYTICS_EVENTS.APP_LOCK_SETUP_COMPLETED).toBe(
      "app_lock_setup_completed",
    );
    expect(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_SUCCESS).toBe(
      "app_lock_unlock_success",
    );
    expect(ANALYTICS_EVENTS.APP_LOCK_UNLOCK_FAILED).toBe(
      "app_lock_unlock_failed",
    );
    expect(ANALYTICS_EVENTS.BIOMETRIC_SETUP_COMPLETED).toBe(
      "biometric_setup_completed",
    );
    expect(ANALYTICS_EVENTS.BIOMETRIC_AUTH_SUCCESS).toBe(
      "biometric_auth_success",
    );
    expect(ANALYTICS_EVENTS.BIOMETRIC_AUTH_FAILED_FALLBACK_PIN).toBe(
      "biometric_auth_failed_fallback_pin",
    );

    // Module navigation — PR-2 / PR-4
    expect(ANALYTICS_EVENTS.MODULE_SETTINGS_OPENED).toBe(
      "module_settings_opened_from_module",
    );
    expect(ANALYTICS_EVENTS.MODULE_LANDING_TAB_CLICKED).toBe(
      "module_landing_tab_clicked",
    );

    // Error recovery — PR-14
    expect(ANALYTICS_EVENTS.ERROR_BOUNDARY_REQUEST_ID_COPIED).toBe(
      "error_boundary_request_id_copied",
    );
    expect(ANALYTICS_EVENTS.ERROR_BOUNDARY_RETRIED).toBe(
      "error_boundary_retried",
    );

    // Permissions — PR-7
    expect(ANALYTICS_EVENTS.PERMISSIONS_SETTINGS_OPENED).toBe(
      "permissions_settings_opened",
    );
    expect(ANALYTICS_EVENTS.PERMISSION_STATUS_CHANGED).toBe(
      "permission_status_changed",
    );
  });

  // Хвиля 2 — петлі цінності. Ці 10 рядків заморожені ДО того, як
  // інструментовано хоч один callsite: `.telemetry/tracking-plan.yaml`
  // § naming_convention прямо каже, що ренейм ламає дашборди й губить
  // історію. Асерти нижче роблять перейменування падінням тесту, а не
  // мовчазною смертю дашборда.
  it("exposes the Wave-2 value-loop groups verbatim", () => {
    // Сигнал показано / активовано / приховано (спільний шов InsightCard).
    expect(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN).toBe("value_signal_shown");
    expect(ANALYTICS_EVENTS.VALUE_SIGNAL_ACTIVATED).toBe(
      "value_signal_activated",
    );
    expect(ANALYTICS_EVENTS.VALUE_SIGNAL_DISMISSED).toBe(
      "value_signal_dismissed",
    );
    expect(ANALYTICS_EVENTS.VALUE_SIGNAL_ASK_AI).toBe("value_signal_ask_ai");

    // Друга половина петлі — «дію зроблено», по одній події на модуль.
    expect(ANALYTICS_EVENTS.ROUTINE_HABIT_CHECKED).toBe(
      "routine_habit_checked",
    );
    expect(ANALYTICS_EVENTS.FIZRUK_WORKOUT_FINISHED).toBe(
      "fizruk_workout_finished",
    );
    expect(ANALYTICS_EVENTS.FIZRUK_WORKOUT_STARTED).toBe(
      "fizruk_workout_started",
    );
    expect(ANALYTICS_EVENTS.FIZRUK_WORKOUT_DISCARDED).toBe(
      "fizruk_workout_discarded",
    );
    expect(ANALYTICS_EVENTS.FIZRUK_REST_TIMER_DONE).toBe(
      "fizruk_rest_timer_done",
    );
    expect(ANALYTICS_EVENTS.FIZRUK_INJURY_MARKED).toBe("fizruk_injury_marked");
    expect(ANALYTICS_EVENTS.FIZRUK_INJURY_CLEARED).toBe(
      "fizruk_injury_cleared",
    );
    expect(ANALYTICS_EVENTS.NUTRITION_MEAL_LOGGED).toBe(
      "nutrition_meal_logged",
    );
    expect(ANALYTICS_EVENTS.FINYK_TX_CATEGORIZED).toBe("finyk_tx_categorized");

    // AI-порада: показ + реакція + провал (тіло поради в payload не існує).
    expect(ANALYTICS_EVENTS.AI_ADVICE_SHOWN).toBe("ai_advice_shown");
    expect(ANALYTICS_EVENTS.AI_ADVICE_REACTED).toBe("ai_advice_reacted");
    expect(ANALYTICS_EVENTS.AI_ADVICE_FAILED).toBe("ai_advice_failed");

    // Експозиція стріку поза InsightCard.
    expect(ANALYTICS_EVENTS.ROUTINE_STREAK_SHOWN).toBe("routine_streak_shown");

    // Стабільний крос-девайсний advice_id (беta-хардненінг).
    expect(ANALYTICS_EVENTS.ADVICE_SHOWN).toBe("advice_shown");
    expect(ANALYTICS_EVENTS.ADVICE_DISMISSED).toBe("advice_dismissed");
  });

  it("keeps the Wave-2 value-loop group reachable through the single registry", () => {
    // Група винесена в `analyticsEvents.valueLoops.ts` заради
    // module-size-дисципліни (Hard Rule #18). Реєстр мусить лишатися
    // ОДИН: якщо spread колись загубиться, доступ
    // `ANALYTICS_EVENTS.<X>` мовчки стане `undefined` — цей тест ловить
    // саме це, а не просто рядкові значення.
    const wave2 = [
      ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN,
      ANALYTICS_EVENTS.VALUE_SIGNAL_ACTIVATED,
      ANALYTICS_EVENTS.VALUE_SIGNAL_DISMISSED,
      ANALYTICS_EVENTS.VALUE_SIGNAL_ASK_AI,
      ANALYTICS_EVENTS.ROUTINE_HABIT_CHECKED,
      ANALYTICS_EVENTS.FIZRUK_WORKOUT_STARTED,
      ANALYTICS_EVENTS.FIZRUK_WORKOUT_FINISHED,
      ANALYTICS_EVENTS.FIZRUK_WORKOUT_DISCARDED,
      ANALYTICS_EVENTS.FIZRUK_REST_TIMER_DONE,
      ANALYTICS_EVENTS.FIZRUK_INJURY_MARKED,
      ANALYTICS_EVENTS.FIZRUK_INJURY_CLEARED,
      ANALYTICS_EVENTS.NUTRITION_MEAL_LOGGED,
      ANALYTICS_EVENTS.FINYK_TX_CATEGORIZED,
      ANALYTICS_EVENTS.AI_ADVICE_SHOWN,
      ANALYTICS_EVENTS.AI_ADVICE_REACTED,
      ANALYTICS_EVENTS.AI_ADVICE_FAILED,
      ANALYTICS_EVENTS.ROUTINE_STREAK_SHOWN,
      ANALYTICS_EVENTS.ADVICE_SHOWN,
      ANALYTICS_EVENTS.ADVICE_DISMISSED,
    ];

    // Тип мусить лишатись ЛІТЕРАЛЬНИМ після spread-у, а не розширитись до
    // `string` — інакше `AnalyticsEventName` тихо перестане ловити одруківки
    // на callsite-ах. Ці два рядки падають на typecheck, не на runtime.
    const literal: "value_signal_shown" = ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN;
    const fromUnion: AnalyticsEventName = ANALYTICS_EVENTS.ROUTINE_STREAK_SHOWN;
    expect(literal).toBe("value_signal_shown");
    expect(fromUnion).toBe("routine_streak_shown");

    // Звірка МНОЖИН, а не довжин. Спершу тут стояло `toHaveLength(10)` —
    // тавтологія проти рукописного літерала. Довжина проти реєстру була вже
    // кращою, але теж дірявою: дубль у `wave2` плюс пропущена подія дають ту
    // саму довжину і тест мовчить. Рівність множин ловить обидва випадки.
    expect(new Set(wave2)).toEqual(
      new Set(Object.values(VALUE_LOOP_ANALYTICS_EVENTS)),
    );
    // Окремо — що дублів немає: `Set` вище сам би їх схлопнув.
    expect(wave2).toHaveLength(new Set(wave2).size);
    for (const name of wave2) {
      expect(typeof name).toBe("string");
      expect(Object.values(ANALYTICS_EVENTS)).toContain(name);
    }
  });
});
