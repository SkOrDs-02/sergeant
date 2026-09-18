import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { waitlistEntries } from "../pg/waitlistEntries.js";

/**
 * SQL snapshot test: verifies that the Drizzle schema for `waitlist_entries`
 * matches the shape defined in migration 009_waitlist.sql.
 *
 * This is a structural test — it checks column names, types, nullability,
 * defaults, and indexes rather than generating raw DDL (which varies across
 * Drizzle versions). The goal is to catch drift between the Drizzle schema
 * and the existing migration.
 */
describe("pg/waitlistEntries schema snapshot", () => {
  const config = getTableConfig(waitlistEntries);

  it("should have the correct table name", () => {
    expect(config.name).toBe("waitlist_entries");
  });

  it("should define all expected columns", () => {
    const columnNames = config.columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "email",
      "tier_interest",
      "source",
      "locale",
      "user_id",
      "user_agent",
      "created_at",
      "notified_at",
    ]);
  });

  it("should have correct column types matching migration 009", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    // id BIGSERIAL PRIMARY KEY (mode: "number" maps dataType to "number")
    expect(columnMap["id"]!.dataType).toBe("number");
    expect(columnMap["id"]!.primary).toBe(true);
    expect(columnMap["id"]!.notNull).toBe(true);

    // email TEXT NOT NULL
    expect(columnMap["email"]!.dataType).toBe("string");
    expect(columnMap["email"]!.notNull).toBe(true);

    // tier_interest TEXT NOT NULL CHECK (...)
    expect(columnMap["tier_interest"]!.dataType).toBe("string");
    expect(columnMap["tier_interest"]!.notNull).toBe(true);
    expect(columnMap["tier_interest"]!.enumValues).toEqual([
      "free",
      "plus",
      "pro",
      "unsure",
    ]);

    // source TEXT NOT NULL DEFAULT 'pricing_page'
    expect(columnMap["source"]!.dataType).toBe("string");
    expect(columnMap["source"]!.notNull).toBe(true);
    expect(columnMap["source"]!.hasDefault).toBe(true);

    // locale TEXT (nullable)
    expect(columnMap["locale"]!.dataType).toBe("string");
    expect(columnMap["locale"]!.notNull).toBe(false);

    // user_id TEXT (nullable, FK to "user" in migration)
    expect(columnMap["user_id"]!.dataType).toBe("string");
    expect(columnMap["user_id"]!.notNull).toBe(false);

    // user_agent TEXT (nullable)
    expect(columnMap["user_agent"]!.dataType).toBe("string");
    expect(columnMap["user_agent"]!.notNull).toBe(false);

    // created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    expect(columnMap["created_at"]!.dataType).toBe("date");
    expect(columnMap["created_at"]!.notNull).toBe(true);
    expect(columnMap["created_at"]!.hasDefault).toBe(true);

    // notified_at TIMESTAMPTZ (nullable)
    expect(columnMap["notified_at"]!.dataType).toBe("date");
    expect(columnMap["notified_at"]!.notNull).toBe(false);
  });

  it("should define expected indexes", () => {
    const indexNames = config.indexes.map((i) => i.config.name);
    expect(indexNames).toContain("waitlist_entries_email_uniq");
    expect(indexNames).toContain("waitlist_entries_created_at_idx");
    expect(indexNames).toContain("waitlist_entries_tier_idx");
  });

  it("should have a unique index on email", () => {
    const emailIdx = config.indexes.find(
      (i) => i.config.name === "waitlist_entries_email_uniq",
    );
    expect(emailIdx).toBeDefined();
    expect(emailIdx!.config.unique).toBe(true);
  });
});
