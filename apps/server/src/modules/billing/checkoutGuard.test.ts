import { describe, expect, it, vi } from "vitest";
import {
  ALREADY_SUBSCRIBED_CODE,
  CHECKOUT_PENDING_CODE,
  assertCheckoutAllowed,
} from "./checkoutGuard.js";

/** Пул, що віддає canned-рядки за підрядком SQL (entitlement / pending). */
function poolWith(opts: { entitled?: boolean; pending?: boolean }) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes("FROM subscriptions")) {
      return { rows: opts.entitled ? [{ "?column?": 1 }] : [] };
    }
    if (sql.includes("FROM plata_subscription")) {
      return { rows: opts.pending ? [{ "?column?": 1 }] : [] };
    }
    return { rows: [] };
  });
  return { pool: { query } as never, query };
}

describe("assertCheckoutAllowed", () => {
  it("пропускає, коли ні ентайтлменту, ні живого checkout-у", async () => {
    const { pool } = poolWith({});
    await expect(assertCheckoutAllowed(pool, "u1")).resolves.toBeUndefined();
  });

  it("409 ALREADY_SUBSCRIBED при діючому платному ентайтлменті", async () => {
    const { pool, query } = poolWith({ entitled: true });
    await expect(assertCheckoutAllowed(pool, "u1")).rejects.toMatchObject({
      status: 409,
      code: ALREADY_SUBSCRIBED_CODE,
    });
    // Далі до pending-запиту не йдемо.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("409 CHECKOUT_PENDING при непідтвердженому checkout-і", async () => {
    const { pool } = poolWith({ pending: true });
    await expect(assertCheckoutAllowed(pool, "u1")).rejects.toMatchObject({
      status: 409,
      code: CHECKOUT_PENDING_CODE,
    });
  });

  it("ALREADY_SUBSCRIBED має пріоритет над CHECKOUT_PENDING", async () => {
    const { pool } = poolWith({ entitled: true, pending: true });
    await expect(assertCheckoutAllowed(pool, "u1")).rejects.toMatchObject({
      code: ALREADY_SUBSCRIBED_CODE,
    });
  });

  it("entitlement-запит виключає manual (reverse trial) і враховує період та grace", async () => {
    const { pool, query } = poolWith({});
    await assertCheckoutAllowed(pool, "u1");
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("provider <> 'manual'");
    expect(sql).toContain("current_period_end > NOW()");
    expect(sql).toContain("grace_period_ends_at");
  });

  it("pending-запит дивиться лише на непідтверджені й незамінені checkout-и в межах validity", async () => {
    const { pool, query } = poolWith({});
    await assertCheckoutAllowed(pool, "u1");
    const [sql, params] = query.mock.calls[1] ?? [];
    expect(String(sql)).toContain("confirmed_at IS NULL");
    expect(String(sql)).toContain("superseded_at IS NULL");
    expect(params).toEqual(["u1", 3600]);
  });
});
