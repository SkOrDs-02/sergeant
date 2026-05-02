import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  extractSqlTables,
  OpenClawAllowlistError,
  queryAppDb,
  readStrategyDoc,
} from "./tools.js";

describe("extractSqlTables", () => {
  it("captures simple FROM tables", () => {
    expect(extractSqlTables("SELECT * FROM subscriptions")).toEqual([
      "subscriptions",
    ]);
  });

  it("captures multiple FROM/JOIN tables", () => {
    expect(
      extractSqlTables(
        "SELECT u.id FROM users u JOIN payments p ON u.id = p.user_id",
      ).sort(),
    ).toEqual(["payments", "users"]);
  });

  it("ignores tables inside string literals", () => {
    expect(
      extractSqlTables("SELECT 'FROM auth_secret' FROM subscriptions"),
    ).toEqual(["subscriptions"]);
  });

  it("ignores tables inside line comments", () => {
    expect(
      extractSqlTables("-- FROM auth_secret\nSELECT * FROM subscriptions"),
    ).toEqual(["subscriptions"]);
  });

  it("handles ONLY keyword", () => {
    expect(extractSqlTables("SELECT * FROM ONLY subscriptions")).toEqual([
      "subscriptions",
    ]);
  });

  it("is case-insensitive", () => {
    expect(extractSqlTables("select * from Subscriptions")).toEqual([
      "subscriptions",
    ]);
  });
});

/**
 * Minimal fake `Pool` for queryAppDb security tests. Returns empty rows for
 * any query so we focus on allowlist checks, not query execution itself.
 */
function makeFakePool(): { pool: Pool; calls: string[] } {
  const calls: string[] = [];
  const pool = {
    async query(text: string) {
      calls.push(text);
      return { rows: [], rowCount: 0 };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, calls };
}

describe("queryAppDb security boundaries", () => {
  it("rejects INSERT", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "INSERT INTO users VALUES (1)" }),
    ).rejects.toThrow(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });

  it("rejects UPDATE", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "UPDATE users SET id = 1" }),
    ).rejects.toThrow(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });

  it("rejects DELETE", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "DELETE FROM users" }),
    ).rejects.toThrow(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });

  it("rejects DROP", async () => {
    const { pool, calls } = makeFakePool();
    await expect(queryAppDb(pool, { sql: "DROP TABLE users" })).rejects.toThrow(
      OpenClawAllowlistError,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects forbidden tables (auth_*)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM auth_secret" }),
    ).rejects.toThrow(/auth_secret/);
    expect(calls).toHaveLength(0);
  });

  it("rejects forbidden tables (ai_memories)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM ai_memories" }),
    ).rejects.toThrow(/ai_memories/);
    expect(calls).toHaveLength(0);
  });

  it("rejects forbidden tables (ai_usage_daily)", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM ai_usage_daily" }),
    ).rejects.toThrow(/ai_usage_daily/);
    expect(calls).toHaveLength(0);
  });

  it("rejects mixed query if any table is forbidden", async () => {
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, {
        sql: "SELECT * FROM users JOIN sync_audit_log USING (id)",
      }),
    ).rejects.toThrow(/sync_audit_log/);
    expect(calls).toHaveLength(0);
  });

  it("admits an allowlisted SELECT", async () => {
    const { pool, calls } = makeFakePool();
    const result = await queryAppDb(pool, {
      sql: "SELECT id FROM subscriptions",
    });
    expect(result.tablesUsed).toEqual(["subscriptions"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("FROM (SELECT id FROM subscriptions)");
    expect(calls[0]).toContain("LIMIT 200");
  });

  it("admits a multi-table allowlisted JOIN", async () => {
    const { pool, calls } = makeFakePool();
    const result = await queryAppDb(pool, {
      sql: "SELECT u.id FROM users u JOIN payments p ON u.id = p.user_id",
    });
    expect(result.tablesUsed.sort()).toEqual(["payments", "users"]);
    expect(calls).toHaveLength(1);
  });

  it("clamps LIMIT to <=1000", async () => {
    const { pool, calls } = makeFakePool();
    await queryAppDb(pool, {
      sql: "SELECT id FROM subscriptions",
      limit: 1_000_000,
    });
    expect(calls[0]).toContain("LIMIT 1000");
  });

  it("uses default LIMIT=200 when unspecified", async () => {
    const { pool, calls } = makeFakePool();
    await queryAppDb(pool, { sql: "SELECT id FROM subscriptions" });
    expect(calls[0]).toContain("LIMIT 200");
  });

  it("rejects WITH (CTE) queries (Phase 1 — CTE alias detected as table)", async () => {
    // У Phase 1 наш `extractSqlTables` навмисно простий: CTE-аліас типу
    // `WITH x AS (...)` теж потрапляє у tables-set, не проходить allowlist.
    // Це fail-closed behaviour: краще rejected-ний CTE, ніж шанс на bypass
    // через `WITH x AS (SELECT * FROM auth_secret) SELECT * FROM x`.
    const { pool, calls } = makeFakePool();
    await expect(
      queryAppDb(pool, {
        sql: "WITH x AS (SELECT id FROM subscriptions) SELECT * FROM x",
      }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
    expect(calls).toHaveLength(0);
  });
});

describe("readStrategyDoc security boundaries", () => {
  it("rejects path traversal attempts", async () => {
    await expect(
      readStrategyDoc({ path: "../../etc/passwd" }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
  });

  it("rejects paths outside the allowlist", async () => {
    await expect(
      readStrategyDoc({ path: "apps/server/src/env.ts" }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
  });

  it("rejects raw filesystem paths", async () => {
    await expect(
      readStrategyDoc({ path: "/etc/passwd" }),
    ).rejects.toBeInstanceOf(OpenClawAllowlistError);
  });
});

// Sanity-check that `vi` is used (avoid linter-warning if unused above).
void vi;
