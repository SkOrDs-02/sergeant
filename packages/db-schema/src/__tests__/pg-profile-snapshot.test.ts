import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { userProfile } from "../pg/profile.js";

/**
 * SQL snapshot test: verifies that the Drizzle schema for `user_profile`
 * matches the shape defined in migration 115_user_profile.sql.
 *
 * Pre-beta schema-debt audit 2026-08-04 — minimal write-through store for
 * the profile blob historically kept client-only (see the docstring in
 * `pg/profile.ts` for the full rationale).
 */
describe("pg/userProfile schema snapshot", () => {
  const config = getTableConfig(userProfile);

  it("has the canonical table name", () => {
    expect(config.name).toBe("user_profile");
  });

  it("declares all expected columns", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "payload",
      "updated_at",
    ]);
  });

  it("keys on user_id, defaults payload to {} JSONB, and defaults updated_at to NOW()", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );

    expect(columnMap["user_id"]!.columnType).toBe("PgText");
    expect(columnMap["user_id"]!.primary).toBe(true);

    expect(columnMap["payload"]!.columnType).toBe("PgJsonb");
    expect(columnMap["payload"]!.notNull).toBe(true);
    expect(columnMap["payload"]!.hasDefault).toBe(true);

    expect(columnMap["updated_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["updated_at"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });

  it("has no secondary indexes (PK lookup by user_id is the only access path)", () => {
    expect(config.indexes).toHaveLength(0);
  });
});
