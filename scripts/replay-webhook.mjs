#!/usr/bin/env node
// scripts/replay-webhook.mjs
//
// PR-29 — Replay CLI для `n8n_webhook_events`.
//
// Викликає admin-API `POST /api/internal/webhook-events/replay`,
// який SELECT-ить replay-кандидати з `n8n_webhook_events` (PR-28
// append-only log) і re-POST-ить payload-и назад у n8n webhook URL.
//
// Use-case: WF-06 (mono-webhook-enrichment) впав на bug-у → operator
// fixить bug → запускає `pnpm replay:webhook --workflow=06-mono-webhook-enrichment
// --since='2026-05-13 12:00' --execute` → події replay-ляться у фіксований n8n.
//
// Safety-first defaults:
//   * `--dry-run` за замовчуванням. Operator має явно передати `--execute`
//     щоб actually replay-нути.
//   * `--workflow` обов'язковий — fail-fast якщо забув.
//   * `--limit` default 100; cap 1000 (server-side validation теж його enforce-ить).
//
// Usage:
//
//   pnpm replay:webhook --workflow=06-mono-webhook-enrichment --since='2026-05-13 12:00'
//   pnpm replay:webhook --workflow=01-billing-pipeline --event-ids=42,43 --execute
//   pnpm replay:webhook --workflow=06-mono-webhook-enrichment --since='2026-05-13T12:00:00Z' --execute --limit=50
//
// Env:
//   API_BASE_URL       — default `http://localhost:3000`. Production — Railway URL.
//   INTERNAL_API_KEY   — bearer-token для `/api/internal/*`. Обов'язковий.
//
// Exit codes:
//   0  — успішно (dry-run report або всі events replay-ені).
//   1  — argument / config error.
//   2  — HTTP error (API недоступний / 4xx / 5xx).
//   3  — partial failure (execute mode + ≥1 event-replay не вдався).

import { parseArgs } from "node:util";
import process from "node:process";

const HELP = `
pnpm replay:webhook — PR-29 webhook events replay CLI.

Required:
  --workflow=<id>            n8n workflow handle (e.g. 06-mono-webhook-enrichment).

Filter (mutually exclusive; --event-ids takes precedence):
  --since=<ISO|date-string>  Replay events received_at >= since. Default: last 24h.
  --event-ids=<a,b,c>        Comma-separated event-ID-и.

Modes:
  --execute                  Actually re-POST payloads. Без цього прапорця — dry-run.
  --limit=<N>                Max events per call (default 100, max 1000).

Misc:
  --api-base=<url>           Override API base (default: env API_BASE_URL or http://localhost:3000).
  --help, -h                 Show this help.

Env:
  INTERNAL_API_KEY           Bearer token for /api/internal/*. Required.
  API_BASE_URL               Default API base if --api-base not passed.

Examples:
  pnpm replay:webhook --workflow=06-mono-webhook-enrichment
  pnpm replay:webhook --workflow=01-billing-pipeline --since='2026-05-13T12:00:00Z' --execute
  pnpm replay:webhook --workflow=02-failed-payment-recovery --event-ids=101,102 --execute
`;

function die(message, code = 1) {
  process.stderr.write(`replay-webhook: ${message}\n`);
  process.exit(code);
}

export function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      workflow: { type: "string" },
      since: { type: "string" },
      "event-ids": { type: "string" },
      limit: { type: "string" },
      execute: { type: "boolean", default: false },
      "api-base": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { help: true };
  }

  if (!values.workflow) {
    return { error: "--workflow is required. Pass --help for usage." };
  }

  let eventIds;
  if (values["event-ids"]) {
    eventIds = values["event-ids"]
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
    if (eventIds.some((id) => id === null)) {
      return {
        error: `--event-ids повинно бути списком позитивних цілих, отримано: "${values["event-ids"]}"`,
      };
    }
  }

  let since;
  if (values.since) {
    // Поки HTTP API хоче ISO datetime, але operator-у зручніше
    // 'YYYY-MM-DD HH:mm' — конвертуємо тут.
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

  return {
    workflowId: values.workflow,
    ...(since ? { since } : {}),
    ...(eventIds ? { eventIds } : {}),
    ...(limit !== undefined ? { limit } : {}),
    execute: values.execute,
    apiBase: values["api-base"],
  };
}

export function buildRequestBody(parsed) {
  return {
    workflowId: parsed.workflowId,
    ...(parsed.eventIds ? { eventIds: parsed.eventIds } : {}),
    ...(parsed.since ? { since: parsed.since } : {}),
    ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
    dryRun: !parsed.execute,
  };
}

export function formatDryRunReport(response) {
  const lines = [];
  lines.push(`Dry-run for workflow_id=${response.workflowId}`);
  lines.push(`Found ${response.count} replay candidate(s):`);
  if (response.count === 0) {
    lines.push("  (none — adjust --since or --event-ids)");
    return lines.join("\n");
  }
  lines.push(
    "  id          received_at                   processed?  replays  source",
  );
  for (const e of response.events) {
    const idCol = String(e.id).padEnd(11);
    const recCol = e.receivedAt.padEnd(29);
    const procCol = (e.processedAt ? "yes" : "no ").padEnd(11);
    const cntCol = String(e.replayCount).padEnd(8);
    lines.push(`  ${idCol} ${recCol} ${procCol} ${cntCol} ${e.source}`);
  }
  lines.push("");
  lines.push("Pass --execute to actually replay.");
  return lines.join("\n");
}

export function formatExecuteReport(response) {
  const lines = [];
  lines.push(`Execute report for workflow_id=${response.workflowId}`);
  lines.push(
    `Total ${response.total}, success ${response.successes}, fail ${response.failures}.`,
  );
  if (response.total === 0) {
    return lines.join("\n");
  }
  lines.push("  id          result   detail");
  for (const o of response.outcomes) {
    const idCol = String(o.id).padEnd(11);
    if (o.ok) {
      lines.push(
        `  ${idCol} ok       HTTP ${o.status} (replay_count → ${o.replayCount})`,
      );
    } else {
      lines.push(`  ${idCol} fail     ${o.code}: ${o.message}`);
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

  const body = buildRequestBody(parsed);
  const url = `${apiBase.replace(/\/+$/, "")}/api/internal/webhook-events/replay`;

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

  if (json.dryRun) {
    process.stdout.write(`${formatDryRunReport(json)}\n`);
    return 0;
  }

  process.stdout.write(`${formatExecuteReport(json)}\n`);
  return json.failures > 0 ? 3 : 0;
}

// Запускається CLI-mode (не як import). Сумісно з ESM `import.meta.url`.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("replay-webhook.mjs");

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `replay-webhook: unexpected error: ${err?.stack ?? err}\n`,
      );
      process.exit(2);
    });
}
