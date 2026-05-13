// scripts/__tests__/replay-webhook.test.mjs
//
// Unit tests для CLI у `scripts/replay-webhook.mjs` (PR-29).
//
// Import-mode (без spawn-у Node-процеса) — ми тестуємо лише argument
// parsing, request-body builder і output-formatter; HTTP-частина
// (POST на /api/internal/...) має дедикований route-test на server-боці.
//
// Run with:  node --test scripts/__tests__/replay-webhook.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCliArgs,
  buildRequestBody,
  formatDryRunReport,
  formatExecuteReport,
} from "../replay-webhook.mjs";

test("parseCliArgs: --help → help: true", () => {
  const r = parseCliArgs(["--help"]);
  assert.equal(r.help, true);
});

test("parseCliArgs: missing --workflow → error", () => {
  const r = parseCliArgs([]);
  assert.match(r.error, /--workflow is required/);
});

test("parseCliArgs: --workflow only → dry-run defaults", () => {
  const r = parseCliArgs(["--workflow=06-mono-webhook-enrichment"]);
  assert.equal(r.workflowId, "06-mono-webhook-enrichment");
  assert.equal(r.execute, false);
  assert.equal(r.since, undefined);
  assert.equal(r.eventIds, undefined);
});

test("parseCliArgs: --since accepts ISO + non-ISO date strings", () => {
  const a = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--since=2026-05-13T12:00:00.000Z",
  ]);
  assert.equal(a.since, "2026-05-13T12:00:00.000Z");

  const b = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--since=2026-05-13 12:00",
  ]);
  // Browser-style space-separated; Date parses it → ISO у запиті.
  assert.ok(b.since && b.since.startsWith("2026-05-13"));
});

test("parseCliArgs: --since invalid → error", () => {
  const r = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--since=not-a-date",
  ]);
  assert.match(r.error, /--since не валідний/);
});

test("parseCliArgs: --event-ids splits commas; rejects non-positive int", () => {
  const r = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--event-ids=10,20,30",
  ]);
  assert.deepEqual(r.eventIds, [10, 20, 30]);

  const bad = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--event-ids=10,foo,30",
  ]);
  assert.match(bad.error, /--event-ids/);
});

test("parseCliArgs: --limit must be 1..1000", () => {
  const ok = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--limit=50",
  ]);
  assert.equal(ok.limit, 50);

  const tooBig = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--limit=2000",
  ]);
  assert.match(tooBig.error, /--limit/);

  const zero = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--limit=0",
  ]);
  assert.match(zero.error, /--limit/);
});

test("parseCliArgs: --execute is a boolean flag", () => {
  const r = parseCliArgs([
    "--workflow=06-mono-webhook-enrichment",
    "--execute",
  ]);
  assert.equal(r.execute, true);
});

test("buildRequestBody: omits empty fields; sets dryRun=!execute", () => {
  const body = buildRequestBody({
    workflowId: "06-mono-webhook-enrichment",
    execute: false,
  });
  assert.deepEqual(body, {
    workflowId: "06-mono-webhook-enrichment",
    dryRun: true,
  });

  const body2 = buildRequestBody({
    workflowId: "06-mono-webhook-enrichment",
    since: "2026-05-13T12:00:00.000Z",
    eventIds: [10, 20],
    limit: 50,
    execute: true,
  });
  assert.deepEqual(body2, {
    workflowId: "06-mono-webhook-enrichment",
    since: "2026-05-13T12:00:00.000Z",
    eventIds: [10, 20],
    limit: 50,
    dryRun: false,
  });
});

test("formatDryRunReport: empty count shows '(none)' hint", () => {
  const out = formatDryRunReport({
    workflowId: "06-mono-webhook-enrichment",
    count: 0,
    events: [],
  });
  assert.match(out, /Dry-run for workflow_id=06-mono-webhook-enrichment/);
  assert.match(out, /\(none — adjust --since or --event-ids\)/);
});

test("formatDryRunReport: rows show id, received_at, processed?, replays, source", () => {
  const out = formatDryRunReport({
    workflowId: "06-mono-webhook-enrichment",
    count: 2,
    events: [
      {
        id: 42,
        source: "mono",
        receivedAt: "2026-05-13T12:00:00.000Z",
        processedAt: null,
        replayCount: 0,
      },
      {
        id: 43,
        source: "mono",
        receivedAt: "2026-05-13T13:00:00.000Z",
        processedAt: "2026-05-13T13:00:01.000Z",
        replayCount: 2,
      },
    ],
  });
  assert.match(out, /Found 2 replay candidate/);
  assert.match(out, /42/);
  assert.match(out, /43/);
  assert.match(out, /no /); // unprocessed
  assert.match(out, /yes/); // processed
  assert.match(out, /Pass --execute to actually replay/);
});

test("formatExecuteReport: counts + per-event detail", () => {
  const out = formatExecuteReport({
    workflowId: "06-mono-webhook-enrichment",
    total: 3,
    successes: 2,
    failures: 1,
    outcomes: [
      { id: 42, ok: true, status: 200, replayCount: 1 },
      {
        id: 43,
        ok: false,
        code: "REPLAY_HTTP_ERROR",
        message: "HTTP 502: boom",
      },
      { id: 44, ok: true, status: 202, replayCount: 1 },
    ],
  });
  assert.match(out, /Total 3, success 2, fail 1/);
  assert.match(out, /42.*ok.*HTTP 200.*replay_count → 1/);
  assert.match(out, /43.*fail.*REPLAY_HTTP_ERROR/);
  assert.match(out, /44.*ok/);
});
