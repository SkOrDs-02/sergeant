import { describe, expect, it, vi } from "vitest";
import { enqueueGdprCleanup } from "./cleanupQueue.js";

/**
 * `gdpr_cleanup_queue` writer — ADR-0016 § ADR-6.3. Verifies four static
 * per-service INSERTs (M11 — no dynamically-built multi-row VALUES, mirrors
 * `anthropicUsageStore.ts`) and the no-op guards.
 */

function mockDb() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) };
}

describe("enqueueGdprCleanup", () => {
  it("inserts 4 rows (stripe/sentry/posthog/resend), each with the same user/email/stripeCustomerId", async () => {
    const db = mockDb();
    await enqueueGdprCleanup(db, {
      userId: "user-1",
      email: "user1@example.com",
      stripeCustomerId: "cus_abc",
    });

    expect(db.query).toHaveBeenCalledTimes(4);
    const calledServices = db.query.mock.calls.map(
      (call) => (call[1] as unknown[])[3],
    );
    expect([...calledServices].sort()).toEqual([
      "posthog",
      "resend",
      "sentry",
      "stripe",
    ]);
    for (const call of db.query.mock.calls) {
      const [sql, values] = call;
      expect(String(sql)).toMatch(/INSERT INTO gdpr_cleanup_queue/);
      expect(values).toEqual([
        "user-1",
        "user1@example.com",
        "cus_abc",
        expect.any(String),
      ]);
    }
  });

  it("writes NULL stripe_customer_id when the user never had a Stripe subscription", async () => {
    const db = mockDb();
    await enqueueGdprCleanup(db, { userId: "user-2", email: "u2@example.com" });
    for (const call of db.query.mock.calls) {
      const values = call[1] as unknown[];
      expect(values[2]).toBeNull();
    }
  });

  it("no-ops when userId is empty (nothing to snapshot)", async () => {
    const db = mockDb();
    await enqueueGdprCleanup(db, { userId: "", email: "u@example.com" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("no-ops when email is empty", async () => {
    const db = mockDb();
    await enqueueGdprCleanup(db, { userId: "user-3", email: "" });
    expect(db.query).not.toHaveBeenCalled();
  });
});
