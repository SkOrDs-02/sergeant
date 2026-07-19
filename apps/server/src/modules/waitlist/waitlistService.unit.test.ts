// Unit-level coverage for waitlistService.ts using a mocked `pg.Pool` /
// Drizzle db instead of the Testcontainers harness in waitlistService.test.ts.
//
// The Testcontainers integration test soft-skips in sandboxes without a
// working Docker runtime strategy (see waitlistService.test.ts), which
// leaves this module at 0% coverage there. These mock-based tests exercise
// the exact SQL/params contract and the bigint→number coercion (Hard Rule
// #1) without needing a real Postgres instance.

import { describe, it, expect, vi } from "vitest";
import type pg from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  countWaitlistByTier,
  countWaitlistByTierDrizzle,
  submitWaitlistEntry,
} from "./waitlistService.js";

describe("submitWaitlistEntry (mocked pool)", () => {
  it("returns created=true when INSERT … RETURNING id yields a row", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ id: "1" }] });
    const pool = { query } as unknown as pg.Pool;

    const result = await submitWaitlistEntry(pool, {
      email: "alice@example.com",
      tier_interest: "pro",
      source: "pricing_page",
      locale: "uk",
    });

    expect(result).toEqual({ created: true });
    expect(query).toHaveBeenCalledTimes(1);
    const [sqlText, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sqlText).toContain("INSERT INTO waitlist_entries");
    expect(sqlText).toContain("ON CONFLICT (LOWER(email)) DO NOTHING");
    expect(params).toEqual([
      "alice@example.com",
      "pro",
      "pricing_page",
      "uk",
      null,
      null,
    ]);
  });

  it("returns created=false when ON CONFLICT DO NOTHING drops the row", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const pool = { query } as unknown as pg.Pool;

    const result = await submitWaitlistEntry(pool, {
      email: "bob@example.com",
      tier_interest: "plus",
      source: "paywall",
    });

    expect(result).toEqual({ created: false });
  });

  it("defaults optional locale/user_id/user_agent to null", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ id: "2" }] });
    const pool = { query } as unknown as pg.Pool;

    await submitWaitlistEntry(pool, {
      email: "carol@example.com",
      tier_interest: "free",
      source: "onboarding",
    });

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([
      "carol@example.com",
      "free",
      "onboarding",
      null,
      null,
      null,
    ]);
  });

  it("passes through explicit user_id and user_agent", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 1, rows: [{ id: "3" }] });
    const pool = { query } as unknown as pg.Pool;

    await submitWaitlistEntry(pool, {
      email: "dave@example.com",
      tier_interest: "pro",
      source: "pricing_page",
      user_id: "user_123",
      user_agent: "Mozilla/5.0",
    });

    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([
      "dave@example.com",
      "pro",
      "pricing_page",
      null,
      "user_123",
      "Mozilla/5.0",
    ]);
  });
});

describe("countWaitlistByTier (mocked pool)", () => {
  it("coerces bigint COUNT(*) strings to number (Hard Rule #1)", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        { tier_interest: "plus", total: "1" },
        { tier_interest: "pro", total: "2" },
      ],
    });
    const pool = { query } as unknown as pg.Pool;

    const counts = await countWaitlistByTier(pool);

    expect(counts).toEqual([
      { tier_interest: "plus", total: 1 },
      { tier_interest: "pro", total: 2 },
    ]);
    for (const row of counts) {
      expect(typeof row.total).toBe("number");
    }
    const [sqlText] = query.mock.calls[0] as [string];
    expect(sqlText).toContain("GROUP BY tier_interest");
  });

  it("returns an empty array when there are no entries", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as pg.Pool;

    const counts = await countWaitlistByTier(pool);

    expect(counts).toEqual([]);
  });
});

describe("countWaitlistByTierDrizzle (mocked drizzle db)", () => {
  function buildDrizzleMock(
    rows: Array<{ tier_interest: string; total: unknown }>,
  ) {
    const orderBy = vi.fn().mockResolvedValue(rows);
    const groupBy = vi.fn().mockReturnValue({ orderBy });
    const from = vi.fn().mockReturnValue({ groupBy });
    const select = vi.fn().mockReturnValue({ from });
    const drizzleDb = { select } as unknown as NodePgDatabase;
    return { drizzleDb, select, from, groupBy, orderBy };
  }

  it("chains select/from/groupBy/orderBy and coerces totals to number", async () => {
    const { drizzleDb, select, from, groupBy, orderBy } = buildDrizzleMock([
      { tier_interest: "plus", total: 1 },
      { tier_interest: "pro", total: 2 },
    ]);

    const counts = await countWaitlistByTierDrizzle(drizzleDb);

    expect(counts).toEqual([
      { tier_interest: "plus", total: 1 },
      { tier_interest: "pro", total: 2 },
    ]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
  });

  it("coerces a string total (raw driver bigint) to number", async () => {
    const { drizzleDb } = buildDrizzleMock([
      { tier_interest: "free", total: "7" as unknown },
    ]);

    const counts = await countWaitlistByTierDrizzle(drizzleDb);

    expect(counts).toEqual([{ tier_interest: "free", total: 7 }]);
    expect(typeof counts[0]?.total).toBe("number");
  });
});
