import { beforeEach, describe, expect, it, vi } from "vitest";
import { processStripeWebhook } from "./stripe.js";

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
      "INSERT INTO webhook_events",
    );
    expect(String(client.query.mock.calls[2]![0])).toContain(
      "INSERT INTO billing_subscriptions",
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
