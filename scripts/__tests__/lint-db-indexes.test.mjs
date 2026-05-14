// scripts/__tests__/lint-db-indexes.test.mjs
//
// Unit tests for the heuristic DB index linter — see
// `scripts/lint-db-indexes.mjs`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  stripSqlComments,
  parseCreateTableBlocks,
  splitTopLevelCommas,
  parseColumnsAndConstraints,
  extractConstraintColumns,
  findIndexLeadingColumns,
  isColumnCovered,
  analyzeMigration,
} from "../lint-db-indexes.mjs";

describe("stripSqlComments", () => {
  it("removes -- line comments", () => {
    const out = stripSqlComments("SELECT 1; -- trailing");
    assert.equal(out.trim(), "SELECT 1;");
  });

  it("removes /* block */ comments", () => {
    const out = stripSqlComments("SELECT /* hidden */ 1;");
    assert.equal(out.replace(/\s+/g, " ").trim(), "SELECT 1;");
  });

  it("collapses whitespace", () => {
    const out = stripSqlComments("SELECT  \n\t1;");
    assert.equal(out.trim(), "SELECT 1;");
  });
});

describe("splitTopLevelCommas", () => {
  it("splits at top level commas only", () => {
    const out = splitTopLevelCommas(
      "a INT, b TEXT CHECK (b IN ('x','y')), c BIGINT",
    );
    assert.deepEqual(out, [
      "a INT",
      "b TEXT CHECK (b IN ('x','y'))",
      "c BIGINT",
    ]);
  });

  it("returns empty array for empty body", () => {
    assert.deepEqual(splitTopLevelCommas(""), []);
  });
});

describe("parseCreateTableBlocks", () => {
  it("extracts a single CREATE TABLE block with name and body", () => {
    const sql = `CREATE TABLE foo (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL
    );`;
    const blocks = parseCreateTableBlocks(sql);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].tableName, "foo");
    assert.ok(blocks[0].body.includes("user_id"));
  });

  it("handles IF NOT EXISTS and quoted names", () => {
    const sql = `CREATE TABLE IF NOT EXISTS "user" (id TEXT);`;
    const blocks = parseCreateTableBlocks(sql);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].tableName, "user");
  });

  it("handles multiple CREATE TABLE blocks in one file", () => {
    const sql = `CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);`;
    const blocks = parseCreateTableBlocks(sql);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].tableName, "a");
    assert.equal(blocks[1].tableName, "b");
  });

  it("handles nested parens inside column constraints", () => {
    const sql =
      "CREATE TABLE foo (id INT, status TEXT CHECK (status IN ('a', 'b')));";
    const blocks = parseCreateTableBlocks(sql);
    assert.equal(blocks.length, 1);
    assert.ok(blocks[0].body.includes("status"));
  });
});

describe("parseColumnsAndConstraints", () => {
  it("separates columns from table-level PRIMARY KEY constraint", () => {
    const body = "id INT, user_id TEXT, PRIMARY KEY (id, user_id)";
    const { columns, constraints } = parseColumnsAndConstraints(body);
    assert.equal(columns.length, 2);
    assert.equal(columns[0].name, "id");
    assert.equal(columns[1].name, "user_id");
    assert.equal(constraints.length, 1);
    assert.ok(constraints[0].toLowerCase().includes("primary key"));
  });

  it("treats CONSTRAINT-named clauses as constraints", () => {
    const body = "id INT, CONSTRAINT pk_foo PRIMARY KEY (id)";
    const { columns, constraints } = parseColumnsAndConstraints(body);
    assert.equal(columns.length, 1);
    assert.equal(constraints.length, 1);
  });
});

describe("extractConstraintColumns", () => {
  it("captures the leading column of a composite PRIMARY KEY", () => {
    const out = extractConstraintColumns(["PRIMARY KEY (a, b, c)"]);
    assert.ok(out.primaryKeyLeading.has("a"));
    assert.ok(!out.primaryKeyLeading.has("b"));
  });

  it("captures the leading column of a UNIQUE constraint", () => {
    const out = extractConstraintColumns([
      "UNIQUE (workflow_id, error_signature)",
    ]);
    assert.ok(out.uniqueLeading.has("workflow_id"));
    assert.ok(!out.uniqueLeading.has("error_signature"));
  });
});

describe("findIndexLeadingColumns", () => {
  it("captures leading column from a CREATE INDEX statement", () => {
    const sql = "CREATE INDEX idx_foo ON foo (user_id, created_at DESC);";
    const idxs = findIndexLeadingColumns(sql);
    assert.equal(idxs.length, 1);
    assert.equal(idxs[0].tableName, "foo");
    assert.equal(idxs[0].leadingColumn, "user_id");
  });

  it("supports CREATE UNIQUE INDEX IF NOT EXISTS", () => {
    const sql =
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_foo_uniq ON foo (email);";
    const idxs = findIndexLeadingColumns(sql);
    assert.equal(idxs.length, 1);
    assert.equal(idxs[0].leadingColumn, "email");
  });

  it("supports USING btree/gin/etc. clauses", () => {
    const sql = "CREATE INDEX idx_foo_gin ON foo USING gin (tags);";
    const idxs = findIndexLeadingColumns(sql);
    assert.equal(idxs.length, 1);
    assert.equal(idxs[0].leadingColumn, "tags");
  });

  it("returns an empty array when no CREATE INDEX is present", () => {
    assert.deepEqual(findIndexLeadingColumns("CREATE TABLE foo (id INT);"), []);
  });
});

describe("isColumnCovered", () => {
  const ctx = (overrides = {}) => ({
    tableName: "foo",
    constraintLeading: {
      primaryKeyLeading: new Set(),
      uniqueLeading: new Set(),
    },
    indexes: [],
    ...overrides,
  });

  it("returns true for inline PRIMARY KEY", () => {
    assert.equal(
      isColumnCovered({ name: "id", def: "BIGSERIAL PRIMARY KEY" }, ctx()),
      true,
    );
  });

  it("returns true for inline UNIQUE", () => {
    assert.equal(
      isColumnCovered({ name: "email", def: "TEXT UNIQUE NOT NULL" }, ctx()),
      true,
    );
  });

  it("returns true when leading column matches a CREATE INDEX", () => {
    assert.equal(
      isColumnCovered(
        { name: "user_id", def: "TEXT NOT NULL" },
        ctx({
          indexes: [{ tableName: "foo", leadingColumn: "user_id" }],
        }),
      ),
      true,
    );
  });

  it("returns false when only covered as a non-leading composite column", () => {
    assert.equal(
      isColumnCovered(
        { name: "mono_account_id", def: "TEXT NOT NULL" },
        ctx({
          indexes: [{ tableName: "foo", leadingColumn: "user_id" }],
        }),
      ),
      false,
    );
  });

  it("returns true when table-level PRIMARY KEY covers leading column", () => {
    assert.equal(
      isColumnCovered(
        { name: "id", def: "INT NOT NULL" },
        ctx({
          constraintLeading: {
            primaryKeyLeading: new Set(["id"]),
            uniqueLeading: new Set(),
          },
        }),
      ),
      true,
    );
  });
});

describe("analyzeMigration — integration", () => {
  it("flags a FK column with no covering index", () => {
    const content = `
      CREATE TABLE foo (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        body TEXT NOT NULL
      );
    `;
    const warnings = analyzeMigration({ file: "999_foo.sql", content });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].column, "user_id");
    assert.match(warnings[0].reason, /FK column/);
  });

  it("does not flag a FK column when a CREATE INDEX covers it", () => {
    const content = `
      CREATE TABLE foo (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_foo_user ON foo (user_id);
    `;
    const warnings = analyzeMigration({ file: "999_foo.sql", content });
    assert.equal(warnings.length, 0);
  });

  it("flags a lookup-style `*_id` column with no covering index", () => {
    const content = `
      CREATE TABLE foo (
        id BIGSERIAL PRIMARY KEY,
        external_event_id TEXT NOT NULL,
        body TEXT
      );
    `;
    const warnings = analyzeMigration({ file: "999_foo.sql", content });
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].column, "external_event_id");
    assert.match(warnings[0].reason, /lookup-style/);
  });

  it("does not flag an `*_id` column when covered by inline UNIQUE", () => {
    const content = `
      CREATE TABLE foo (
        id BIGSERIAL PRIMARY KEY,
        idempotency_id TEXT NOT NULL UNIQUE
      );
    `;
    const warnings = analyzeMigration({ file: "999_foo.sql", content });
    assert.equal(warnings.length, 0);
  });

  it("does not flag an `*_id` column when covered by a table-level UNIQUE", () => {
    const content = `
      CREATE TABLE foo (
        id BIGSERIAL PRIMARY KEY,
        idempotency_id TEXT NOT NULL,
        UNIQUE (idempotency_id)
      );
    `;
    const warnings = analyzeMigration({ file: "999_foo.sql", content });
    assert.equal(warnings.length, 0);
  });

  it("flags a column covered only by a non-leading composite-index position", () => {
    const content = `
      CREATE TABLE foo (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        mono_account_id TEXT NOT NULL
      );
      CREATE INDEX idx_foo_combo ON foo (user_id, mono_account_id);
    `;
    const warnings = analyzeMigration({ file: "999_foo.sql", content });
    const flagged = warnings.find((w) => w.column === "mono_account_id");
    assert.ok(flagged, "should flag mono_account_id since it is not leading");
  });

  it("ignores the table's own primary key column named `id`", () => {
    const content = `
      CREATE TABLE foo (
        id BIGSERIAL PRIMARY KEY,
        body TEXT
      );
    `;
    const warnings = analyzeMigration({ file: "999_foo.sql", content });
    assert.equal(warnings.length, 0);
  });

  it("returns no warnings for an empty migration", () => {
    const warnings = analyzeMigration({
      file: "999_empty.sql",
      content: "-- no-op migration\n",
    });
    assert.equal(warnings.length, 0);
  });
});
