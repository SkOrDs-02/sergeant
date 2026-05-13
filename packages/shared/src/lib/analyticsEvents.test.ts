import { describe, it, expect } from "vitest";
import { ANALYTICS_EVENTS } from "./analyticsEvents";

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

  it("exposes the Pricing / Waitlist (Phase 0 monetization) group verbatim", () => {
    expect(ANALYTICS_EVENTS.PRICING_VIEWED).toBe("pricing_viewed");
    expect(ANALYTICS_EVENTS.PRICING_CTA_CLICKED).toBe("pricing_cta_clicked");
    expect(ANALYTICS_EVENTS.WAITLIST_SUBMITTED).toBe("waitlist_submitted");
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
});
