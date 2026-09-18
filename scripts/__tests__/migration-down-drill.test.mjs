// scripts/__tests__/migration-down-drill.test.mjs
//
// Unit tests for pure helpers in `migration-down-drill.mjs`. The full drill
// is exercised by the `migration-down-drill` CI job against a real Postgres
// service container — these tests cover the file-system-level helpers and
// the snapshot diff function so a broken helper fails fast at PR-time,
// before the slow integration job spins up.
//
// Run with: node --test scripts/__tests__/migration-down-drill.test.mjs

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { downCompanion, diffSnapshots } from "../migration-down-drill.mjs";

describe("downCompanion", () => {
  it("maps NNN_foo.sql → NNN_foo.down.sql", async () => {
    assert.equal(
      await downCompanion("058_n8n_failure_events_signature.sql"),
      "058_n8n_failure_events_signature.down.sql",
    );
  });

  it("preserves leading prefix and full description", async () => {
    assert.equal(
      await downCompanion("003_baseline_schema.sql"),
      "003_baseline_schema.down.sql",
    );
  });
});

describe("diffSnapshots", () => {
  it("returns empty object when snapshots are identical", () => {
    const snap = {
      tables: [{ table_name: "t1", table_type: "BASE TABLE" }],
      columns: [
        {
          table_name: "t1",
          column_name: "id",
          data_type: "integer",
          udt_name: "int4",
          is_nullable: "NO",
          column_default: null,
          is_generated: "NEVER",
          generation_expression: null,
        },
      ],
      indexes: [],
      constraints: [],
      sequences: [],
      enums: [],
    };
    const diff = diffSnapshots(snap, snap);
    assert.deepEqual(diff, {});
  });

  it("reports keys that differ between A and B", () => {
    const a = {
      tables: [{ table_name: "t1", table_type: "BASE TABLE" }],
      columns: [],
      indexes: [],
      constraints: [],
      sequences: [],
      enums: [],
    };
    const b = {
      tables: [
        { table_name: "t1", table_type: "BASE TABLE" },
        { table_name: "leaked", table_type: "BASE TABLE" },
      ],
      columns: [],
      indexes: [],
      constraints: [],
      sequences: [],
      enums: [],
    };
    const diff = diffSnapshots(a, b);
    assert.ok("tables" in diff, "tables diff missing");
    assert.deepEqual(diff.tables.onlyInA, []);
    assert.deepEqual(diff.tables.onlyInB, [
      { table_name: "leaked", table_type: "BASE TABLE" },
    ]);
  });

  it("does not report keys that match across snapshots", () => {
    const a = {
      tables: [{ table_name: "t1", table_type: "BASE TABLE" }],
      columns: [],
      indexes: [{ tablename: "t1", indexname: "t1_pkey", indexdef: "…" }],
      constraints: [],
      sequences: [],
      enums: [],
    };
    const b = {
      tables: [{ table_name: "t1", table_type: "BASE TABLE" }],
      columns: [{ table_name: "t1", column_name: "id" }], // differs from a
      indexes: [{ tablename: "t1", indexname: "t1_pkey", indexdef: "…" }],
      constraints: [],
      sequences: [],
      enums: [],
    };
    const diff = diffSnapshots(a, b);
    assert.ok("columns" in diff, "columns should diff");
    assert.ok(!("tables" in diff), "tables should match");
    assert.ok(!("indexes" in diff), "indexes should match");
  });

  it("captures asymmetric diffs (only-in-A vs only-in-B)", () => {
    const a = {
      tables: [],
      columns: [
        {
          table_name: "t1",
          column_name: "old_col",
          data_type: "text",
          udt_name: "text",
          is_nullable: "YES",
          column_default: null,
          is_generated: "NEVER",
          generation_expression: null,
        },
      ],
      indexes: [],
      constraints: [],
      sequences: [],
      enums: [],
    };
    const b = {
      tables: [],
      columns: [
        {
          table_name: "t1",
          column_name: "new_col",
          data_type: "text",
          udt_name: "text",
          is_nullable: "YES",
          column_default: null,
          is_generated: "NEVER",
          generation_expression: null,
        },
      ],
      indexes: [],
      constraints: [],
      sequences: [],
      enums: [],
    };
    const diff = diffSnapshots(a, b);
    assert.equal(diff.columns.onlyInA.length, 1);
    assert.equal(diff.columns.onlyInA[0].column_name, "old_col");
    assert.equal(diff.columns.onlyInB.length, 1);
    assert.equal(diff.columns.onlyInB[0].column_name, "new_col");
  });
});
