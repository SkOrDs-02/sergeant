#!/usr/bin/env node
/**
 * `pnpm reencrypt:tokens` — proactive OAuth-token re-encryption CLI.
 *
 * Context. The natural rollover strategy (encryptingAdapter.ts) re-encrypts
 * a row's `accessToken` / `refreshToken` / `idToken` only when the user
 * triggers an OAuth refresh — Better Auth's `update` path goes through the
 * encrypting adapter, which writes the new ciphertext under
 * `ring.current.version`. This works for active users but leaves rows of
 * dormant users encrypted under the old key indefinitely. Until every old
 * row rolls forward, the old key cannot be safely retired from
 * `BETTER_AUTH_TOKEN_ENC_KEYS` — a removal would brick decryption for
 * still-stale rows on their next refresh.
 *
 * What this script does. SELECTs `account` rows in batches, walks the three
 * token columns, and re-writes any value whose ciphertext key-version is not
 * the current version. The plaintext never leaves Node (decrypt → re-encrypt
 * happens in-memory; raw values are NEVER logged). After the script
 * completes with --execute and exits 0, all token columns are encrypted
 * under `ring.current.version` and the previous-version key can be removed
 * from `BETTER_AUTH_TOKEN_ENC_KEYS` in the next deploy.
 *
 * Safety defaults:
 *   • `--dry-run` is the default. Operator must pass `--execute` for writes.
 *   • Token values are NEVER logged. Only `(rowId, field, oldVersion →
 *     newVersion)` triples are emitted, and only at info level.
 *   • Per-row atomic UPDATE — if one row fails (encryption error, DB
 *     conflict), the row is reported, others continue. Script exit code = 3
 *     when at least one row failed in --execute mode.
 *   • `--max-rows` caps total processed (default 10000). Multi-pass invocation
 *     is the intended pattern for very large account tables.
 *   • `--batch-size` controls SELECT page size (default 200, cap 1000).
 *   • UPDATEs use `id = $1 AND <column> IS NOT DISTINCT FROM $2` to fail
 *     loudly if a concurrent Better Auth refresh happened between SELECT and
 *     UPDATE — we'd rather skip the row than overwrite a fresh ciphertext.
 *
 * Usage:
 *   # Dry run, default. Shows what would change without writing.
 *   pnpm --filter @sergeant/server reencrypt:tokens
 *
 *   # Actually re-encrypt; --batch-size for tuning, --max-rows to cap pass.
 *   pnpm --filter @sergeant/server reencrypt:tokens -- --execute --batch-size=500 --max-rows=5000
 *
 *   # Verbose per-row report (default is per-batch summary only).
 *   pnpm --filter @sergeant/server reencrypt:tokens -- --execute --verbose
 *
 * Env vars consumed:
 *   • `BETTER_AUTH_TOKEN_ENC_KEYS` + `BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION`
 *     (multi-key), or legacy `BETTER_AUTH_TOKEN_ENC_KEY` (single-key — script
 *     is no-op since there's nothing to rotate to).
 *   • Standard DB env (`DATABASE_URL` etc.) — picked up by `apps/server/src/db.ts`.
 *
 * Exit codes:
 *   0 — success (dry-run report, or --execute and all rows re-encrypted).
 *   1 — argument / config error (missing key, invalid args).
 *   2 — DB connection / unrecoverable error.
 *   3 — partial failure (--execute mode and ≥1 row UPDATE failed).
 *
 * See `apps/server/src/auth/encryptingAdapter.ts` for the lazy rollover
 * path that handles active users; this script is the manual sweep for the
 * tail.
 */

import { parseArgs } from "node:util";
import process from "node:process";
import {
  decryptString,
  encryptString,
  isEncrypted,
  readKeyVersion,
} from "../src/auth/tokenCrypto.js";
import { parseKeyRing, type KeyRing } from "../src/lib/keyRing.js";

const TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken"] as const;
type TokenField = (typeof TOKEN_FIELDS)[number];

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;
const DEFAULT_MAX_ROWS = 10000;

interface ParsedArgs {
  execute: boolean;
  batchSize: number;
  maxRows: number;
  verbose: boolean;
  help: boolean;
}

interface ParsedArgsResult {
  parsed?: ParsedArgs;
  error?: string;
}

/**
 * Pure CLI-arg parser. Exported for unit tests so the validation matrix
 * (boundary values, type coercion) is locked without spinning up a CLI
 * process per case.
 */
export function parseCliArgs(argv: readonly string[]): ParsedArgsResult {
  const { values } = parseArgs({
    args: [...argv],
    allowPositionals: false,
    options: {
      execute: { type: "boolean", default: false },
      "batch-size": { type: "string" },
      "max-rows": { type: "string" },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { parsed: { execute: false, batchSize: 0, maxRows: 0, verbose: false, help: true } };
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  if (values["batch-size"] !== undefined) {
    const n = Number(values["batch-size"]);
    if (!Number.isInteger(n) || n <= 0 || n > MAX_BATCH_SIZE) {
      return {
        error: `--batch-size must be an integer in [1..${MAX_BATCH_SIZE}], got "${values["batch-size"]}"`,
      };
    }
    batchSize = n;
  }

  let maxRows = DEFAULT_MAX_ROWS;
  if (values["max-rows"] !== undefined) {
    const n = Number(values["max-rows"]);
    if (!Number.isInteger(n) || n <= 0) {
      return {
        error: `--max-rows must be a positive integer, got "${values["max-rows"]}"`,
      };
    }
    maxRows = n;
  }

  return {
    parsed: {
      execute: !!values.execute,
      batchSize,
      maxRows,
      verbose: !!values.verbose,
      help: false,
    },
  };
}

export interface AccountRow {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
}

export interface FieldRekey {
  field: TokenField;
  oldVersion: number;
  /** The new ciphertext, encrypted under `ring.current.version`. */
  newCiphertext: string;
  /** The original ciphertext — used in WHERE clause for optimistic-lock. */
  oldCiphertext: string;
}

export interface RowPlan {
  rowId: string;
  rekeys: FieldRekey[];
}

/**
 * Pure planner — given a single row + the active key ring, returns the list
 * of token fields whose ciphertext needs to be re-written under
 * `ring.current.version`. Skips:
 *   • null / empty fields (no token on that provider)
 *   • plaintext (encryption never ran — pre-encrypting-adapter row)
 *   • ciphertext already under the current key version
 *   • malformed `enc:v2:` prefix (readKeyVersion throws — we report the row
 *     as failed downstream rather than try to re-encrypt unparseable data)
 *
 * Decrypt + encrypt happen here. The plaintext lives only on the call
 * stack and is GC'd immediately. NEVER write the plaintext anywhere.
 */
export function planRowRollover(row: AccountRow, ring: KeyRing): RowPlan {
  const rekeys: FieldRekey[] = [];
  for (const field of TOKEN_FIELDS) {
    const value = row[field];
    if (typeof value !== "string" || value.length === 0) continue;
    if (!isEncrypted(value)) continue;
    let oldVersion: number | null;
    try {
      oldVersion = readKeyVersion(value);
    } catch {
      // Malformed enc:v2: header — surface upstream via dedicated error path.
      // Throwing here would short-circuit OTHER fields on the same row;
      // skip this field and let the operator decide via verbose report.
      continue;
    }
    if (oldVersion === null) continue;
    if (oldVersion === ring.current.version) continue;
    const plaintext = decryptString(value, ring);
    const newCiphertext = encryptString(plaintext, ring);
    rekeys.push({
      field,
      oldVersion,
      newCiphertext,
      oldCiphertext: value,
    });
  }
  return { rowId: row.id, rekeys };
}

export interface RollupCounters {
  rowsScanned: number;
  rowsNeedingRekey: number;
  rowsUpdated: number;
  rowsFailed: number;
  fieldsRewritten: number;
  /** Per old-version counts — useful to confirm "all v1 rows drained" before retiring v1. */
  byOldVersion: Map<number, number>;
}

export function newCounters(): RollupCounters {
  return {
    rowsScanned: 0,
    rowsNeedingRekey: 0,
    rowsUpdated: 0,
    rowsFailed: 0,
    fieldsRewritten: 0,
    byOldVersion: new Map(),
  };
}

export function accumulatePlan(counters: RollupCounters, plan: RowPlan): void {
  counters.rowsScanned += 1;
  if (plan.rekeys.length === 0) return;
  counters.rowsNeedingRekey += 1;
  for (const rekey of plan.rekeys) {
    counters.fieldsRewritten += 1;
    counters.byOldVersion.set(
      rekey.oldVersion,
      (counters.byOldVersion.get(rekey.oldVersion) ?? 0) + 1,
    );
  }
}

export function formatReport(counters: RollupCounters, mode: "dry-run" | "execute"): string {
  const lines: string[] = [];
  lines.push(`Mode: ${mode}`);
  lines.push(`Rows scanned:        ${counters.rowsScanned}`);
  lines.push(`Rows needing rekey:  ${counters.rowsNeedingRekey}`);
  if (mode === "execute") {
    lines.push(`Rows updated:        ${counters.rowsUpdated}`);
    lines.push(`Rows failed:         ${counters.rowsFailed}`);
  }
  lines.push(`Fields to rewrite:   ${counters.fieldsRewritten}`);
  if (counters.byOldVersion.size > 0) {
    lines.push("By old key version:");
    const versions = Array.from(counters.byOldVersion.keys()).sort((a, b) => a - b);
    for (const v of versions) {
      lines.push(`  v${v} → v? : ${counters.byOldVersion.get(v)} field(s)`);
    }
  }
  return lines.join("\n");
}

const HELP = `
pnpm reencrypt:tokens — proactive OAuth-token re-encryption sweep.

Usage:
  pnpm --filter @sergeant/server reencrypt:tokens [-- <flags>]

Flags:
  --execute             Actually write UPDATEs. Default is dry-run.
  --batch-size=<N>      Rows per SELECT page (default 200, max 1000).
  --max-rows=<N>        Cap total rows processed in this invocation (default 10000).
                        Multi-pass invocation is the intended pattern for very
                        large tables.
  --verbose             Per-row (rowId, field, oldVer → newVer) report.
                        Default is per-batch summary only.
  --help, -h            Show this help.

Env:
  BETTER_AUTH_TOKEN_ENC_KEYS                 Multi-key CSV (v1:hex,v2:hex,...).
  BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION  Current write key (e.g. v2).
  BETTER_AUTH_TOKEN_ENC_KEY                  Legacy single-key fallback (script is a no-op).

Exit codes:
  0  success (dry-run, or execute with zero failures)
  1  argument / config error
  2  DB / unrecoverable error
  3  execute mode and ≥1 row UPDATE failed
`;

async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const result = parseCliArgs(argv);
  if (result.error) {
    process.stderr.write(`reencrypt-tokens: ${result.error}\n`);
    return 1;
  }
  const parsed = result.parsed;
  if (!parsed || parsed.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const ring = parseKeyRing({
    keysCsv: process.env["BETTER_AUTH_TOKEN_ENC_KEYS"] ?? null,
    currentVersion: process.env["BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION"] ?? null,
    legacyKey: process.env["BETTER_AUTH_TOKEN_ENC_KEY"] ?? null,
    envName: "BETTER_AUTH_TOKEN_ENC_KEY",
  });

  if (!ring) {
    process.stderr.write(
      "reencrypt-tokens: no key ring configured (BETTER_AUTH_TOKEN_ENC_KEYS / *_KEY missing). Nothing to do.\n",
    );
    return 1;
  }

  if (ring.versions.length === 1) {
    process.stdout.write(
      `reencrypt-tokens: single key version v${ring.current.version} in ring; nothing to rotate. Exit.\n`,
    );
    return 0;
  }

  // Defer pool import to runtime so unit tests of pure functions don't need a DB.
  const { default: pool } = await import("../src/db.js");

  const mode = parsed.execute ? "execute" : "dry-run";
  process.stdout.write(
    `reencrypt-tokens: mode=${mode} batchSize=${parsed.batchSize} maxRows=${parsed.maxRows} ring=[${ring.versions.map((v) => `v${v}`).join(",")}] current=v${ring.current.version}\n`,
  );

  const counters = newCounters();
  let offset = 0;
  let processed = 0;

  try {
    while (processed < parsed.maxRows) {
      const remaining = parsed.maxRows - processed;
      const limit = Math.min(parsed.batchSize, remaining);

      // Pull only rows that have at least one non-null token field. This keeps
      // the scan focused on the population that COULD need rekeying — accounts
      // with no OAuth tokens (password-only) are excluded server-side.
      const batch = await pool.query<AccountRow>(
        `SELECT id, "accessToken", "refreshToken", "idToken"
         FROM account
         WHERE "accessToken" IS NOT NULL
            OR "refreshToken" IS NOT NULL
            OR "idToken" IS NOT NULL
         ORDER BY id
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );

      if (batch.rows.length === 0) break;

      for (const row of batch.rows) {
        const plan = planRowRollover(row, ring);
        accumulatePlan(counters, plan);

        if (parsed.verbose && plan.rekeys.length > 0) {
          for (const rk of plan.rekeys) {
            process.stdout.write(
              `  row=${plan.rowId} field=${rk.field} v${rk.oldVersion} -> v${ring.current.version}\n`,
            );
          }
        }

        if (parsed.execute && plan.rekeys.length > 0) {
          try {
            await updateRowAtomic(pool, plan);
            counters.rowsUpdated += 1;
          } catch (err) {
            counters.rowsFailed += 1;
            process.stderr.write(
              `  row=${plan.rowId} UPDATE failed: ${err instanceof Error ? err.message : String(err)}\n`,
            );
          }
        }
      }

      processed += batch.rows.length;
      offset += batch.rows.length;

      process.stdout.write(
        `Batch done. Processed ${processed} rows so far (need-rekey ${counters.rowsNeedingRekey}, updated ${counters.rowsUpdated}).\n`,
      );

      if (batch.rows.length < limit) break;
    }

    process.stdout.write(`\n${formatReport(counters, mode)}\n`);

    if (mode === "dry-run" && counters.rowsNeedingRekey > 0) {
      process.stdout.write(
        "\nPass --execute to actually re-encrypt. Multi-pass invocation is safe (idempotent).\n",
      );
    }

    return counters.rowsFailed > 0 ? 3 : 0;
  } catch (err) {
    process.stderr.write(
      `reencrypt-tokens: unrecoverable error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    return 2;
  } finally {
    await pool.end().catch(() => {
      /* best-effort */
    });
  }
}

/**
 * Per-field optimistic-lock UPDATE. The WHERE clause re-asserts the old
 * ciphertext for each field being rewritten — if Better Auth refreshed the
 * row between our SELECT and our UPDATE, the WHERE fails to match and the
 * row is skipped (caller increments `rowsFailed` and continues). This is
 * the cheapest way to avoid clobbering a fresh refresh with our re-encryption
 * of a now-stale plaintext.
 */
async function updateRowAtomic(
  pool: { query: (q: string, p: unknown[]) => Promise<{ rowCount: number | null }> },
  plan: RowPlan,
): Promise<void> {
  if (plan.rekeys.length === 0) return;
  const setClauses: string[] = [];
  const whereClauses: string[] = [`id = $1`];
  const params: unknown[] = [plan.rowId];
  let paramIdx = 2;
  for (const rk of plan.rekeys) {
    setClauses.push(`"${rk.field}" = $${paramIdx}`);
    params.push(rk.newCiphertext);
    paramIdx += 1;
    whereClauses.push(`"${rk.field}" = $${paramIdx}`);
    params.push(rk.oldCiphertext);
    paramIdx += 1;
  }
  const sql = `UPDATE account SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`;
  const result = await pool.query(sql, params);
  if ((result.rowCount ?? 0) === 0) {
    throw new Error("row changed between SELECT and UPDATE (optimistic-lock fail) — skipped");
  }
}

// Export for tests
export const __test__ = {
  TOKEN_FIELDS,
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  DEFAULT_MAX_ROWS,
  updateRowAtomic,
};

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("token-reencrypt-rollover.ts") ||
  process.argv[1]?.endsWith("token-reencrypt-rollover.js");

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `reencrypt-tokens: top-level crash: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
      );
      process.exit(2);
    });
}
