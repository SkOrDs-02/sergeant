// scripts/__tests__/rag-eval-weekly.test.mjs
//
// Node-test для `scripts/rag-eval-weekly.mjs` wrapper-а. Перевіряє:
//   1. parseWrapperArgs — env / CLI override pattern
//   2. runEval — spawn-it real CLI у mock-mode; парсить v2.0 summary
//   3. postSummary — retry-loop, success path, 2xx vs 4xx handling
//   4. runWrapper — end-to-end (з mocked fetch)
//
// Запуск:
//   pnpm eval:rag:test                           # full suite (PR-20 + цей)
//   node --test scripts/__tests__/rag-eval-weekly.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWrapperArgs,
  runEval,
  postSummary,
  runWrapper,
} from "../rag-eval-weekly.mjs";

// ─────────────────────────────────────────────────────────────────────────
// parseWrapperArgs
// ─────────────────────────────────────────────────────────────────────────

test("parseWrapperArgs reads env defaults", () => {
  const prev = process.env.API_BASE_URL;
  delete process.env.API_BASE_URL;
  const opts = parseWrapperArgs([]);
  assert.equal(opts.apiBaseUrl, "http://127.0.0.1:3000");
  if (prev !== undefined) process.env.API_BASE_URL = prev;
});

test("parseWrapperArgs reads env when set", () => {
  const prev = process.env.API_BASE_URL;
  process.env.API_BASE_URL = "https://api.staging.local";
  const opts = parseWrapperArgs([]);
  assert.equal(opts.apiBaseUrl, "https://api.staging.local");
  if (prev !== undefined) process.env.API_BASE_URL = prev;
  else delete process.env.API_BASE_URL;
});

test("parseWrapperArgs CLI flag overrides env", () => {
  const prev = process.env.API_BASE_URL;
  process.env.API_BASE_URL = "https://wrong";
  const opts = parseWrapperArgs(["--api-base-url=https://right"]);
  assert.equal(opts.apiBaseUrl, "https://right");
  if (prev !== undefined) process.env.API_BASE_URL = prev;
  else delete process.env.API_BASE_URL;
});

test("parseWrapperArgs forwards unknown args to eval CLI", () => {
  const opts = parseWrapperArgs([
    "--mode=simulate",
    "--simulate-recall=0.45",
    "--api-base-url=https://x",
    "--warn=0.5",
  ]);
  assert.deepEqual(opts.evalArgs, [
    "--mode=simulate",
    "--simulate-recall=0.45",
    "--warn=0.5",
  ]);
  assert.equal(opts.apiBaseUrl, "https://x");
});

test("parseWrapperArgs --skip-post toggles flag", () => {
  const opts = parseWrapperArgs(["--skip-post"]);
  assert.equal(opts.skipPost, true);
});

test("parseWrapperArgs rejects invalid timeout", () => {
  assert.throws(() => parseWrapperArgs(["--post-timeout-ms=-5"]));
  assert.throws(() => parseWrapperArgs(["--post-timeout-ms=abc"]));
});

test("parseWrapperArgs rejects invalid retries", () => {
  assert.throws(() => parseWrapperArgs(["--post-retries=-1"]));
  assert.throws(() => parseWrapperArgs(["--post-retries=100"]));
});

// ─────────────────────────────────────────────────────────────────────────
// runEval — real subprocess
// ─────────────────────────────────────────────────────────────────────────

test("runEval invokes eval CLI in mock mode and returns v2.0 summary", async () => {
  const opts = parseWrapperArgs([]);
  const { summary, exitCode } = await runEval(opts);
  assert.equal(exitCode, 0);
  assert.equal(summary.version, "2.0");
  assert.equal(summary.mode, "mock");
  assert.equal(summary.status, "pass");
  assert.equal(summary.metrics.recallAtK.count, 50);
  assert.equal(summary.metrics.recallAtK.mean, 1);
  assert.equal(summary.metrics.precisionAt1.mean, 1);
  assert.equal(summary.metrics.mrr.mean, 1);
});

test("runEval forwards --mode=simulate with recall override", async () => {
  const opts = parseWrapperArgs(["--mode=simulate", "--simulate-recall=0.3"]);
  const { summary, exitCode } = await runEval(opts);
  assert.equal(summary.mode, "simulate");
  assert.equal(summary.status, "kill"); // 0.3 < 0.4 default kill threshold
  assert.equal(exitCode, 2);
  assert.ok(summary.metrics.recallAtK.mean < 0.4);
});

// ─────────────────────────────────────────────────────────────────────────
// postSummary — mocked fetch
// ─────────────────────────────────────────────────────────────────────────

function buildSummary() {
  return {
    version: "2.0",
    mode: "mock",
    ranAt: "2026-05-13T08:00:00.000Z",
    topK: 4,
    thresholds: { warn: 0.5, kill: 0.4 },
    metrics: {
      recallAtK: { count: 50, mean: 1, min: 1, p50: 1 },
      precisionAt1: { count: 50, mean: 1, min: 1, p50: 1 },
      mrr: { count: 50, mean: 1, min: 1, p50: 1 },
    },
    aggregate: { count: 50, mean: 1, min: 1, p50: 1 },
    status: "pass",
    exitCode: 0,
    baselineComparison: null,
  };
}

test("postSummary requires INTERNAL_API_KEY", async () => {
  const opts = parseWrapperArgs(["--api-base-url=https://api.test.local"]);
  opts.internalApiKey = "";
  await assert.rejects(
    postSummary(opts, buildSummary(), async () => {
      throw new Error("fetch should not be called");
    }),
    /INTERNAL_API_KEY not set/,
  );
});

test("postSummary success on 200", async () => {
  const opts = parseWrapperArgs([
    "--api-base-url=https://api.test.local",
    "--internal-api-key=secret",
    "--post-retries=0",
  ]);
  let calledUrl;
  let calledHeaders;
  const fakeFetch = async (url, init) => {
    calledUrl = url;
    calledHeaders = init.headers;
    return {
      status: 200,
      json: async () => ({
        ok: true,
        recordId: 42,
        killSwitchActivated: false,
      }),
    };
  };
  const result = await postSummary(opts, buildSummary(), fakeFetch);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.attempts, 1);
  assert.equal(result.body.recordId, 42);
  assert.equal(
    calledUrl,
    "https://api.test.local/api/internal/eval/rag-weekly",
  );
  assert.equal(calledHeaders.Authorization, "Bearer secret");
  assert.equal(calledHeaders["Content-Type"], "application/json");
});

test("postSummary retries on transient 500 then succeeds", async () => {
  const opts = parseWrapperArgs([
    "--api-base-url=https://api.test.local",
    "--internal-api-key=secret",
    "--post-retries=2",
  ]);
  let attempt = 0;
  const fakeFetch = async () => {
    attempt += 1;
    if (attempt < 2) {
      return { status: 500, json: async () => ({}) };
    }
    return {
      status: 200,
      json: async () => ({ ok: true, recordId: 7, killSwitchActivated: false }),
    };
  };
  const result = await postSummary(opts, buildSummary(), fakeFetch);
  assert.equal(result.attempts, 2);
  assert.equal(result.body.recordId, 7);
});

test("postSummary throws after exhausting retries", async () => {
  const opts = parseWrapperArgs([
    "--api-base-url=https://api.test.local",
    "--internal-api-key=secret",
    "--post-retries=1",
  ]);
  let attempt = 0;
  const fakeFetch = async () => {
    attempt += 1;
    return { status: 500, json: async () => ({}) };
  };
  await assert.rejects(
    postSummary(opts, buildSummary(), fakeFetch),
    /endpoint returned non-2xx/,
  );
  assert.equal(attempt, 2);
});

test("postSummary strips trailing slashes from api-base-url", async () => {
  const opts = parseWrapperArgs([
    "--api-base-url=https://api.test.local///",
    "--internal-api-key=secret",
  ]);
  let calledUrl;
  const fakeFetch = async (url) => {
    calledUrl = url;
    return {
      status: 200,
      json: async () => ({ ok: true, recordId: 1, killSwitchActivated: false }),
    };
  };
  await postSummary(opts, buildSummary(), fakeFetch);
  assert.equal(
    calledUrl,
    "https://api.test.local/api/internal/eval/rag-weekly",
  );
});

// ─────────────────────────────────────────────────────────────────────────
// runWrapper — end-to-end
// ─────────────────────────────────────────────────────────────────────────

test("runWrapper --skip-post runs eval but does not POST", async () => {
  const logs = [];
  const logger = { log: (m) => logs.push(m) };
  const fakeFetch = async () => {
    throw new Error("fetch must not be called when --skip-post is set");
  };
  const result = await runWrapper(["--skip-post"], {
    fetchFn: fakeFetch,
    logger,
  });
  assert.equal(result.summary.version, "2.0");
  assert.equal(result.summary.status, "pass");
  assert.equal(result.postResult, null);
  assert.ok(logs.some((l) => l.includes("--skip-post")));
});

test("runWrapper end-to-end posts the eval summary", async () => {
  const logs = [];
  const logger = { log: (m) => logs.push(m) };
  let postedBody;
  const fakeFetch = async (_url, init) => {
    postedBody = JSON.parse(init.body);
    return {
      status: 200,
      json: async () => ({
        ok: true,
        recordId: 99,
        status: postedBody.status,
        killSwitchActivated: false,
      }),
    };
  };
  const result = await runWrapper(
    [
      "--api-base-url=https://api.test.local",
      "--internal-api-key=secret",
      "--post-retries=0",
    ],
    { fetchFn: fakeFetch, logger },
  );
  assert.equal(result.summary.status, "pass");
  assert.equal(result.postResult.body.recordId, 99);
  assert.equal(postedBody.version, "2.0");
  assert.equal(postedBody.metrics.recallAtK.count, 50);
});
