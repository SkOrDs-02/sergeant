/**
 * Declarative table specs + SQL builders for the dual-write framework
 * (ADR-0073, крок 2).
 *
 * A `TableSpec` captures the *mechanics* of a LWW upsert / soft-or-hard
 * delete for one SQLite table: the conflict target, which columns are
 * refreshed from `excluded.*`, the LWW guard, and the delete policy. The
 * builders emit byte-stable SQL so migrating an adapter onto them keeps its
 * SQL-snapshot unchanged.
 *
 * LWW guard is an **enum**, never a free-form string — this is the single
 * point where the ADR-0004 invariant "strictly newer wins" is encoded, so it
 * can never silently become `>=` (ADR-0073 § Risks #1). See
 * `tableSpec.test.ts`: the generated upsert SQL must contain ` > ` and must
 * NOT contain ` >= `.
 *
 * The builders parameterise mechanics, not layout: each spec carries the
 * exact INSERT header (`INSERT INTO … (cols) VALUES (…)`) as a literal, and
 * the builder appends the generated `ON CONFLICT … DO UPDATE SET …` /
 * `WHERE` tail. Different tables have genuinely different column shapes
 * (meals/pantries/recipes carry `created_at` + `deleted_at`; water_log /
 * shopping_list are set-only with neither) — the spec reproduces each
 * table's own shape rather than forcing a single template.
 *
 * AI-CONTEXT: platform-neutral, no DOM/RN/Sentry (ADR-0073 § Risks #2).
 */

/** LWW guard flavour. `"strictly-newer"` is the ADR-0004 canon. */
export type UpsertGuard = "strictly-newer" | "none";

/** Delete flavour. `"hard"` is the finyk per-tx mapping exception. */
export type DeletePolicy = "soft" | "hard";

/** One `col = excluded.col` assignment in the ON CONFLICT … DO UPDATE SET. */
export interface UpsertUpdateColumn {
  readonly column: string;
  /**
   * Right-hand side of the assignment. Defaults to `excluded.<column>`.
   * A literal (e.g. `"NULL"` to reset a tombstone) overrides it.
   */
  readonly value?: string;
}

export interface TableSpec {
  readonly table: string;
  /**
   * Exact INSERT prefix ending right before `ON CONFLICT`, including the
   * column list and `VALUES (…)` clause, indented as the table's SQL is
   * written today. The builder appends the generated conflict tail to it.
   */
  readonly insertClause: string;
  /** ON CONFLICT(...) target columns. */
  readonly conflictTarget: readonly string[];
  /** Columns refreshed from `excluded.*` (or a literal) on conflict. */
  readonly updateColumns: readonly UpsertUpdateColumn[];
  readonly upsertGuard: UpsertGuard;
  /** Indentation (spaces) of the `ON CONFLICT` / `SET` / `WHERE` block. */
  readonly conflictIndent: number;
  /** Indentation (spaces) of each `col = …` line inside SET. */
  readonly setIndent: number;
}

export interface DeleteSpec {
  readonly table: string;
  readonly deletePolicy: DeletePolicy;
  /**
   * Column names forming the row match in the WHERE clause (e.g.
   * `["id", "user_id"]`). Emitted as `col = ? AND col = ?`.
   */
  readonly matchColumns: readonly string[];
}

export interface ReconcileChildrenSpec {
  readonly table: string;
  readonly parentColumn: string;
}

const sp = (n: number): string => " ".repeat(n);

/**
 * Build the full `INSERT … ON CONFLICT … DO UPDATE SET … WHERE …` upsert.
 * The SET column assignments are right-aligned on the longest column name
 * (matching the hand-written SQL), and the guard is emitted from the enum.
 */
export function buildLwwUpsert(spec: TableSpec): string {
  const setIndent = sp(spec.setIndent);
  const conflictIndent = sp(spec.conflictIndent);
  const width = Math.max(...spec.updateColumns.map((c) => c.column.length));

  const setLines = spec.updateColumns.map(({ column, value }) => {
    const rhs = value ?? `excluded.${column}`;
    return `${setIndent}${column.padEnd(width)} = ${rhs}`;
  });

  const conflictLine = `${conflictIndent}ON CONFLICT(${spec.conflictTarget.join(
    ", ",
  )}) DO UPDATE SET`;

  const parts = [spec.insertClause, conflictLine, setLines.join(",\n")];

  if (spec.upsertGuard === "strictly-newer") {
    parts.push(
      `${conflictIndent}WHERE excluded.updated_at > ${spec.table}.updated_at`,
    );
  }

  return parts.join("\n");
}

/**
 * Build a delete statement.
 *
 *  - `"soft"` → `UPDATE … SET deleted_at=?, updated_at=? WHERE <match> AND updated_at < ?`
 *  - `"hard"` → `DELETE FROM … WHERE <match>` (no LWW guard)
 */
export function buildDelete(spec: DeleteSpec): string {
  const match = spec.matchColumns.map((c) => `${c} = ?`).join(" AND ");
  if (spec.deletePolicy === "hard") {
    return `DELETE FROM ${spec.table}
      WHERE ${match}`;
  }
  return `UPDATE ${spec.table}
        SET deleted_at = ?, updated_at = ?
      WHERE ${match} AND updated_at < ?`;
}

/**
 * Build the parent/child reconciliation soft-delete: children of `parentId`
 * that are no longer in `keepCount` ids get tombstoned. Two branches match
 * the hand-written adapter:
 *
 *  - `keepCount === 0` → soft-delete every live child of the parent.
 *  - `keepCount > 0`   → soft-delete live children whose id is NOT IN (…).
 */
export function buildReconcileChildren(
  spec: ReconcileChildrenSpec,
  keepCount: number,
): string {
  if (keepCount === 0) {
    return `UPDATE ${spec.table}
        SET deleted_at = ?, updated_at = ?
      WHERE ${spec.parentColumn} = ? AND user_id = ? AND deleted_at IS NULL`;
  }
  const placeholders = Array.from({ length: keepCount }, () => "?").join(",");
  return `UPDATE ${spec.table}
        SET deleted_at = ?, updated_at = ?
      WHERE ${spec.parentColumn} = ?
        AND user_id = ?
        AND deleted_at IS NULL
        AND id NOT IN (${placeholders})`;
}
