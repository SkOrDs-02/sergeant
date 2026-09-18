// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

import { __resetSqliteDbForTests, getSqliteDb } from "../sqlite";
import { waitlistEntries } from "@sergeant/db-schema/sqlite";

/**
 * End-to-end smoke for PR #015 acceptance criterion:
 *
 *   "Vitest: write/read/migrate працює у JSDOM-mock + у Playwright e2e
 *    у реальному Chromium."
 *
 * We run the JSDOM-mock half here against a real `:memory:` SQLite DB
 * driven by the real `@sqlite.org/sqlite-wasm` package — the only
 * persistence path that's actually available under Node/jsdom. The
 * Playwright e2e half against a real Chromium is tracked separately,
 * see `apps/web/playwright.smoke.config.ts`.
 *
 * The test exercises the complete loop a feature consumer cares about:
 *
 * 1. **Migrate** — apply the SQLite-flavoured DDL from
 *    `@sergeant/db-schema/sqlite` for `waitlistEntries` so the schema
 *    matches what the canonical Drizzle types expect.
 * 2. **Write** — `INSERT` a row through the typed `drizzle.insert(...)`
 *    builder so we exercise the proxy callback's `run` mode.
 * 3. **Read** — `SELECT` the row back via `drizzle.select().from(...)`
 *    so we exercise the proxy callback's `all` / `values` mode.
 */

// Force the in-memory branch of `openDb()` regardless of the host
// environment: jsdom does not implement OPFS, but its `localStorage`
// shim happens to be writable, so without this we'd hit kvvfs which
// only handles a single canonical sqlite db per origin.
vi.stubGlobal("crossOriginIsolated", true);

describe("sqlite — write/read/migrate round-trip (in-memory)", () => {
  beforeEach(() => {
    __resetSqliteDbForTests();
    // Hide the persistent VFSes so `openDb()` falls through to memory.
    Object.defineProperty(globalThis.navigator, "storage", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "FileSystemFileHandle", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    __resetSqliteDbForTests();
    vi.restoreAllMocks();
  });

  it("migrates the waitlist schema, writes a row, and reads it back", async () => {
    const handle = await getSqliteDb();
    expect(handle.vfs).toBe("memory");

    // 1) Migrate — apply the canonical SQLite DDL for `waitlist_entries`.
    //    A real migration runner is PR #019 (see roadmap); for the
    //    smoke we run the equivalent DDL directly so the schema lines
    //    up with the typed Drizzle table.
    await handle.drizzle.run(sql`
      CREATE TABLE waitlist_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        tier_interest TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'web',
        locale TEXT,
        user_id TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        notified_at TEXT
      )
    `);
    await handle.drizzle.run(
      sql`CREATE UNIQUE INDEX waitlist_entries_email_uniq_lite ON waitlist_entries(email)`,
    );

    // 2) Write — exercises the proxy callback's `run` mode via Drizzle's
    //    typed insert builder so the column types are checked at compile
    //    time against `@sergeant/db-schema/sqlite`.
    await handle.drizzle.insert(waitlistEntries).values({
      email: "test@example.com",
      tierInterest: "plus",
      source: "playwright-e2e",
      locale: "uk",
    });

    // 3) Read — exercises the proxy callback's `all` mode and confirms
    //    drizzle reconstitutes the row back into the schema-typed
    //    object shape.
    const rows = await handle.drizzle
      .select({
        email: waitlistEntries.email,
        tier: waitlistEntries.tierInterest,
        source: waitlistEntries.source,
        locale: waitlistEntries.locale,
      })
      .from(waitlistEntries);

    expect(rows).toEqual([
      {
        email: "test@example.com",
        tier: "plus",
        source: "playwright-e2e",
        locale: "uk",
      },
    ]);

    await handle.close();
  });
});
