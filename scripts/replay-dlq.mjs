#!/usr/bin/env node
// scripts/replay-dlq.mjs
//
// AI memory ingest DLQ replay CLI.
//
// Викликає admin-API `POST /api/internal/ai-memory-dlq/replay`, який
// SELECT-ить permanent-fail rows з `ai_memory_ingest_failed` (migration 066)
// і re-enqueue-ить payload-и у BullMQ `ai-memory-ingest` queue.
//
// Use-case: Voyage rate-limited 200 finyk transactions у Mono webhook flow
// → operator робить fix у Voyage account → запускає
// `pnpm replay:dlq --source=finyk --since='2026-05-13' --execute` →
// rows replay-ляться у чергу.
//
// Safety-first defaults:
//   * `--dry-run` за замовчуванням. Operator має явно передати `--execute`.
//   * При відсутності фільтрів — fail (щоб операцію `replay ALL` не запустили помилково).
//   * `--limit` default 100; cap 1000.
//
// Usage:
//
//   pnpm replay:dlq --source=finyk --since='2026-05-13'
//   pnpm replay:dlq --ids=42,43 --execute
//   pnpm replay:dlq --source=chat --execute --limit=50
//   pnpm replay:dlq --list-only --source=finyk
//
// Env:
//   API_BASE_URL       — default `http://localhost:3000`. Production — Railway URL.
//   INTERNAL_API_KEY   — bearer-token для `/api/internal/*`. Обов'язковий.
//
// Exit codes:
//   0  — успішно (dry-run report або всі rows replay-ені).
//   1  — argument / config error.
//   2  — HTTP error (API недоступний / 4xx / 5xx).
//   3  — partial failure (execute mode + ≥1 row-replay не вдався).

import { parseArgs } from "node:util";
import process from "node:process";

const HELP = `
pnpm replay:dlq — AI memory ingest DLQ replay CLI.

Filters (at least one required, окрім --ids; --ids takes precedence):
  --source=<MemorySource>    finyk|chat|digest|cofounder|… — фільтр по source.
  --since=<ISO|date-string>  Replay rows last_attempt_at >= since.
  --ids=<a,b,c>              Comma-separated row-IDs (точкова вибірка).

Modes:
  --execute                  Actually re-enqueue. Без цього — dry-run (default).
  --list-only                Тільки list, без replay (не re-enqueue, не mark replayed_at).
  --limit=<N>                Max rows per call (default 100, max 1000).

Misc:
  --api-base=<url>           Override API base (default: env API_BASE_URL or http://localhost:3000).
  --help, -h                 Show this help.

Env:
  INTERNAL_API_KEY           Bearer token for /api/internal/*. Required.
  API_BASE_URL               Default API base if --api-base not passed.

Examples:
  pnpm replay:dlq --source=finyk --since='2026-05-13'
  pnpm replay:dlq --source=finyk --since='2026-05-13' --execute
  pnpm replay:dlq --ids=42,43 --execute
  pnpm replay:dlq --list-only --source=chat
`;

function die(message, code = 1) {
  process.stderr.write(`replay-dlq: ${message}\n`);
  process.exit(code);
}

export function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      source: { type: "string" },
      since: { type: "string" },
      ids: { type: "string" },
      limit: { type: "string" },
      execute: { type: "boolean", default: false },
      "list-only": { type: "boolean", default: false },
      "api-base": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { help: true };
  }

  let ids;
  if (values.ids) {
    ids = values.ids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const n = Number(s);
        if (!Number.isInteger(n) || n <= 0) {
          return null;
        }
        return n;
      });
    if (ids.some((id) => id === null)) {
      return {
        error: `--ids повинно бути списком позитивних цілих, отримано: "${values.ids}"`,
      };
    }
  }

  let since;
  if (values.since) {
    const d = new Date(values.since);
    if (Number.isNaN(d.getTime())) {
      return {
        error: `--since не валідний date string: "${values.since}". Use ISO або 'YYYY-MM-DD HH:mm'.`,
      };
    }
    since = d.toISOString();
  }

  let limit;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
      return {
        error: `--limit має бути цілим у [1..1000], отримано: "${values.limit}"`,
      };
    }
  }

  const hasFilter =
    (ids && ids.length > 0) ||
    values.source !== undefined ||
    since !== undefined;
  if (!hasFilter) {
    return {
      error:
        "Принаймні один фільтр обов'язковий: --source, --since, або --ids. Pass --help.",
    };
  }

  return {
    ...(values.source !== undefined ? { source: values.source } : {}),
    ...(since ? { since } : {}),
    ...(ids ? { ids } : {}),
    ...(limit !== undefined ? { limit } : {}),
    execute: values.execute,
    listOnly: values["list-only"],
    apiBase: values["api-base"],
  };
}

export function buildRequestBody(parsed) {
  const body = {
    ...(parsed.ids ? { eventIds: parsed.ids } : {}),
    ...(parsed.source ? { source: parsed.source } : {}),
    ...(parsed.since ? { since: parsed.since } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    dryRun: !parsed.execute,
  };
  return body;
}

export function formatListReport(response) {
  const lines = [];
  lines.push(`Found ${response.rows.length} DLQ row(s):`);
  if (response.rows.length === 0) {
    lines.push("  (none — adjust filters)");
    return lines.join("\n");
  }
  lines.push(
    "  id        source       attempts  last_attempt_at               error",
  );
  for (const row of response.rows) {
    const idCol = String(row.id).padEnd(9);
    const srcCol = row.source.padEnd(12);
    const attCol = String(row.attempts).padEnd(9);
    const dateCol = row.lastAttemptAt.padEnd(29);
    const err = (row.errorMsg ?? "").slice(0, 80);
    lines.push(`  ${idCol} ${srcCol} ${attCol} ${dateCol} ${err}`);
  }
  return lines.join("\n");
}

export function formatExecuteReport(response) {
  const lines = [];
  lines.push(
    `Replay report: attempted ${response.attempted}, replayed ${response.replayed}, errors ${response.errors.length}.`,
  );
  if (response.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    for (const e of response.errors) {
      lines.push(`  id=${e.id}: ${e.error}`);
    }
  }
  return lines.join("\n");
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const parsed = parseCliArgs(argv);
  if (parsed.error) {
    die(parsed.error);
  }
  if (parsed.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const apiKey = process.env.INTERNAL_API_KEY;
  if (!apiKey) {
    die(
      "INTERNAL_API_KEY env var is required (bearer token для /api/internal/*).",
    );
  }

  const apiBase =
    parsed.apiBase ?? process.env.API_BASE_URL ?? "http://localhost:3000";

  if (parsed.listOnly) {
    // /list route — read-only, ніколи нічого не replay-ить.
    const listBody = {
      ...(parsed.source ? { source: parsed.source } : {}),
      ...(parsed.since ? { since: parsed.since } : {}),
      ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    };
    const listResp = await callApi(
      apiBase,
      "/api/internal/ai-memory-dlq/list",
      listBody,
      apiKey,
    );
    process.stdout.write(`${formatListReport(listResp)}\n`);
    return 0;
  }

  const body = buildRequestBody(parsed);
  const replayResp = await callApi(
    apiBase,
    "/api/internal/ai-memory-dlq/replay",
    body,
    apiKey,
  );

  if (replayResp.dryRun) {
    process.stdout.write(`${formatListReport(replayResp)}\n\n`);
    process.stdout.write("Pass --execute to actually replay.\n");
    return 0;
  }

  process.stdout.write(`${formatExecuteReport(replayResp)}\n`);
  return replayResp.errors.length > 0 ? 3 : 0;
}

async function callApi(apiBase, path, body, apiKey) {
  const url = `${apiBase.replace(/\/+$/, "")}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    die(`Network error calling ${url}: ${err?.message ?? err}`, 2);
  }

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    die(
      `API повернув не-JSON (HTTP ${response.status}): ${text.slice(0, 200)}`,
      2,
    );
  }

  if (!response.ok) {
    die(
      `API HTTP ${response.status}: ${json.error ?? "unknown"} — ${json.message ?? text}`,
      2,
    );
  }

  return json;
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("replay-dlq.mjs");

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `replay-dlq: unexpected error: ${err?.stack ?? err}\n`,
      );
      process.exit(2);
    });
}
