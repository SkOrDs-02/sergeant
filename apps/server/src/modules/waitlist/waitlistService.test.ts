// Phase 0 monetization rails: integration tests for `submitWaitlistEntry`.
//
// Uses the shared Testcontainers harness (`apps/server/src/test/pg-container.ts`)
// so the same `009_waitlist.sql` migration that ships to production runs
// against a real Postgres-16 instance. Mocks would not catch the
// `LOWER(email)` unique-index behaviour or the `ON CONFLICT DO NOTHING`
// idempotency we rely on.
//
// On dev machines without Docker the test soft-skips (mirrors the
// rollback-sanity pattern in `apps/server/src/migrations/__tests__/`).

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type pg from "pg";
import {
  startPgContainer,
  stopPgContainer,
  truncateAll,
} from "../../test/pg-container.js";
import { countWaitlistByTier, submitWaitlistEntry } from "./waitlistService.js";

// Container boot + migrations runs ~15–30s on Linux CI runners; lift the
// hook ceiling so a slow Docker pull does not flake.
const HOOK_TIMEOUT_MS = 180_000;

describe("waitlistService (Phase 0 monetization)", () => {
  let pool: pg.Pool | undefined;
  let dockerAvailable = false;

  beforeAll(async () => {
    try {
      pool = await startPgContainer();
      dockerAvailable = true;
    } catch (err) {
      // No Docker locally — soft-skip. CI runners always have Docker.
      console.warn(
        "[waitlistService.test] Docker unavailable — skipping integration tests:",
        err instanceof Error ? err.message : err,
      );
    }
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    if (dockerAvailable) {
      await stopPgContainer();
    }
  }, HOOK_TIMEOUT_MS);

  it("inserts a new entry and returns created=true", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    const result = await submitWaitlistEntry(pool, {
      email: "alice@example.com",
      tier_interest: "pro",
      source: "pricing_page",
      locale: "uk",
    });

    expect(result).toEqual({ created: true });

    const rows = await pool.query<{
      email: string;
      tier_interest: string;
      source: string;
      locale: string | null;
    }>(`SELECT email, tier_interest, source, locale FROM waitlist_entries`);
    expect(rows.rows).toEqual([
      {
        email: "alice@example.com",
        tier_interest: "pro",
        source: "pricing_page",
        locale: "uk",
      },
    ]);
  });

  it("returns created=false on duplicate email (idempotent submit)", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    await submitWaitlistEntry(pool, {
      email: "bob@example.com",
      tier_interest: "plus",
      source: "pricing_page",
    });
    const second = await submitWaitlistEntry(pool, {
      email: "bob@example.com",
      tier_interest: "pro",
      source: "paywall",
    });

    expect(second).toEqual({ created: false });

    // Conflict shouldn't overwrite the first entry's tier_interest/source.
    const rows = await pool.query<{
      email: string;
      tier_interest: string;
      source: string;
    }>(`SELECT email, tier_interest, source FROM waitlist_entries`);
    expect(rows.rows).toEqual([
      {
        email: "bob@example.com",
        tier_interest: "plus",
        source: "pricing_page",
      },
    ]);
  });

  it("treats email case-insensitively via LOWER(email) unique index", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    // Bypass schema normalization to prove the DB-level guard works.
    await submitWaitlistEntry(pool, {
      email: "carol@example.com",
      tier_interest: "free",
      source: "pricing_page",
    });
    const second = await submitWaitlistEntry(pool, {
      email: "CAROL@EXAMPLE.COM",
      tier_interest: "pro",
      source: "pricing_page",
    });

    expect(second).toEqual({ created: false });

    const rows = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM waitlist_entries`,
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });

  it("aggregates counts by tier for admin reporting", async () => {
    if (!dockerAvailable || !pool) return;
    await truncateAll();

    await submitWaitlistEntry(pool, {
      email: "a@example.com",
      tier_interest: "pro",
      source: "pricing_page",
    });
    await submitWaitlistEntry(pool, {
      email: "b@example.com",
      tier_interest: "pro",
      source: "pricing_page",
    });
    await submitWaitlistEntry(pool, {
      email: "c@example.com",
      tier_interest: "plus",
      source: "pricing_page",
    });

    const counts = await countWaitlistByTier(pool);
    expect(counts).toEqual([
      { tier_interest: "plus", total: 1 },
      { tier_interest: "pro", total: 2 },
    ]);
    // AGENTS rule #1: counts are coerced to `number`, never bigint string.
    for (const row of counts) {
      expect(typeof row.total).toBe("number");
    }
  });
});
