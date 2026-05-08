import type { RoutineState } from "@sergeant/routine-domain";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

/**
 * Parity probe for the Routine SQLite dual-write layer.
 *
 * Stage 8 §3 of `docs/planning/storage-roadmap.md` defines a
 * `<module>.sqlite.dualwrite.parity` decision-gate metric: whenever
 * the LS-derived state and the SQLite-derived state should be
 * identical (which is the steady-state invariant once the dual-write
 * `applied` outcome returns success), they are compared and a
 * `recordParityCheck` tick is emitted on the global Sentry scope.
 *
 * The orchestrator (`./index.ts`) calls this helper after every
 * successful `applyRoutineDualWriteOps` apply. Routine SQLite holds
 * only the `routine_entries` table today — habits / tags / categories /
 * prefs / pushups / habitOrder / completionNotes still live in LS and
 * migrate in later PRs (`storage-roadmap.md` Stage 8). The probe
 * therefore compares **only** the (habitId, dateKey) completion set
 * — that is the only field that actually round-trips through SQLite
 * at this stage.
 *
 * The probe is best-effort: it must NEVER throw, and any read failure
 * is surfaced as a `read.fallback` — distinct from a real parity
 * mismatch — so triage can tell `SELECT failing` apart from `LS and
 * SQLite genuinely disagree on completions`. The orchestrator
 * implements that distinction.
 */

interface ParityProbeOutcome {
  result: "match" | "mismatch";
  details: Record<string, unknown>;
}

/**
 * Read the active Routine completion set from SQLite for `userId` and
 * compare it to the LS-derived `next.completions`. The two are
 * expected to be byte-identical right after a successful dual-write
 * apply — any divergence is a Stage 8 decision-gate signal.
 *
 * The function may throw if the SQLite read itself fails. The caller
 * is expected to catch and route that to `recordReadFallback` rather
 * than `recordParityCheck("…", "mismatch", …)` — see `./index.ts`.
 */
export async function probeRoutineParity(
  client: SqliteMigrationClient,
  userId: string,
  next: RoutineState,
): Promise<ParityProbeOutcome> {
  const rows = await client.all<{ id: string }>(
    `SELECT id FROM routine_entries
       WHERE user_id = ? AND deleted_at IS NULL`,
    [userId],
  );

  // Build the SQLite-side `(habitId, dateKey)` set, mirroring the row
  // id convention from `buildCompletionRowId` in `./diff.ts`.
  const sqliteSet = new Set<string>();
  let sqliteRows = 0;
  for (const row of rows) {
    const sep = row.id.indexOf(":");
    if (sep <= 0 || sep === row.id.length - 1) continue;
    const dateKey = row.id.slice(sep + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    sqliteSet.add(row.id);
    sqliteRows += 1;
  }

  const lsSet = buildExpectedSet(next.completions);

  if (lsSet.size === sqliteSet.size) {
    let allMatch = true;
    for (const key of lsSet) {
      if (!sqliteSet.has(key)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      return {
        result: "match",
        details: { ls: lsSet.size, sqlite: sqliteRows },
      };
    }
  }

  // Mismatch: surface the symmetric-difference cardinality so triage
  // can read the bucket without a follow-up query. We deliberately
  // do NOT include the actual ids — habit ids are user-data and
  // Sentry breadcrumbs leak into events.
  let lsOnly = 0;
  let sqliteOnly = 0;
  for (const key of lsSet) if (!sqliteSet.has(key)) lsOnly += 1;
  for (const key of sqliteSet) if (!lsSet.has(key)) sqliteOnly += 1;

  return {
    result: "mismatch",
    details: {
      ls: lsSet.size,
      sqlite: sqliteRows,
      lsOnly,
      sqliteOnly,
    },
  };
}

function buildExpectedSet(
  completions: Record<string, string[]> | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!completions || typeof completions !== "object") return out;
  for (const [habitId, dateKeys] of Object.entries(completions)) {
    if (!Array.isArray(dateKeys)) continue;
    for (const dk of dateKeys) {
      if (typeof dk !== "string" || dk.length === 0) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
      out.add(`${habitId}:${dk}`);
    }
  }
  return out;
}
