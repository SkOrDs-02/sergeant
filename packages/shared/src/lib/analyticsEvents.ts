/**
 * Canonical analytics event names shared across platforms.
 *
 * Web owns the transport (`trackEvent`) today; mobile can forward these
 * names to whatever sink it adopts later without drifting on strings.
 */
export const ANALYTICS_EVENTS = Object.freeze({
  // Onboarding wizard (multi-step v2)
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_COMPLETED: "onboarding_completed",
  ONBOARDING_VIBE_PICKED: "onboarding_vibe_picked",
  ONBOARDING_STEP_VIEWED: "onboarding_step_viewed",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_GOAL_SET: "onboarding_goal_set",
  ONBOARDING_SKIPPED: "onboarding_skipped",

  // Finyk / activation
  EXPENSE_ADDED: "expense_added",
  EXPENSE_DELETED: "expense_deleted",
  BUDGET_SET: "budget_set",
  ANALYTICS_OPENED: "analytics_opened",
  BANK_CONNECT_STARTED: "bank_connect_started",
  BANK_CONNECT_SUCCESS: "bank_connect_success",
  MONO_TOKEN_MIGRATED: "mono_token_migrated",
  PAYWALL_VIEWED: "paywall_viewed",
  FIRST_EXPENSE_ADDED: "first_expense_added",
  FIRST_INSIGHT_SEEN: "first_insight_seen",

  // FTUX: first action → preset → first real entry
  ONBOARDING_FIRST_ACTION_SHOWN: "onboarding_first_action_shown",
  ONBOARDING_FIRST_ACTION_PICKED: "onboarding_first_action_picked",
  FTUX_PRESET_SHEET_SHOWN: "ftux_preset_sheet_shown",
  FTUX_PRESET_PICKED: "ftux_preset_picked",
  FTUX_PRESET_CUSTOM: "ftux_preset_custom",
  FIRST_REAL_ENTRY: "first_real_entry",
  FTUX_TIME_TO_VALUE: "ftux_time_to_value",

  // Soft auth prompt (post-value)
  AUTH_PROMPT_SHOWN: "auth_prompt_shown",
  AUTH_PROMPT_DISMISSED: "auth_prompt_dismissed",
  AUTH_AFTER_VALUE: "auth_after_value",

  // Module checklists (Phase 2 — activation)
  MODULE_CHECKLIST_SHOWN: "module_checklist_shown",
  MODULE_CHECKLIST_STEP_DONE: "module_checklist_step_done",
  MODULE_CHECKLIST_DISMISSED: "module_checklist_dismissed",

  // Permissions (Phase 2 — contextual prompts)
  PERMISSION_REQUESTED: "permission_requested",
  PERMISSION_GRANTED: "permission_granted",
  PERMISSION_DENIED: "permission_denied",

  // Celebrations (Phase 2 — enriched feedback)
  CELEBRATION_SHOWN: "celebration_shown",

  // Streak milestones (Phase 2 — engagement)
  //   STREAK_MILESTONE_REACHED { days: number, type: "toast" | "modal" }
  STREAK_MILESTONE_REACHED: "streak_milestone_reached",

  // Daily nudges (Phase 3 — retention)
  DAILY_NUDGE_SHOWN: "daily_nudge_shown",
  DAILY_NUDGE_CLICKED: "daily_nudge_clicked",
  DAILY_NUDGE_DISMISSED: "daily_nudge_dismissed",

  // Re-engagement (Phase 3 — retention)
  REENGAGEMENT_SHOWN: "reengagement_shown",
  REENGAGEMENT_CLICKED: "reengagement_clicked",

  // Hints / tips system
  HINT_SHOWN: "hint_shown",
  HINT_CLICKED: "hint_clicked",
  HINT_DISMISSED: "hint_dismissed",
  HINT_COMPLETED: "hint_completed",

  // HubChat — AI conversational assistant.
  //
  // Трекаємо факт взаємодії, НЕ текст повідомлень. Payload-контракти:
  //
  //   HUBCHAT_MESSAGE_SENT   { length: number, fromVoice: boolean,
  //                            hasQuickAction?: boolean, module?: string }
  //   HUBCHAT_TOOL_INVOKED   { tool: string, module: string,
  //                            success: boolean, latency_ms: number }
  //   HUBCHAT_ERROR          { kind: "http" | "parse" | "aborted" | "network"
  //                                 | "unknown",
  //                            status?: number }
  //
  // `tool` — канонічне ім'я ChatAction (напр. `add_expense`, `log_workout`).
  // Body повідомлень / tool_input НЕ потрапляють у payload — лише counts
  // + latency + провайдер/модуль, щоб дашборди працювали без експорту PII.
  HUBCHAT_MESSAGE_SENT: "hubchat_message_sent",
  HUBCHAT_TOOL_INVOKED: "hubchat_tool_invoked",
  HUBCHAT_ERROR: "hubchat_error",

  // CloudSync — local-first replication engine (`apps/web/src/core/cloudSync`).
  //
  //   SYNC_STARTED            { trigger?: "manual" | "auto" | "initial" }
  //   SYNC_SUCCEEDED          { duration_ms: number, modules?: number }
  //   SYNC_FAILED             { error_type: SyncError["type"],
  //                             retryable: boolean, duration_ms?: number }
  //   SYNC_CONFLICT_RESOLVED  { kind: "push" | "initial-merge",
  //                             modules: number }
  //
  // `SYNC_CONFLICT_RESOLVED.modules` — кількість модулів, для яких LWW
  // guard на бекенді повернув `conflict: true` (push) або локальні
  // dirty-зміни переважили cloud-snapshot (initial-merge). Дозволяє
  // алерт-ити spike-и conflict-ів без експорту body.
  SYNC_STARTED: "sync_started",
  SYNC_SUCCEEDED: "sync_succeeded",
  SYNC_FAILED: "sync_failed",
  SYNC_CONFLICT_RESOLVED: "sync_conflict_resolved",

  // Subscription / billing — placeholders. Білінг поки не підключено;
  // константи зафіксовані тут, щоб майбутні callsite-и не винаходили
  // власні імена і дашборд-funnel-и у PostHog не розвалилися між
  // першим і другим релізом білінгу. Коли IAP / Stripe-інтеграція
  // оживе, payload-контракти очікуються такі:
  //
  //   SUBSCRIPTION_STARTED   { plan: "monthly" | "yearly",
  //                            source: "paywall" | "deeplink" | "cta",
  //                            price_cents: number, currency: string }
  //   SUBSCRIPTION_CANCELED  { plan: string, reason?: "user" | "billing"
  //                                                  | "expired" }
  //   SUBSCRIPTION_RENEWED   { plan: string, period: number }
  //
  // Revenue-аналітика (MRR / ARR) рахується у PostHog через
  // `$revenue` super-property на `SUBSCRIPTION_STARTED` /
  // `SUBSCRIPTION_RENEWED` (task TBD коли буде білінг).
  SUBSCRIPTION_STARTED: "subscription_started",
  SUBSCRIPTION_CANCELED: "subscription_canceled",
  SUBSCRIPTION_RENEWED: "subscription_renewed",

  // Pricing / waitlist (Phase 0 monetization rails). Без активного білінгу:
  // вимірюємо попит до того, як вкладатись у Stripe / Mono jar інтеграцію.
  // Очікувані payload-контракти:
  //
  //   PRICING_VIEWED         { source?: "settings" | "paywall" | "direct" }
  //   PRICING_CTA_CLICKED    { tier: "free" | "plus" | "pro",
  //                            cta: "waitlist" | "primary" }
  //   WAITLIST_SUBMITTED     { tier_interest: "free" | "plus" | "pro" | "unsure",
  //                            source: "pricing_page" | "paywall" | "settings"
  //                                   | "onboarding",
  //                            created: boolean }
  PRICING_VIEWED: "pricing_viewed",
  PRICING_CTA_CLICKED: "pricing_cta_clicked",
  WAITLIST_SUBMITTED: "waitlist_submitted",
} as const);

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
