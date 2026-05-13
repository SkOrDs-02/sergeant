#!/usr/bin/env node
// scripts/db-index-audit.mjs
//
// DB index audit — query `pg_stat_user_indexes` + `pg_stat_user_tables`
// проти підключеної БД (dev, staging, або prod-replica) і згенерувати
// markdown-snapshot для manual review.
//
// Задача — не "автоматично виправити", а підсвітити ДЕ глянути:
//
//   1. Heavy seq-scan tables — `pg_stat_user_tables.seq_scan` високий,
//      `idx_scan` низький. Сигнал «треба додати index».
//   2. Unused indexes — `idx_scan = 0` (і таблиця не порожня + не нещодавно
//      створена). Сигнал «можливо drop кандидат».
//   3. Duplicate / overlapping indexes — той самий префікс колонок у двох
//      індексах однієї таблиці. Сигнал «один з них зайвий».
//
// Скрипт **тільки читає**. Жодних `CREATE INDEX` / `DROP INDEX` —
// рішення приймає людина після review-у.
//
// Usage:
//   DATABASE_URL=postgresql://user:pass@host:5432/db \
//     node scripts/db-index-audit.mjs > report.md
//
//   # або у repo (запис у docs/runbooks/db-index-audit-YYYY-MM-DD.md):
//   DATABASE_URL=... node scripts/db-index-audit.mjs --write
//
// Hard Rule #4 не зачіпається — це read-only audit. Hard Rule #21
// (Pino redaction) — DATABASE_URL ніколи не друкується (тільки `host:port`
// без credentials у header report-у).
//
// Runbook: `docs/runbooks/operations-runbook.md § 9` (index hygiene).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const DEFAULT_TOP_N = 20;
const DEFAULT_MIN_TABLE_ROWS = 1000;
const DEFAULT_MIN_SEQ_SCAN_RATIO = 0.5;
const DEFAULT_MIN_UNUSED_SCANS = 0;

/**
 * Strip credentials from a libpq connection string so the report-у можна
 * згадати, проти якого host-а він знятий, не leakaючи password.
 *
 *   "postgresql://user:pass@db.example.com:5432/hub" →
 *     "postgresql://***@db.example.com:5432/hub"
 *
 * Для не-URL форматів (key=value libpq DSN) повертаємо
 * `"<credentials redacted>"` — простіше і точно безпечно.
 */
export function redactConnectionString(s) {
  if (typeof s !== "string" || s.length === 0) {
    return "<unset>";
  }
  try {
    const url = new URL(s);
    return `${url.protocol}//***@${url.host}${url.pathname}`;
  } catch {
    return "<credentials redacted>";
  }
}

/**
 * Detect overlapping indexes on the same table.
 *
 * Дві defs «overlap», якщо одна з них починається з префікса колонок іншої.
 * Це rough-heuristic: справжня Postgres-семантика залежить від index-method,
 * ordering, INCLUDE-stored columns. Тому audit лише підсвічує кандидатів,
 * а рішення «справді dup чи ні» — за людиною.
 *
 * Кожен input record має shape:
 *   { schemaName, tableName, indexName, columnNames: string[] }
 *
 * Output: масив пар (a, b), де `a.columnNames` — префікс `b.columnNames`
 * (або вони рівні, в такому разі повертаємо їх обидві).
 */
export function findOverlappingIndexes(records) {
  const byTable = new Map();
  for (const rec of records) {
    const key = `${rec.schemaName}.${rec.tableName}`;
    if (!byTable.has(key)) byTable.set(key, []);
    byTable.get(key).push(rec);
  }

  const overlaps = [];
  for (const [, indexes] of byTable) {
    for (let i = 0; i < indexes.length; i++) {
      for (let j = i + 1; j < indexes.length; j++) {
        const a = indexes[i];
        const b = indexes[j];
        if (a.columnNames.length === 0 || b.columnNames.length === 0) continue;
        const shorter = a.columnNames.length <= b.columnNames.length ? a : b;
        const longer = shorter === a ? b : a;
        let isPrefix = true;
        for (let k = 0; k < shorter.columnNames.length; k++) {
          if (shorter.columnNames[k] !== longer.columnNames[k]) {
            isPrefix = false;
            break;
          }
        }
        if (isPrefix) {
          overlaps.push({ shorter, longer });
        }
      }
    }
  }
  return overlaps;
}

/**
 * Sort and limit "heavy seq-scan" candidates by absolute number of
 * sequential scans. Включаємо тільки таблиці, де `liveRows >= minRows`
 * (порожні / щойно створені таблиці завжди seq-scan-яться — це noise)
 * і `seqScans / max(idxScans, 1) >= minSeqRatio` (таблиці зі здоровим
 * mix-ом seq/idx пропускаємо).
 */
export function rankSeqScanCandidates(rows, options = {}) {
  const minRows = options.minRows ?? DEFAULT_MIN_TABLE_ROWS;
  const minSeqRatio = options.minSeqRatio ?? DEFAULT_MIN_SEQ_SCAN_RATIO;
  const topN = options.topN ?? DEFAULT_TOP_N;

  return rows
    .filter((r) => Number(r.liveRows) >= minRows)
    .filter((r) => {
      const seq = Number(r.seqScans);
      const idx = Number(r.idxScans);
      const ratio = seq / Math.max(idx, 1);
      return ratio >= minSeqRatio && seq > 0;
    })
    .sort((a, b) => Number(b.seqScans) - Number(a.seqScans))
    .slice(0, topN);
}

/**
 * Filter unused indexes: `idx_scan <= minUnusedScans` AND `is_unique = false`
 * (UNIQUE constraints / primary keys беремо тільки для info, але не
 * рекомендуємо drop — вони enforce data integrity, не лише прискорюють
 * lookup-и). Сортуємо за `indexSizeBytes desc` — найбільші waste-кандидати
 * першими.
 */
export function rankUnusedIndexCandidates(rows, options = {}) {
  const minScans = options.minScans ?? DEFAULT_MIN_UNUSED_SCANS;
  const topN = options.topN ?? DEFAULT_TOP_N;

  return rows
    .filter((r) => Number(r.idxScans) <= minScans)
    .filter((r) => !r.isUnique && !r.isPrimary)
    .sort((a, b) => Number(b.indexSizeBytes) - Number(a.indexSizeBytes))
    .slice(0, topN);
}

const SEQ_SCAN_QUERY = `
  SELECT
    schemaname              AS schema_name,
    relname                 AS table_name,
    seq_scan                AS seq_scans,
    seq_tup_read            AS seq_tup_read,
    idx_scan                AS idx_scans,
    n_live_tup              AS live_rows,
    pg_total_relation_size(relid::regclass)::bigint AS table_size_bytes
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY seq_scan DESC NULLS LAST
`;

const UNUSED_INDEX_QUERY = `
  SELECT
    s.schemaname                                AS schema_name,
    s.relname                                   AS table_name,
    s.indexrelname                              AS index_name,
    s.idx_scan                                  AS idx_scans,
    pg_relation_size(s.indexrelid)::bigint      AS index_size_bytes,
    idx.indisunique                             AS is_unique,
    idx.indisprimary                            AS is_primary
  FROM pg_stat_user_indexes s
  JOIN pg_index idx ON idx.indexrelid = s.indexrelid
  WHERE s.schemaname = 'public'
  ORDER BY pg_relation_size(s.indexrelid) DESC NULLS LAST
`;

const INDEX_COLUMNS_QUERY = `
  SELECT
    n.nspname                              AS schema_name,
    t.relname                              AS table_name,
    i.relname                              AS index_name,
    array_agg(a.attname::text ORDER BY ord.ord)::text[] AS column_names
  FROM pg_class t
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_index ix ON ix.indrelid = t.oid
  JOIN pg_class i  ON i.oid = ix.indexrelid
  JOIN unnest(ix.indkey) WITH ORDINALITY AS ord(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ord.attnum
  WHERE n.nspname = 'public'
    AND NOT ix.indisprimary
  GROUP BY n.nspname, t.relname, i.relname
  ORDER BY t.relname, i.relname
`;

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return String(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Build the markdown report. Inputs already filtered + sorted by the
 * rank* helpers. The date stamp is parameterized so unit tests don't
 * depend on `new Date()`.
 */
export function renderMarkdownReport({
  generatedAt,
  connection,
  seqScanCandidates,
  unusedIndexCandidates,
  overlappingIndexes,
}) {
  const dateStr =
    generatedAt instanceof Date
      ? generatedAt.toISOString().slice(0, 10)
      : String(generatedAt);

  const lines = [];
  lines.push(`# DB index audit — ${dateStr}`);
  lines.push("");
  lines.push(
    "> **Last validated:** " +
      dateStr +
      " by Devin. **Next review:** " +
      dateStr +
      ".",
  );
  lines.push("> **Status:** Active (one-time snapshot)");
  lines.push("");
  lines.push(`Generated against: \`${connection}\``);
  lines.push("");
  lines.push(
    "Цей snapshot — **read-only audit**. Жоден index не змінюється " +
      "автоматично. Recipe для manual review + decision-criteria — " +
      "[`operations-runbook.md § 9`](./operations-runbook.md#9-index-hygiene).",
  );
  lines.push("");

  lines.push("## 1. Heavy seq-scan tables (potentially missing indexes)");
  lines.push("");
  lines.push(
    "Таблиці з високим `seq_scan` і низьким `idx_scan`. **Кандидат на " +
      "новий index**, але перед `CREATE INDEX` перевір: (а) чи це часті " +
      "запити чи разові full-table-scans (analytics / backfill), (б) чи " +
      "не break-не вже існуючий план (`EXPLAIN ANALYZE`).",
  );
  lines.push("");
  if (seqScanCandidates.length === 0) {
    lines.push("_No tables matched the threshold._");
  } else {
    lines.push("| Table | seq_scan | idx_scan | live_rows | table_size |");
    lines.push("| ----- | -------- | -------- | --------- | ---------- |");
    for (const r of seqScanCandidates) {
      lines.push(
        `| \`${r.schemaName}.${r.tableName}\` | ${r.seqScans} | ${r.idxScans} | ${r.liveRows} | ${formatBytes(r.tableSizeBytes)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## 2. Unused indexes (potential drop candidates)");
  lines.push("");
  lines.push(
    "Indexes з `idx_scan = 0` (тобто Postgres не використав їх з моменту " +
      "останнього `pg_stat_reset()`). UNIQUE / PRIMARY indexes виключені — " +
      "вони enforce-ять integrity. Перевір: (а) скільки часу пройшло з " +
      "останнього stat reset (`SELECT stats_reset FROM pg_stat_database`) " +
      "— якщо < 7 днів, snapshot ненадійний, (б) чи цей index покриває " +
      "інший — duplicate-section нижче, (в) чи цей index ще не activated " +
      "feature flag-ом.",
  );
  lines.push("");
  if (unusedIndexCandidates.length === 0) {
    lines.push("_No unused indexes found._");
  } else {
    lines.push("| Index | Table | idx_scan | size |");
    lines.push("| ----- | ----- | -------- | ---- |");
    for (const r of unusedIndexCandidates) {
      lines.push(
        `| \`${r.indexName}\` | \`${r.tableName}\` | ${r.idxScans} | ${formatBytes(r.indexSizeBytes)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## 3. Overlapping indexes (one column-prefix shadows another)");
  lines.push("");
  lines.push(
    "Дві indexes на тій самій table, де column-list однієї — префікс " +
      "другої. Коротший — потенційно redundant (Postgres planner може " +
      "використати довший для тих самих lookup-ів). Винятки: (а) shorter " +
      "має INCLUDE-stored columns longer не має, (б) INDEX methods різні " +
      "(btree vs gin), (в) WHERE-clause partial index.",
  );
  lines.push("");
  if (overlappingIndexes.length === 0) {
    lines.push("_No overlapping indexes found._");
  } else {
    lines.push("| Table | Shorter (potentially redundant) | Longer |");
    lines.push("| ----- | ------------------------------- | ------ |");
    for (const pair of overlappingIndexes) {
      const tbl = `${pair.shorter.schemaName}.${pair.shorter.tableName}`;
      const shortCols = pair.shorter.columnNames.join(", ");
      const longCols = pair.longer.columnNames.join(", ");
      lines.push(
        `| \`${tbl}\` | \`${pair.shorter.indexName}\` (${shortCols}) | \`${pair.longer.indexName}\` (${longCols}) |`,
      );
    }
  }
  lines.push("");

  lines.push("## How to act on this report");
  lines.push("");
  lines.push("Для кожного row у секціях 1-3 ухвали одне з трьох рішень:");
  lines.push("");
  lines.push(
    "- **Add index / Drop index / Drop redundant** — створи окремий PR з " +
      "`feat(server):` / `chore(server):` scope. Migration файл повинен " +
      "відповідати Hard Rule #4. Якщо це Phase 2 DROP — використай " +
      "новий `-- TWO-PHASE-DROP:` header (див. [runbook § 8.2](./operations-runbook.md#82-two-phase-drop-authoring)).",
  );
  lines.push(
    "- **Keep as-is** — додай рядок у `## Triage notes` нижче з обґрунтуванням " +
      "(`audit-only` / `seasonal traffic` / `enforces uniqueness`).",
  );
  lines.push(
    "- **Defer** — якщо потрібно більше даних (`pg_stat_reset()` + 7d wait, " +
      "або production-replica analysis) — створи issue.",
  );
  lines.push("");

  lines.push("## Triage notes");
  lines.push("");
  lines.push("<!-- Заповнюй у міру review-у. -->");
  lines.push("");

  return lines.join("\n") + "\n";
}

async function fetchSeqScanRows(client) {
  const r = await client.query(SEQ_SCAN_QUERY);
  return r.rows.map((row) => ({
    schemaName: row.schema_name,
    tableName: row.table_name,
    seqScans: row.seq_scans,
    seqTupRead: row.seq_tup_read,
    idxScans: row.idx_scans,
    liveRows: row.live_rows,
    tableSizeBytes: row.table_size_bytes,
  }));
}

async function fetchUnusedIndexRows(client) {
  const r = await client.query(UNUSED_INDEX_QUERY);
  return r.rows.map((row) => ({
    schemaName: row.schema_name,
    tableName: row.table_name,
    indexName: row.index_name,
    idxScans: row.idx_scans,
    indexSizeBytes: row.index_size_bytes,
    isUnique: row.is_unique,
    isPrimary: row.is_primary,
  }));
}

async function fetchIndexColumnsRows(client) {
  const r = await client.query(INDEX_COLUMNS_QUERY);
  return r.rows.map((row) => ({
    schemaName: row.schema_name,
    tableName: row.table_name,
    indexName: row.index_name,
    columnNames: row.column_names ?? [],
  }));
}

export async function runAudit(client, options = {}) {
  const seqRows = await fetchSeqScanRows(client);
  const unusedRows = await fetchUnusedIndexRows(client);
  const idxColRows = await fetchIndexColumnsRows(client);

  return {
    seqScanCandidates: rankSeqScanCandidates(seqRows, options),
    unusedIndexCandidates: rankUnusedIndexCandidates(unusedRows, options),
    overlappingIndexes: findOverlappingIndexes(idxColRows),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const shouldWrite = argv.includes("--write");
  const connectionString =
    process.env.DATABASE_URL_AUDIT ?? process.env.DATABASE_URL ?? "";

  if (!connectionString) {
    console.error(
      "❌ DATABASE_URL (or DATABASE_URL_AUDIT) is required to run the audit.",
    );
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  let report;
  try {
    const { seqScanCandidates, unusedIndexCandidates, overlappingIndexes } =
      await runAudit(client);
    report = renderMarkdownReport({
      generatedAt: new Date(),
      connection: redactConnectionString(connectionString),
      seqScanCandidates,
      unusedIndexCandidates,
      overlappingIndexes,
    });
  } finally {
    await client.end();
  }

  if (shouldWrite) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const outPath = join(
      REPO_ROOT,
      "docs",
      "runbooks",
      `db-index-audit-${dateStr}.md`,
    );
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, report, "utf8");
    console.error(`✅ Wrote ${outPath}`);
  } else {
    process.stdout.write(report);
  }
}

const isDirectInvocation = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  main().catch((err) => {
    console.error("❌ db-index-audit failed:", err);
    process.exit(1);
  });
}
