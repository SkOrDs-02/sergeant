/**
 * Unit tests for the dual-write SQL builders (ADR-0073, крок 2).
 *
 * The load-bearing assertion is the LWW-guard invariant: a `"strictly-newer"`
 * upsert must emit ` > ` and must NEVER emit ` >= ` (ADR-0004, ADR-0073
 * § Risks #1). The rest pin the exact SET/WHERE/VALUES shapes so the builders
 * stay byte-stable against the module SQL snapshots.
 */
import { describe, expect, it } from "vitest";

import {
  buildDelete,
  buildLwwUpsert,
  buildReconcileChildren,
  type TableSpec,
} from "./index.js";

const SIMPLE_UPSERT: TableSpec = {
  table: "nutrition_recipes",
  insertClause: `INSERT INTO nutrition_recipes
       (id, user_id, name, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "name" },
    { column: "data_json" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

describe("buildLwwUpsert — LWW guard invariant", () => {
  it("emits a strictly-greater guard, never >=", () => {
    const sql = buildLwwUpsert(SIMPLE_UPSERT);
    expect(sql).toContain(" > ");
    expect(sql).not.toContain(" >= ");
    expect(sql).toContain(
      "WHERE excluded.updated_at > nutrition_recipes.updated_at",
    );
  });

  it("omits the guard entirely when upsertGuard is 'none'", () => {
    const sql = buildLwwUpsert({ ...SIMPLE_UPSERT, upsertGuard: "none" });
    expect(sql).not.toContain("WHERE");
    expect(sql).not.toContain(">");
  });

  it("right-aligns SET assignments on the longest column name", () => {
    const sql = buildLwwUpsert(SIMPLE_UPSERT);
    // longest updateColumn is `data_json` (9) — `name` padded to 9.
    expect(sql).toContain("       name       = excluded.name");
    expect(sql).toContain("       data_json  = excluded.data_json");
    expect(sql).toContain("       deleted_at = NULL");
  });

  it("honours a multi-column conflict target", () => {
    const sql = buildLwwUpsert({
      ...SIMPLE_UPSERT,
      conflictTarget: ["user_id", "date_key"],
    });
    expect(sql).toContain("ON CONFLICT(user_id, date_key) DO UPDATE SET");
  });
});

describe("buildDelete", () => {
  it("builds a guarded soft-delete", () => {
    const sql = buildDelete({
      table: "nutrition_meals",
      deletePolicy: "soft",
      matchColumns: ["id", "user_id"],
    });
    expect(sql).toBe(
      `UPDATE nutrition_meals
        SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND updated_at < ?`,
    );
  });

  it("builds an unguarded hard-delete", () => {
    const sql = buildDelete({
      table: "finyk_tx_categories",
      deletePolicy: "hard",
      matchColumns: ["user_id", "transaction_id"],
    });
    expect(sql).toBe(
      `DELETE FROM finyk_tx_categories
      WHERE user_id = ? AND transaction_id = ?`,
    );
    expect(sql).not.toContain("updated_at <");
  });
});

describe("buildReconcileChildren", () => {
  const spec = {
    table: "nutrition_pantry_items",
    parentColumn: "pantry_id",
  };

  it("soft-deletes every live child when keepCount is 0", () => {
    const sql = buildReconcileChildren(spec, 0);
    expect(sql).toBe(
      `UPDATE nutrition_pantry_items
        SET deleted_at = ?, updated_at = ?
      WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL`,
    );
  });

  it("uses a NOT IN placeholder list when keepCount > 0", () => {
    const sql = buildReconcileChildren(spec, 2);
    expect(sql).toBe(
      `UPDATE nutrition_pantry_items
        SET deleted_at = ?, updated_at = ?
      WHERE pantry_id = ?
        AND user_id = ?
        AND deleted_at IS NULL
        AND id NOT IN (?,?)`,
    );
  });
});
