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
});
