// scripts/__tests__/ai-memory-backfill.test.mjs
//
// Unit tests для CLI у `scripts/ai-memory-backfill.mjs` (PR-21 follow-up).
// Pattern дзеркалить replay-webhook.test.mjs:
//   * Import-mode (без spawn-у Node-процесу).
//   * Перевіряємо argument parsing, body builder, формат cost-estimate
//     output-у. HTTP-частина (POST /api/internal/ai-memory/backfill/*)
//     має дедикований Vitest route-test на server-боці.
//
// Run with:  node --test scripts/__tests__/ai-memory-backfill.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCliArgs,
  buildStartBody,
  formatCostUsd,
  formatStartReport,
} from "../ai-memory-backfill.mjs";

test("parseCliArgs: --help → help: true", () => {
  const r = parseCliArgs(["--help"]);
  assert.equal(r.help, true);
});

test("parseCliArgs: missing --founder → error", () => {
  const r = parseCliArgs([]);
  assert.match(r.error, /--founder/);
});

test("parseCliArgs: --founder only → safe-default dry-run", () => {
  const r = parseCliArgs(["--founder=user-abc"]);
  assert.equal(r.founderUserId, "user-abc");
  assert.equal(r.dryRun, true);
  assert.equal(r.days, 90);
  assert.equal(r.source, "cofounder");
  assert.equal(r.batch, 100);
});

test("parseCliArgs: --execute toggles dryRun=false", () => {
  const r = parseCliArgs(["--founder=user-abc", "--execute"]);
  assert.equal(r.dryRun, false);
});

test("parseCliArgs: --dry-run + --execute mutually exclusive", () => {
  const r = parseCliArgs(["--founder=user-abc", "--dry-run", "--execute"]);
  assert.match(r.error, /взаємовиключ/);
});

test("parseCliArgs: --days/--batch validate range", () => {
  const a = parseCliArgs(["--founder=u", "--days=0"]);
  assert.match(a.error, /--days/);
  const b = parseCliArgs(["--founder=u", "--days=400"]);
  assert.match(b.error, /--days/);
  const c = parseCliArgs(["--founder=u", "--batch=0"]);
  assert.match(c.error, /--batch/);
  const d = parseCliArgs(["--founder=u", "--batch=2000"]);
  assert.match(d.error, /--batch/);
});

test("parseCliArgs: --source must be cofounder|all", () => {
  const r = parseCliArgs(["--founder=u", "--source=bogus"]);
  assert.match(r.error, /--source/);
});

test("parseCliArgs: --topic splits CSV", () => {
  const r = parseCliArgs(["--founder=u", "--topic=incidents, ops, revenue"]);
  assert.deepEqual(r.topicFilter, ["incidents", "ops", "revenue"]);
});

test("parseCliArgs: --resume-state-id accepts positive int", () => {
  const r = parseCliArgs(["--founder=u", "--resume-state-id=42", "--execute"]);
  assert.equal(r.resumeStateId, 42);
});

test("parseCliArgs: --resume-state-id rejects non-int", () => {
  const r = parseCliArgs([
    "--founder=u",
    "--resume-state-id=notanumber",
    "--execute",
  ]);
  assert.match(r.error, /--resume-state-id/);
});

test("buildStartBody: passes only set fields", () => {
  const parsed = {
    founderUserId: "u",
    days: 30,
    source: "cofounder",
    batch: 50,
    dryRun: true,
  };
  const body = buildStartBody(parsed);
  assert.deepEqual(body, {
    founderUserId: "u",
    daysWindow: 30,
    sourceMode: "cofounder",
    batchSize: 50,
    dryRun: true,
  });
});

test("buildStartBody: includes topicFilter if set", () => {
  const parsed = {
    founderUserId: "u",
    days: 7,
    source: "cofounder",
    batch: 100,
    dryRun: false,
    topicFilter: ["ops", "incidents"],
  };
  const body = buildStartBody(parsed);
  assert.deepEqual(body.topicFilter, ["ops", "incidents"]);
});

test("formatCostUsd: zero/negative → $0.0000", () => {
  assert.equal(formatCostUsd(0), "$0.0000");
  assert.equal(formatCostUsd(-1), "$0.0000");
  assert.equal(formatCostUsd(Number.NaN), "$0.0000");
});

test("formatCostUsd: 4-decimal precision", () => {
  assert.equal(formatCostUsd(0.025), "$0.0250");
  assert.equal(formatCostUsd(1.23456), "$1.2346");
});

test("formatStartReport: includes core fields", () => {
  const report = formatStartReport(
    {
      stateId: 7,
      totalCandidates: 1234,
      estimatedCostUsd: 0.025,
      status: "dry_run_completed",
      budgetExceeded: false,
      voyageBudgetSoftUsd: 1,
    },
    {
      founderUserId: "user-f1",
      dryRun: true,
      days: 90,
      source: "cofounder",
      batch: 100,
    },
  );
  assert.match(report, /DRY-RUN/);
  assert.match(report, /state_id:\s+7/);
  assert.match(report, /total_candidates:\s+1234/);
  assert.match(report, /\$0\.0250/);
  assert.match(report, /dry_run_completed/);
});

test("formatStartReport: budget-exceeded warning surfaces", () => {
  const report = formatStartReport(
    {
      stateId: 8,
      totalCandidates: 99999,
      estimatedCostUsd: 5,
      status: "aborted_budget",
      budgetExceeded: true,
      voyageBudgetSoftUsd: 1,
    },
    {
      founderUserId: "user-f1",
      dryRun: false,
      days: 365,
      source: "cofounder",
      batch: 100,
    },
  );
  assert.match(report, /ABORTED/);
  assert.match(report, /VOYAGE_DAILY_BUDGET_USD_SOFT/);
});
