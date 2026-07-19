import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { extractSqlTables, queryAppDb } from "./tools-db-query.js";
import { OpenClawAllowlistError, OpenClawSchemaError } from "./tools-errors.js";

describe("extractSqlTables — allowlist bypass hardening", () => {
  it("captures a bare table", () => {
    expect(extractSqlTables("SELECT * FROM openclaw_decisions")).toEqual([
      "openclaw_decisions",
    ]);
  });

  it("captures schema-qualified tables (was bypassable)", () => {
    // public.<t> normalises to the bare name so the allowlist still applies…
    expect(extractSqlTables("SELECT * FROM public.session")).toEqual([
      "session",
    ]);
    // …while a non-public schema stays qualified so it can never match.
    expect(extractSqlTables("SELECT * FROM pg_catalog.pg_authid")).toEqual([
      "pg_catalog.pg_authid",
    ]);
  });

  it("captures double-quoted reserved-word tables (was bypassable)", () => {
    expect(extractSqlTables('SELECT * FROM "user"')).toEqual(["user"]);
  });

  it("captures comma-joined tables (was bypassable)", () => {
    expect(
      extractSqlTables("SELECT * FROM openclaw_decisions, session").sort(),
    ).toEqual(["openclaw_decisions", "session"]);
  });

  it("captures tables inside a subquery", () => {
    expect(
      extractSqlTables("SELECT * FROM (SELECT * FROM pg_authid) z"),
    ).toEqual(["pg_authid"]);
  });

  it("ignores table aliases", () => {
    expect(
      extractSqlTables("SELECT * FROM openclaw_decisions od WHERE od.id > 5"),
    ).toEqual(["openclaw_decisions"]);
  });

  it("excludes CTE aliases (real table only)", () => {
    expect(
      extractSqlTables(
        "WITH x AS (SELECT * FROM openclaw_decisions) SELECT * FROM x",
      ),
    ).toEqual(["openclaw_decisions"]);
  });

  it("fails closed on unparseable SQL", () => {
    expect(() => extractSqlTables("SELECT * FROM")).toThrow(
      /could not be parsed/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// queryAppDb — transaction lifecycle + error mapping
// ─────────────────────────────────────────────────────────────────────────

interface FakeClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function makeTxPool(
  dataQueryHandler: () => {
    rows: Record<string, unknown>[];
    rowCount: number | null;
  },
  options: {
    onDataQueryError?: unknown;
    onRollbackError?: unknown;
  } = {},
): { pool: Pool; client: FakeClient; calls: string[] } {
  const calls: string[] = [];
  const client: FakeClient = {
    query: vi.fn(async (text: string) => {
      calls.push(text);
      if (text === "ROLLBACK") {
        if (options.onRollbackError) throw options.onRollbackError;
        return { rows: [], rowCount: 0 };
      }
      if (text === "BEGIN READ ONLY" || text === "COMMIT") {
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith("SET LOCAL")) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes("__openclaw_q")) {
        if (options.onDataQueryError) throw options.onDataQueryError;
        return dataQueryHandler();
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, client, calls };
}

describe("queryAppDb: transaction lifecycle + error mapping", () => {
  it("happy-path: wraps in READ ONLY tx, commits, returns rows + tablesUsed", async () => {
    const { pool, client, calls } = makeTxPool(() => ({
      rows: [{ id: 1 }],
      rowCount: 1,
    }));
    const out = await queryAppDb(pool, {
      sql: "SELECT * FROM openclaw_decisions",
    });
    expect(out.rows).toEqual([{ id: 1 }]);
    expect(out.rowCount).toBe(1);
    expect(out.tablesUsed).toEqual(["openclaw_decisions"]);
    expect(calls).toEqual([
      "BEGIN READ ONLY",
      expect.stringContaining("SET LOCAL statement_timeout"),
      expect.stringContaining("__openclaw_q"),
      "COMMIT",
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("falls back to rows.length when rowCount is null", async () => {
    const { pool } = makeTxPool(() => ({
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: null,
    }));
    const out = await queryAppDb(pool, {
      sql: "SELECT * FROM openclaw_decisions",
    });
    expect(out.rowCount).toBe(2);
  });

  it("maps SQLSTATE 25006 (read-only violation) to OpenClawAllowlistError and rolls back", async () => {
    const { pool, client } = makeTxPool(() => ({ rows: [], rowCount: 0 }), {
      onDataQueryError: Object.assign(new Error("cannot execute in RO tx"), {
        code: "25006",
      }),
    });
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM openclaw_decisions" }),
    ).rejects.toThrow(OpenClawAllowlistError);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("maps SQLSTATE 42xxx (schema error) to OpenClawSchemaError with the underlying message", async () => {
    const { pool, client } = makeTxPool(() => ({ rows: [], rowCount: 0 }), {
      onDataQueryError: Object.assign(
        new Error('column "nope" does not exist'),
        { code: "42703" },
      ),
    });
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM openclaw_decisions" }),
    ).rejects.toThrow(OpenClawSchemaError);
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM openclaw_decisions" }),
    ).rejects.toThrow(/column "nope" does not exist/);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it("rethrows an unrecognised DB error unchanged (not wrapped)", async () => {
    const { pool, client } = makeTxPool(() => ({ rows: [], rowCount: 0 }), {
      onDataQueryError: new Error("connection reset by peer"),
    });
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM openclaw_decisions" }),
    ).rejects.toThrow(/connection reset by peer/);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("swallows a ROLLBACK failure (connection already dead) and still surfaces the original error", async () => {
    const { pool, client } = makeTxPool(() => ({ rows: [], rowCount: 0 }), {
      onDataQueryError: new Error("original failure"),
      onRollbackError: new Error("connection terminated"),
    });
    await expect(
      queryAppDb(pool, { sql: "SELECT * FROM openclaw_decisions" }),
    ).rejects.toThrow(/original failure/);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("forwards caller-supplied bind params to the wrapped query", async () => {
    const { pool, client } = makeTxPool(() => ({ rows: [], rowCount: 0 }));
    await queryAppDb(pool, {
      sql: "SELECT * FROM openclaw_decisions WHERE topic = $1",
      params: ["pricing"],
    });
    const dataCall = client.query.mock.calls.find((c) =>
      (c[0] as string).includes("__openclaw_q"),
    );
    expect(dataCall?.[1]).toEqual(["pricing"]);
  });
});
