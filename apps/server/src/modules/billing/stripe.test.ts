import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  processStripeWebhook,
  __setPostHogCaptureForTesting,
} from "./stripe.js";
import type { capturePostHogEvent } from "../../lib/posthogCapture.js";

function createClient(rowCount: number) {
  const query = vi.fn().mockResolvedValue({ rowCount, rows: [] });
  return {
    query,
    release: vi.fn(),
  };
}

describe("Stripe billing webhook processing", () => {
  beforeEach(() => {
    delete process.env["STRIPE_WEBHOOK_SECRET"];
  });

  afterEach(() => {
    __setPostHogCaptureForTesting(null);
  });

  it("records webhook idempotency and applies checkout completion once", async () => {
    const client = createClient(1);
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const result = await processStripeWebhook(
      pool as never,
      {
        id: "evt_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_1",
            client_reference_id: "user_1",
            customer: "cus_1",
            subscription: "sub_1",
            metadata: { plan: "pro" },
          },
        },
      },
      Buffer.from("{}"),
    );

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(String(client.query.mock.calls[1]![0])).toContain(
      "INSERT INTO stripe_webhook_events",
    );
    expect(String(client.query.mock.calls[2]![0])).toContain(
      "INSERT INTO subscriptions",
    );
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
  });

  it("skips subscription writes on duplicate Stripe events", async () => {
    const client = createClient(0);
    const pool = { connect: vi.fn().mockResolvedValue(client) };

    const result = await processStripeWebhook(
      pool as never,
      { id: "evt_1", type: "checkout.session.completed", data: {} },
      Buffer.from("{}"),
    );

    expect(result).toEqual({ ok: true, duplicate: true });
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
  });
});

describe("subscription_started PostHog capture (PR-09)", () => {
  beforeEach(() => {
    delete process.env["STRIPE_WEBHOOK_SECRET"];
  });

  afterEach(() => {
    __setPostHogCaptureForTesting(null);
  });

  function buildSubscriptionCreatedEvent() {
    return {
      id: "evt_sub_created_1",
      type: "customer.subscription.created" as const,
      data: {
        object: {
          id: "sub_test_1",
          status: "active",
          customer: "cus_1",
          cancel_at_period_end: false,
          current_period_end: 1_770_000_000,
          metadata: { user_id: "user_42", plan: "pro" },
          items: {
            data: [
              {
                price: {
                  unit_amount: 700,
                  currency: "usd",
                  recurring: { interval: "month" },
                },
              },
            ],
          },
        },
      },
    };
  }

  it("fires subscription_started with plan, $revenue, currency, source on customer.subscription.created", async () => {
    const client = createClient(1);
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const capture: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ outcome: "ok" });
    __setPostHogCaptureForTesting(
      capture as unknown as typeof capturePostHogEvent,
    );

    await processStripeWebhook(
      pool as never,
      buildSubscriptionCreatedEvent(),
      Buffer.from("{}"),
    );

    expect(capture).toHaveBeenCalledTimes(1);
    const callArg = capture.mock.calls[0]![0] as {
      event: string;
      distinctId: string;
      uuid: string;
      properties: Record<string, unknown>;
    };
    expect(callArg.event).toBe("subscription_started");
    expect(callArg.distinctId).toBe("user_42");
    expect(callArg.uuid).toBe("evt_sub_created_1");
    expect(callArg.properties["plan"]).toBe("pro");
    expect(callArg.properties["cadence"]).toBe("month");
    expect(callArg.properties["source"]).toBe("stripe_webhook");
    expect(callArg.properties["status"]).toBe("active");
    expect(callArg.properties["price_cents"]).toBe(700);
    expect(callArg.properties["currency"]).toBe("USD");
    expect(callArg.properties["$revenue"]).toBe(7);
    expect(callArg.properties["stripe_subscription_id"]).toBe("sub_test_1");
  });

  it("emits PostHog capture AFTER the DB COMMIT (analytics outside the transaction)", async () => {
    const client = createClient(1);
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const callOrder: string[] = [];
    client.query.mockImplementation(async (sql: string) => {
      callOrder.push(`query:${sql.split(" ")[0]}`);
      return { rowCount: 1, rows: [] };
    });
    const capture: ReturnType<typeof vi.fn> = vi.fn(async () => {
      callOrder.push("capture");
      return { outcome: "ok" as const };
    });
    __setPostHogCaptureForTesting(
      capture as unknown as typeof capturePostHogEvent,
    );

    await processStripeWebhook(
      pool as never,
      buildSubscriptionCreatedEvent(),
      Buffer.from("{}"),
    );

    expect(callOrder).toContain("capture");
    expect(callOrder.indexOf("capture")).toBeGreaterThan(
      callOrder.indexOf("query:COMMIT"),
    );
  });

  it("does NOT fire subscription_started on customer.subscription.updated", async () => {
    const client = createClient(1);
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const capture: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ outcome: "ok" });
    __setPostHogCaptureForTesting(
      capture as unknown as typeof capturePostHogEvent,
    );

    await processStripeWebhook(
      pool as never,
      {
        id: "evt_sub_updated_1",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_test_1",
            status: "active",
            metadata: { user_id: "user_42", plan: "pro" },
          },
        },
      },
      Buffer.from("{}"),
    );

    expect(capture).not.toHaveBeenCalled();
  });

  it("does NOT fire subscription_started on duplicate webhook (idempotent)", async () => {
    const client = createClient(0); // rowCount=0 → duplicate
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const capture: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ outcome: "ok" });
    __setPostHogCaptureForTesting(
      capture as unknown as typeof capturePostHogEvent,
    );

    await processStripeWebhook(
      pool as never,
      buildSubscriptionCreatedEvent(),
      Buffer.from("{}"),
    );

    expect(capture).not.toHaveBeenCalled();
  });

  it("does NOT fire subscription_started when user_id is missing from metadata", async () => {
    const client = createClient(1);
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const capture: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue({ outcome: "ok" });
    __setPostHogCaptureForTesting(
      capture as unknown as typeof capturePostHogEvent,
    );

    await processStripeWebhook(
      pool as never,
      {
        id: "evt_sub_created_no_user",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_test_2",
            status: "active",
            metadata: { plan: "pro" }, // no user_id
          },
        },
      },
      Buffer.from("{}"),
    );

    expect(capture).not.toHaveBeenCalled();
  });

  it("does NOT throw or rollback when PostHog capture itself throws (analytics is best-effort)", async () => {
    const client = createClient(1);
    const pool = { connect: vi.fn().mockResolvedValue(client) };
    const capture: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockRejectedValue(new Error("posthog network down"));
    __setPostHogCaptureForTesting(
      capture as unknown as typeof capturePostHogEvent,
    );

    const result = await processStripeWebhook(
      pool as never,
      buildSubscriptionCreatedEvent(),
      Buffer.from("{}"),
    );

    expect(result).toEqual({ ok: true, duplicate: false });
    expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
