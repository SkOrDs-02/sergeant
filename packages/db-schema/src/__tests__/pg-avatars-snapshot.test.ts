import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { userAvatars } from "../pg/profile.js";

/**
 * SQL snapshot test: Drizzle-схема `user_avatars` збігається з міграцією
 * 161_user_avatars.sql (аудит 2026-10-01, ux-14: аватар у Postgres/bytea).
 */
describe("pg/userAvatars schema snapshot", () => {
  const config = getTableConfig(userAvatars);

  it("has the canonical table name", () => {
    expect(config.name).toBe("user_avatars");
  });

  it("declares all expected columns", () => {
    expect(config.columns.map((c) => c.name)).toEqual([
      "user_id",
      "content_type",
      "data",
      "updated_at",
    ]);
  });

  it("keys on user_id, stores bytea data, defaults updated_at to NOW()", () => {
    const columnMap = Object.fromEntries(
      config.columns.map((c) => [c.name, c]),
    );
    expect(columnMap["user_id"]!.columnType).toBe("PgText");
    expect(columnMap["user_id"]!.primary).toBe(true);
    expect(columnMap["content_type"]!.notNull).toBe(true);
    expect(columnMap["data"]!.getSQLType()).toBe("bytea");
    expect(columnMap["data"]!.notNull).toBe(true);
    expect(columnMap["updated_at"]!.columnType).toBe("PgTimestamp");
    expect(columnMap["updated_at"]!.hasDefault).toBe(true);
  });

  it("has no secondary indexes (PK lookup by user_id is the only access path)", () => {
    expect(config.indexes).toHaveLength(0);
  });
});
