import { describe, expect, it } from "vitest";
import { extractSqlTables } from "./tools-db-query.js";

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
