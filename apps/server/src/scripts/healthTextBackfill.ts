#!/usr/bin/env node
/**
 * `pnpm backfill:health-text` — разовий бекфіл шифрування вільного тексту
 * про здоровʼя (`docs/work/specs/health-text-encryption.md`, § Відкрито).
 *
 * Контекст. v1 шифрує `fizruk_injuries.note` лише при записі (applyInjuries,
 * syncV2). Старі plaintext-рядки лишаються відкритими, доки хтось не
 * відредагує травму. Скрипт перешифровує:
 *   1. `fizruk_injuries.note`;
 *   2. `sync_op_log.row->>'note'` для `table_name = 'fizruk_injuries'`.
 *
 * Крипто не нове: `encryptHealthText` -> `encryptString` (AES-256-GCM, кільце
 * `BETTER_AUTH_TOKEN_ENC_KEY[S]`). Схема не змінюється.
 *
 * Гарантії:
 *   - `--dry-run` за замовчуванням; запис лише з `--execute`.
 *   - Ідемпотентність: значення з префіксом `enc:` і порожні нотатки
 *     пропускаються (і в SQL-фільтрі, і в JS-планері).
 *   - Батчі за keyset по `id` (не OFFSET: у execute-режимі рядки виходять
 *     із вибірки, OFFSET пропускав би їх).
 *   - Оптимістичний замок: UPDATE має `AND note = <старе значення>`, тож
 *     паралельний запис користувача не буде затертий.
 *   - `updated_at` НЕ чіпаємо: це LWW-мітка, перешифрування не є правкою.
 *   - Hard Rule #21: у вивід потрапляють лише лічильники й id рядків,
 *     ніколи вміст нотаток (ні plaintext, ні шифротекст).
 *   - Без ключа скрипт відмовляється працювати (інакше encryptHealthText
 *     повернув би plaintext як є).
 *
 * Usage:
 *   pnpm --filter @sergeant/server backfill:health-text
 *   pnpm --filter @sergeant/server backfill:health-text -- --execute --batch-size=500
 *
 * Exit codes: 0 успіх; 1 аргументи/конфіг; 2 помилка БД; 3 execute і >=1
 * рядок не оновлено.
 */

import { parseArgs } from "node:util";
import process from "node:process";
import { isEncrypted } from "../auth/tokenCrypto.js";
import type { KeyRing } from "../lib/keyRing.js";
import {
  encryptHealthText,
  healthTextKeyRing,
} from "../lib/healthTextCrypto.js";

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 1000;

export interface BackfillArgs {
  execute: boolean;
  batchSize: number;
  help: boolean;
}

export function parseCliArgs(argv: readonly string[]): {
  parsed?: BackfillArgs;
  error?: string;
} {
  // `pnpm <script> -- --execute` передає роздільник `--` далі як аргумент, а
  // parseArgs вважає все після нього позиційним і кидає TypeError.
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  let values;
  try {
    ({ values } = parseArgs({
      args,
      allowPositionals: false,
      options: {
        execute: { type: "boolean", default: false },
        "dry-run": { type: "boolean", default: false },
        "batch-size": { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "invalid arguments" };
  }
  if (values.execute && values["dry-run"]) {
    return { error: "--execute and --dry-run are mutually exclusive" };
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
  return {
    parsed: {
      execute: !!values.execute,
      batchSize,
      help: !!values.help,
    },
  };
}

/** Мінімальна поверхня `pg.Pool`, потрібна скрипту (мокається в тестах). */
export interface Queryable {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount: number | null;
  }>;
}

export interface TableCounters {
  scanned: number;
  needsEncrypt: number;
  updated: number;
  /** Оптимістичний замок не спрацював (рядок змінили між SELECT і UPDATE). */
  skippedConcurrent: number;
  failed: number;
}

export interface BackfillReport {
  mode: "dry-run" | "execute";
  injuries: TableCounters;
  opLog: TableCounters;
}

function newCounters(): TableCounters {
  return {
    scanned: 0,
    needsEncrypt: 0,
    updated: 0,
    skippedConcurrent: 0,
    failed: 0,
  };
}

/** Чистий планер: нове значення для запису, або `null` якщо пропустити. */
export function planNote(value: unknown, ring: KeyRing): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (isEncrypted(value)) return null;
  const next = encryptHealthText(value, ring);
  return next === value ? null : next;
}

interface TableSpec {
  /** SELECT keyset-батча: $1 = останній id (або NULL), $2 = ліміт. */
  select: string;
  /** UPDATE: $1 = id, $2 = нове значення, $3 = старе значення. */
  update: string;
}

// Hard Rule #1: `sync_op_log.id` — BIGSERIAL, pg віддає рядок. Скрипт лише
// передає його назад як курсор і нічого не віддає в API, тож коерсія не
// потрібна; порівняння робиться на боці БД (`$1::bigint`).
const INJURIES_SPEC: TableSpec = {
  select: `SELECT id, note AS value
           FROM fizruk_injuries
           WHERE note <> ''
             AND note NOT LIKE 'enc:v1:%'
             AND note NOT LIKE 'enc:v2:%'
             AND ($1::text IS NULL OR id > $1::text)
           ORDER BY id
           LIMIT $2`,
  update: `UPDATE fizruk_injuries SET note = $2 WHERE id = $1 AND note = $3`,
};

const OP_LOG_SPEC: TableSpec = {
  select: `SELECT id::text AS id, row->>'note' AS value
           FROM sync_op_log
           WHERE table_name = 'fizruk_injuries'
             AND jsonb_typeof(row->'note') = 'string'
             AND row->>'note' <> ''
             AND row->>'note' NOT LIKE 'enc:v1:%'
             AND row->>'note' NOT LIKE 'enc:v2:%'
             AND ($1::bigint IS NULL OR id > $1::bigint)
           ORDER BY id
           LIMIT $2`,
  update: `UPDATE sync_op_log
           SET row = jsonb_set(row, '{note}', to_jsonb($2::text))
           WHERE id = $1::bigint AND row->>'note' = $3`,
};

async function sweepTable(
  db: Queryable,
  spec: TableSpec,
  label: string,
  ring: KeyRing,
  opts: { execute: boolean; batchSize: number },
  out: (line: string) => void,
): Promise<TableCounters> {
  const counters = newCounters();
  let cursor: string | null = null;
  for (;;) {
    const batch = await db.query(spec.select, [cursor, opts.batchSize]);
    if (batch.rows.length === 0) break;
    for (const row of batch.rows) {
      const id = String(row["id"]);
      cursor = id;
      counters.scanned += 1;
      const next = planNote(row["value"], ring);
      if (next === null) continue;
      counters.needsEncrypt += 1;
      if (!opts.execute) continue;
      try {
        const res = await db.query(spec.update, [id, next, row["value"]]);
        if ((res.rowCount ?? 0) === 0) counters.skippedConcurrent += 1;
        else counters.updated += 1;
      } catch (err) {
        counters.failed += 1;
        // Лише id і тип помилки: текст помилки pg може цитувати значення.
        out(
          `  ${label} id=${id} UPDATE failed (${err instanceof Error ? err.name : "error"})`,
        );
      }
    }
    out(
      `${label}: scanned ${counters.scanned}, to-encrypt ${counters.needsEncrypt}`,
    );
    if (batch.rows.length < opts.batchSize) break;
  }
  return counters;
}

/**
 * Ядро бекфілу: детерміноване й без process/env, тож тестується на моку БД.
 * Порядок: спершу `fizruk_injuries`, потім `sync_op_log`.
 */
export async function runBackfill(
  db: Queryable,
  ring: KeyRing,
  opts: { execute: boolean; batchSize: number },
  out: (line: string) => void = () => {},
): Promise<BackfillReport> {
  const injuries = await sweepTable(
    db,
    INJURIES_SPEC,
    "fizruk_injuries",
    ring,
    opts,
    out,
  );
  const opLog = await sweepTable(
    db,
    OP_LOG_SPEC,
    "sync_op_log",
    ring,
    opts,
    out,
  );
  return { mode: opts.execute ? "execute" : "dry-run", injuries, opLog };
}

export function formatReport(r: BackfillReport): string {
  const line = (name: string, c: TableCounters): string =>
    `${name}: scanned=${c.scanned} to-encrypt=${c.needsEncrypt}` +
    (r.mode === "execute"
      ? ` updated=${c.updated} skipped-concurrent=${c.skippedConcurrent} failed=${c.failed}`
      : "");
  return [
    `Mode: ${r.mode}`,
    line("fizruk_injuries.note", r.injuries),
    line("sync_op_log.row.note", r.opLog),
  ].join("\n");
}

const HELP = `
pnpm backfill:health-text — разове шифрування fizruk_injuries.note та
sync_op_log.row.note (fizruk_injuries) для старих plaintext-рядків.

Flags:
  --execute          Записувати зміни. Без нього dry-run (лише лічильники).
  --dry-run          Явний dry-run (це й так значення за замовчуванням).
  --batch-size=<N>   Рядків за SELECT (default ${DEFAULT_BATCH_SIZE}, max ${MAX_BATCH_SIZE}).
  --help, -h         Ця довідка.

Env: BETTER_AUTH_TOKEN_ENC_KEYS / *_CURRENT_VERSION або BETTER_AUTH_TOKEN_ENC_KEY,
     DATABASE_URL.

Exit codes: 0 успіх; 1 аргументи/конфіг; 2 помилка БД; 3 execute і >=1 failed.
`;

async function main(argv: readonly string[]): Promise<number> {
  const result = parseCliArgs(argv);
  if (result.error) {
    process.stderr.write(`backfill-health-text: ${result.error}\n`);
    return 1;
  }
  const parsed = result.parsed;
  if (!parsed || parsed.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const ring = healthTextKeyRing();
  if (!ring) {
    process.stderr.write(
      "backfill-health-text: no key ring configured (BETTER_AUTH_TOKEN_ENC_KEY[S]). Refusing: would leave plaintext.\n",
    );
    return 1;
  }

  const { default: pool } = await import("../db.js");
  const mode = parsed.execute ? "execute" : "dry-run";
  process.stdout.write(
    `backfill-health-text: mode=${mode} batchSize=${parsed.batchSize} key=v${ring.current.version}\n`,
  );
  try {
    const report = await runBackfill(pool, ring, parsed, (l) =>
      process.stdout.write(`${l}\n`),
    );
    process.stdout.write(`\n${formatReport(report)}\n`);
    if (mode === "dry-run") {
      process.stdout.write(
        "\nDry-run: нічого не записано. Додай --execute (повторний запуск безпечний).\n",
      );
    }
    const failed = report.injuries.failed + report.opLog.failed;
    return parsed.execute && failed > 0 ? 3 : 0;
  } catch (err) {
    process.stderr.write(
      `backfill-health-text: unrecoverable error (${err instanceof Error ? err.name : "error"})\n`,
    );
    return 2;
  } finally {
    await pool.end().catch(() => {
      /* best-effort */
    });
  }
}

const isMain =
  process.argv[1]?.endsWith("healthTextBackfill.ts") ||
  process.argv[1]?.endsWith("healthTextBackfill.js");

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `backfill-health-text: top-level crash (${err instanceof Error ? err.name : "error"})\n`,
      );
      process.exit(2);
    });
}
