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
  APPEND_ONLY_TABLES,
  buildDelete,
  buildLwwUpsert,
  buildReconcileChildren,
  isAppendOnlyTable,
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

  it("emits unaligned SET assignments when alignSetColumns is false", () => {
    const sql = buildLwwUpsert({ ...SIMPLE_UPSERT, alignSetColumns: false });
    // No right-alignment padding — every assignment uses a single space
    // (the routine adapter's hand-written style).
    expect(sql).toContain("       name = excluded.name,");
    expect(sql).toContain("       data_json = excluded.data_json,");
    expect(sql).toContain("       deleted_at = NULL");
    expect(sql).not.toContain("name       = excluded.name");
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

/**
 * DCRUD-007 запобіжник: append-only журнали не можна ні soft-видаляти, ні
 * реконсилити за parentColumn. Інцидент, під який це написано, описаний у
 * `apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts` — dual-write
 * diff одного разу вже масово стер позиції комори. Для журналу така сама
 * помилка знищила б історію, з якої залишок відновлюється.
 */
describe("append-only tables are excluded from delete/reconcile", () => {
  it("registers the two stage-1 ledgers", () => {
    expect(isAppendOnlyTable("routine_completion_events")).toBe(true);
    expect(isAppendOnlyTable("nutrition_pantry_events")).toBe(true);
    expect(APPEND_ONLY_TABLES.has("nutrition_pantry_events")).toBe(true);
  });

  it("does NOT treat the mutable pantry-items table as append-only", () => {
    // Інакше запобіжник зламав би наявний (робочий) шлях комори.
    expect(isAppendOnlyTable("nutrition_pantry_items")).toBe(false);
    expect(isAppendOnlyTable("routine_entries")).toBe(false);
  });

  it("refuses to build a soft-delete for the pantry ledger", () => {
    expect(() =>
      buildDelete({
        table: "nutrition_pantry_events",
        deletePolicy: "soft",
        matchColumns: ["id", "user_id"],
      }),
    ).toThrow(/append-only table "nutrition_pantry_events"/);
  });

  it("refuses to build a hard-delete for the pantry ledger", () => {
    expect(() =>
      buildDelete({
        table: "nutrition_pantry_events",
        deletePolicy: "hard",
        matchColumns: ["id"],
      }),
    ).toThrow(/append-only table "nutrition_pantry_events"/);
  });

  it("refuses parent/child reconciliation of the pantry ledger (keepCount 0)", () => {
    // Саме ця гілка масово стерла дітей в інциденті DCRUD-007.
    expect(() =>
      buildReconcileChildren(
        { table: "nutrition_pantry_events", parentColumn: "pantry_id" },
        0,
      ),
    ).toThrow(/append-only table "nutrition_pantry_events"/);
  });

  it("refuses parent/child reconciliation of the pantry ledger (keepCount > 0)", () => {
    expect(() =>
      buildReconcileChildren(
        { table: "nutrition_pantry_events", parentColumn: "pantry_id" },
        3,
      ),
    ).toThrow(/append-only table "nutrition_pantry_events"/);
  });

  it("still builds a plain LWW upsert for non-ledger tables", () => {
    // Запобіжник стосується лише видалення/реконсиляції — звичайні
    // таблиці працюють як раніше.
    expect(() =>
      buildDelete({
        table: "nutrition_pantry_items",
        deletePolicy: "soft",
        matchColumns: ["id", "user_id"],
      }),
    ).not.toThrow();
  });
});
