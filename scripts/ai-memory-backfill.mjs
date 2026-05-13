#!/usr/bin/env node
// scripts/ai-memory-backfill.mjs
//
// AI memory backfill CLI (PR-21 follow-up).
//
// Контекст: PR-19 (#2605) активував `MONO_AI_MEMORY_INGEST_ENABLED` —
// з того моменту нові finyk/chat/etc писалися у `ai_memories` через
// BullMQ `ai-memory-ingest` queue. Старі повідомлення з
// `tg_topic_archive` (alerts, persona posts) залишилися без embedding-у —
// `/recall` semantic-пошук їх не бачить. Цей CLI запускає orchestration-
// endpoint-и на server (`/api/internal/ai-memory/backfill/{start,batch,
// finalize}`), які виконують chunked BullMQ enqueue з resumable state у
// `ai_memory_backfill_state` (migration 063).
//
// Usage:
//
//   pnpm ai-memory:backfill --founder=<userId> --days=90
//   pnpm ai-memory:backfill --founder=<userId> --days=90 --dry-run
//   pnpm ai-memory:backfill --founder=<userId> --days=30 --batch=50 --execute
//   pnpm ai-memory:backfill --resume-state-id=42 --founder=<userId> --execute
//
// Safety-first defaults:
//   * Якщо ні `--dry-run`, ні `--execute` — поведінка `--dry-run`.
//   * Cost-estimate проти `VOYAGE_DAILY_BUDGET_USD_SOFT` робиться на
//     server-side у `startBackfill()`. Якщо estimate > budget — server
//     повертає `status='aborted_budget'`, CLI друкує hint і exit 4.
//   * Прогрес-лог раз на 100 batches; інтерактивний counter — раз на
//     batch коли `stderr.isTTY`.
//
// Env:
//   API_BASE_URL       — default `http://localhost:3000`. Production —
//                        Railway URL.
//   INTERNAL_API_KEY   — bearer-token для `/api/internal/*`. Обов'язковий.
//
// Exit codes:
//   0  — успіх (dry-run report або всі rows enqueued).
//   1  — argument / config error.
//   2  — HTTP error (API недоступний / 4xx / 5xx).
//   3  — partial failure (≥1 batch не вдався під час execute).
//   4  — budget exceeded (estimated cost > VOYAGE_DAILY_BUDGET_USD_SOFT).

import { parseArgs } from "node:util";
import process from "node:process";

/**
 * Progress-log frequency: log to stdout every Nth batch when running
 * non-TTY (e.g. pipe to file). TTY-режим оновлює inline counter кожен
 * batch.
 */
const PROGRESS_BATCH_INTERVAL = 100;

const HELP = `
pnpm ai-memory:backfill — AI memory backfill CLI (PR-21 follow-up).

Required:
  --founder=<userId>        Better Auth user.id founder-а
                            (обов'язковий, ADR-0031 §3 — cofounder source).

Run mode (exactly one):
  --dry-run                 Cost-estimate only (default if neither passed).
  --execute                 Actually enqueue до BullMQ ai-memory-ingest.

Resume:
  --resume-state-id=<N>     Resume з існуючого state row (skip /start).

Window / batching (ігноруються коли --resume-state-id):
  --days=<N>                Window — process rows з останніх N днів
                            (default 90, max 365).
  --source=<mode>           'cofounder' (default) або 'all' (not yet
                            implemented).
  --batch=<N>               Chunk size (default 100, max 1000).
  --topic=<csv>             Comma-separated topic-allowlist (опційно).

Misc:
  --api-base=<url>          Override API base (default: env
                            API_BASE_URL or http://localhost:3000).
  --help, -h                Show this help.

Env:
  INTERNAL_API_KEY          Bearer token. Required.
  API_BASE_URL              Default API base.

Examples:
  pnpm ai-memory:backfill --founder=user-abc --days=90 --dry-run
  pnpm ai-memory:backfill --founder=user-abc --days=30 --batch=50 --execute
  pnpm ai-memory:backfill --resume-state-id=42 --founder=user-abc --execute
`;

function die(message, code = 1) {
  process.stderr.write(`ai-memory-backfill: ${message}\n`);
  process.exit(code);
}

export function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      founder: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      execute: { type: "boolean", default: false },
      "resume-state-id": { type: "string" },
      days: { type: "string" },
      source: { type: "string" },
      batch: { type: "string" },
      topic: { type: "string" },
      "api-base": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) return { help: true };

  if (values["dry-run"] && values.execute) {
    return {
      error: "--dry-run and --execute є взаємовиключними. Pass --help.",
    };
  }
  // Default behavior: якщо ні --dry-run, ні --execute не передані —
  // safe-default dry-run (так само як у replay-webhook.mjs).
  const isDryRun = values["dry-run"] || !values.execute;

  if (!values.founder) {
    return { error: "--founder=<userId> is required. Pass --help." };
  }

  let resumeStateId;
  if (values["resume-state-id"] !== undefined) {
    const n = Number(values["resume-state-id"]);
    if (!Number.isInteger(n) || n <= 0) {
      return {
        error: `--resume-state-id має бути позитивним цілим, отримано: "${values["resume-state-id"]}"`,
      };
    }
    resumeStateId = n;
  }

  let days = 90;
  if (values.days !== undefined) {
    const n = Number(values.days);
    if (!Number.isInteger(n) || n <= 0 || n > 365) {
      return {
        error: `--days має бути цілим у [1..365], отримано: "${values.days}"`,
      };
    }
    days = n;
  }

  const source = values.source ?? "cofounder";
  if (source !== "cofounder" && source !== "all") {
    return {
      error: `--source має бути 'cofounder' або 'all', отримано: "${source}"`,
    };
  }

  let batch = 100;
  if (values.batch !== undefined) {
    const n = Number(values.batch);
    if (!Number.isInteger(n) || n <= 0 || n > 1000) {
      return {
        error: `--batch має бути цілим у [1..1000], отримано: "${values.batch}"`,
      };
    }
    batch = n;
  }

  let topicFilter;
  if (values.topic !== undefined) {
    topicFilter = values.topic
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (topicFilter.length === 0) {
      return {
        error: `--topic пустий — щоб не передавати фільтр, прибери прапор.`,
      };
    }
  }

  return {
    founderUserId: values.founder,
    dryRun: isDryRun,
    ...(resumeStateId !== undefined ? { resumeStateId } : {}),
    days,
    source,
    batch,
    ...(topicFilter ? { topicFilter } : {}),
    apiBase: values["api-base"],
  };
}

/**
 * Build POST body for `/backfill/start`. Exported for tests.
 */
export function buildStartBody(parsed) {
  return {
    founderUserId: parsed.founderUserId,
    daysWindow: parsed.days,
    sourceMode: parsed.source,
    batchSize: parsed.batch,
    dryRun: parsed.dryRun,
    ...(parsed.topicFilter ? { topicFilter: parsed.topicFilter } : {}),
  };
}

/**
 * Format cost estimate як USD з 4-значним precision.
 * Pure helper exported для unit-test-ів.
 */
export function formatCostUsd(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.0000";
  return `$${usd.toFixed(4)}`;
}

/**
 * Format start-response як operator-readable summary.
 */
export function formatStartReport(startOut, parsed) {
  const lines = [];
  lines.push(`AI memory backfill — ${parsed.dryRun ? "DRY-RUN" : "EXECUTE"}`);
  lines.push(`  founder:           ${parsed.founderUserId}`);
  lines.push(`  state_id:          ${startOut.stateId}`);
  lines.push(`  days_window:       ${parsed.days}`);
  lines.push(`  source_mode:       ${parsed.source}`);
  lines.push(`  batch_size:        ${parsed.batch}`);
  lines.push(`  total_candidates:  ${startOut.totalCandidates}`);
  lines.push(
    `  estimated_cost:    ${formatCostUsd(startOut.estimatedCostUsd)} ` +
      `(soft budget: ${formatCostUsd(startOut.voyageBudgetSoftUsd)})`,
  );
  lines.push(`  status:            ${startOut.status}`);
  if (startOut.budgetExceeded) {
    lines.push("");
    lines.push(
      `  ⚠ estimated cost exceeds VOYAGE_DAILY_BUDGET_USD_SOFT — backfill ABORTED.`,
    );
    lines.push(
      `    Either raise the budget env-var, --days down, or --topic to a subset.`,
    );
  }
  return lines.join("\n");
}

async function postJson(url, body, apiKey) {
  let res;
  try {
    res = await fetch(url, {
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
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    die(`API повернув не-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`, 2);
  }
  if (!res.ok) {
    die(
      `API HTTP ${res.status}: ${json.error ?? "unknown"} — ${json.message ?? text.slice(0, 200)}`,
      2,
    );
  }
  return json;
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const parsed = parseCliArgs(argv);
  if (parsed.error) die(parsed.error);
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
  const base = apiBase.replace(/\/+$/, "");

  // 1) /start (skipped on resume).
  let stateId;
  let startOut;
  if (parsed.resumeStateId !== undefined) {
    // Synthesize startOut shape for downstream messaging.
    stateId = parsed.resumeStateId;
    startOut = {
      stateId,
      totalCandidates: -1,
      estimatedCostUsd: -1,
      status: "running",
      budgetExceeded: false,
      voyageBudgetSoftUsd: -1,
    };
    process.stdout.write(
      `Resuming backfill state_id=${stateId} for founder=${parsed.founderUserId}\n`,
    );
  } else {
    startOut = await postJson(
      `${base}/api/internal/ai-memory/backfill/start`,
      buildStartBody(parsed),
      apiKey,
    );
    stateId = startOut.stateId;
    process.stdout.write(`${formatStartReport(startOut, parsed)}\n`);

    if (startOut.budgetExceeded) {
      return 4;
    }
    if (parsed.dryRun) {
      return 0;
    }
  }

  // 2) /batch loop.
  let batchesRun = 0;
  let cumulativeProcessed = 0;
  let cumulativeEnqueued = 0;
  let cumulativeSkippedDedup = 0;
  let hasMore = true;

  while (hasMore) {
    const batchOut = await postJson(
      `${base}/api/internal/ai-memory/backfill/batch`,
      { stateId, founderUserId: parsed.founderUserId },
      apiKey,
    );
    batchesRun += 1;
    cumulativeProcessed = batchOut.cumulativeProcessed;
    cumulativeEnqueued = batchOut.cumulativeEnqueued;
    cumulativeSkippedDedup += batchOut.skippedDedupInBatch;
    hasMore = batchOut.hasMore;

    const isMilestone =
      batchesRun === 1 ||
      batchesRun % PROGRESS_BATCH_INTERVAL === 0 ||
      !hasMore;
    const ttyTick = process.stderr.isTTY && !isMilestone;
    const line =
      `  batch=${batchesRun} processed=${cumulativeProcessed} ` +
      `enqueued=${cumulativeEnqueued} skipped_dedup=${cumulativeSkippedDedup} ` +
      `cursor=${batchOut.lastProcessedId} hasMore=${hasMore}`;
    if (ttyTick) {
      process.stderr.write(`\r${line}    `);
    } else {
      if (process.stderr.isTTY) process.stderr.write("\r");
      process.stdout.write(`${line}\n`);
    }
  }

  // 3) /finalize.
  await postJson(
    `${base}/api/internal/ai-memory/backfill/finalize`,
    {
      stateId,
      founderUserId: parsed.founderUserId,
      status: "completed",
    },
    apiKey,
  );
  process.stdout.write(
    `Backfill state_id=${stateId} COMPLETED — ${cumulativeEnqueued} enqueued, ${cumulativeProcessed} processed across ${batchesRun} batches.\n`,
  );
  return 0;
}

// Entry-point gate — пропускає `main()` коли скрипт викликаний як CLI,
// але не коли імпортуєма з vitest-у.
const isCli =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("ai-memory-backfill.mjs");
if (isCli) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`Unhandled error: ${err?.stack ?? err}\n`);
      process.exit(2);
    });
}
