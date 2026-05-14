#!/usr/bin/env node
// AI-NOTE: Post-deploy smoke-test runner. Reads scripts/smoke-tests.json,
// hits every endpoint against $TARGET_BASE_URL (parallel), checks status +
// latency budget + response-shape skeleton, and emits a markdown + JSON
// report. Sister script to scripts/pact-drift-check.mjs: drift = schema
// regression vs canned pact; smoke = liveness regression vs deploy. Pure
// shape-matcher logic + report renderer are exported for unit-testing
// (scripts/__tests__/post-deploy-smoke.test.mjs).
//
// Usage:
//   node scripts/post-deploy-smoke.mjs \
//     --base-url https://staging.example.com \
//     --report dist/smoke-report.md \
//     --json dist/smoke-report.json
//
// Flags:
//   --base-url <url>        Target server (defaults to $TARGET_BASE_URL /
//                           $STAGING_BASE_URL — picked in that order).
//   --report <path>         Write markdown report. Default: stdout.
//   --json <path>           Write structured JSON report.
//   --config <path>         Smoke-tests config. Default: scripts/smoke-tests.json.
//   --tier critical|extended|all    Which tiers to run. Default: all.
//   --only <comma,names>    Run only the named tests.
//   --skip <comma,names>    Skip these named tests.
//   --strict                Treat warnings (e.g. latency above budget but
//                           below 2x budget) as failures.
//   --dry-run               Parse config, print plan, do NOT make HTTP calls.
//   --concurrency <n>       Max parallel requests (default: 8).
//
// Exit codes:
//   0  All checks pass.
//   1  ≥1 failure detected (status / latency / shape mismatch).
//   2  Script error (config missing, base URL missing, parse error).

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "smoke-tests.json",
);

// ---------- Shape matcher ----------

/**
 * Compares an actual JSON value against a declared shape descriptor.
 *
 * Shape grammar:
 *   - "string" | "number" | "boolean" | "object" | "array" | "null" — primitive type assertion.
 *   - "<type>?" — the field may be missing OR null (e.g. "string?").
 *   - { key: shape } — recursive object descriptor; missing keys = fail unless declared as "<type>?".
 *   - [shape] — array where every element must satisfy `shape`.
 *
 * Returns an array of diagnostics; empty array means PASS.
 */
export function matchShape(expected, actual, basePath = "$") {
  const out = [];
  matchShapeAt(expected, actual, basePath, out);
  return out;
}

function matchShapeAt(expected, actual, p, out) {
  if (expected === undefined || expected === null) return;

  if (typeof expected === "string") {
    const optional = expected.endsWith("?");
    const baseType = optional ? expected.slice(0, -1) : expected;
    if (actual === null || actual === undefined) {
      if (!optional) {
        out.push({
          path: p,
          kind: "missing_or_null",
          expected: baseType,
          actual: actual === undefined ? "undefined" : "null",
        });
      }
      return;
    }
    const actualType = Array.isArray(actual) ? "array" : typeof actual;
    if (actualType !== baseType) {
      out.push({
        path: p,
        kind: "type_mismatch",
        expected: baseType,
        actual: actualType,
      });
    }
    return;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      out.push({
        path: p,
        kind: "type_mismatch",
        expected: "array",
        actual: actual === null ? "null" : typeof actual,
      });
      return;
    }
    if (expected.length === 0) return;
    const elementShape = expected[0];
    actual.forEach((el, idx) => {
      matchShapeAt(elementShape, el, `${p}[${idx}]`, out);
    });
    return;
  }

  if (typeof expected === "object") {
    if (
      actual === null ||
      typeof actual !== "object" ||
      Array.isArray(actual)
    ) {
      out.push({
        path: p,
        kind: "type_mismatch",
        expected: "object",
        actual:
          actual === null
            ? "null"
            : Array.isArray(actual)
              ? "array"
              : typeof actual,
      });
      return;
    }
    for (const [k, sub] of Object.entries(expected)) {
      matchShapeAt(sub, actual[k], `${p}.${k}`, out);
    }
  }
}

// ---------- Config loader ----------

export function normaliseTests(config) {
  const defaults = config.defaults ?? {};
  if (!Array.isArray(config.tests)) {
    throw new Error(
      `smoke-tests config invalid: missing "tests" array (got ${typeof config.tests})`,
    );
  }
  return config.tests.map((t, idx) => {
    if (!t.name || typeof t.name !== "string") {
      throw new Error(`smoke-tests[${idx}]: missing or invalid "name"`);
    }
    if (!t.path || typeof t.path !== "string") {
      throw new Error(`smoke-tests[${t.name}]: missing or invalid "path"`);
    }
    return {
      name: t.name,
      method: (t.method ?? defaults.method ?? "GET").toUpperCase(),
      path: t.path,
      expectedStatus: t.expectedStatus ?? defaults.expectedStatus ?? 200,
      latencyBudgetMs: t.latencyBudgetMs ?? defaults.latencyBudgetMs ?? 2500,
      timeoutMs: t.timeoutMs ?? defaults.timeoutMs ?? 8000,
      auth: t.auth ?? "none",
      tier: t.tier ?? "extended",
      shape: t.shape,
      expectedBodyContains: t.expectedBodyContains,
      body: t.body,
      headers: t.headers ?? {},
      comment: t.comment,
    };
  });
}

export async function loadConfig(configPath) {
  const raw = await readFile(configPath, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`smoke-tests config invalid JSON: ${err.message}`);
  }
  return { config: parsed, tests: normaliseTests(parsed) };
}

// ---------- Filtering ----------

export function filterTests(tests, { tier, only, skip }) {
  let out = tests;
  if (tier && tier !== "all") {
    out = out.filter((t) => t.tier === tier);
  }
  if (only && only.length > 0) {
    const allow = new Set(only);
    out = out.filter((t) => allow.has(t.name));
  }
  if (skip && skip.length > 0) {
    const deny = new Set(skip);
    out = out.filter((t) => !deny.has(t.name));
  }
  return out;
}

// ---------- Verdict reducer ----------

/**
 * Reduces (statusOK, latencyMs, latencyBudgetMs, shapeDiff[], bodyContainsOK,
 * fetchError, strict) → verdict ∈ {pass, warn, fail}.
 *
 *   - fetchError → fail
 *   - statusOK=false → fail
 *   - shapeDiff.length > 0 → fail
 *   - expectedBodyContains miss → fail
 *   - latency > budget * 2 → fail (severe overrun, even in non-strict mode)
 *   - latency > budget → warn (under non-strict) / fail (under strict)
 *   - else → pass
 */
export function decideVerdict({
  statusOK,
  latencyMs,
  latencyBudgetMs,
  shapeDiff = [],
  bodyContainsOK = true,
  fetchError = null,
  strict = false,
}) {
  if (fetchError) return { verdict: "fail", reason: "fetch_error" };
  if (!statusOK) return { verdict: "fail", reason: "status_mismatch" };
  if (!bodyContainsOK)
    return { verdict: "fail", reason: "body_contains_mismatch" };
  if (shapeDiff.length > 0)
    return { verdict: "fail", reason: "shape_mismatch" };
  if (latencyMs > latencyBudgetMs * 2)
    return { verdict: "fail", reason: "latency_severe_overrun" };
  if (latencyMs > latencyBudgetMs)
    return {
      verdict: strict ? "fail" : "warn",
      reason: "latency_over_budget",
    };
  return { verdict: "pass", reason: "ok" };
}

// ---------- HTTP runner ----------

async function executeTest(test, { baseUrl, sessionCookie, strict }) {
  const url = new URL(test.path, baseUrl).toString();
  const headers = {
    accept: "application/json",
    "user-agent": "sergeant-post-deploy-smoke/1.0",
    ...test.headers,
  };
  if (test.auth === "session" && sessionCookie) {
    headers.cookie = sessionCookie;
  }

  const init = {
    method: test.method,
    headers,
    signal: AbortSignal.timeout(test.timeoutMs),
  };
  if (test.body !== undefined && test.method !== "GET") {
    init.body =
      typeof test.body === "string" ? test.body : JSON.stringify(test.body);
    headers["content-type"] = "application/json";
  }

  const startedAt = process.hrtime.bigint();
  let res, text, fetchError;
  try {
    res = await fetch(url, init);
    text = await res.text();
  } catch (err) {
    fetchError = err.message || String(err);
  }
  const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  if (fetchError) {
    const verdict = decideVerdict({
      statusOK: false,
      latencyMs,
      latencyBudgetMs: test.latencyBudgetMs,
      fetchError,
      strict,
    });
    return {
      name: test.name,
      url,
      method: test.method,
      expectedStatus: test.expectedStatus,
      actualStatus: null,
      latencyMs,
      latencyBudgetMs: test.latencyBudgetMs,
      bodyContainsOK: true,
      ...verdict,
      fetchError,
    };
  }

  const statusOK = res.status === test.expectedStatus;
  let shapeDiff = [];
  let bodyContainsOK = true;
  let parsedBody = null;
  let bodySnippet = text.length > 200 ? text.slice(0, 197) + "…" : text;

  if (test.expectedBodyContains) {
    bodyContainsOK = text.includes(test.expectedBodyContains);
  }

  if (test.shape && statusOK) {
    try {
      parsedBody = JSON.parse(text);
      shapeDiff = matchShape(test.shape, parsedBody);
    } catch (err) {
      shapeDiff = [
        {
          path: "$",
          kind: "json_parse_error",
          expected: "json",
          actual: err.message,
        },
      ];
    }
  }

  const verdict = decideVerdict({
    statusOK,
    latencyMs,
    latencyBudgetMs: test.latencyBudgetMs,
    shapeDiff,
    bodyContainsOK,
    strict,
  });

  return {
    name: test.name,
    url,
    method: test.method,
    expectedStatus: test.expectedStatus,
    actualStatus: res.status,
    latencyMs,
    latencyBudgetMs: test.latencyBudgetMs,
    shapeDiff,
    bodyContainsOK,
    bodySnippet,
    ...verdict,
  };
}

// ---------- Parallel orchestration ----------

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next(),
  );
  await Promise.all(workers);
  return results;
}

// ---------- Reporters ----------

const VERDICT_BADGE = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  skip: "⏭️",
};

export function renderMarkdown(results, { baseUrl, generatedAt }) {
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const lines = [];
  lines.push(`# Post-deploy smoke report`);
  lines.push("");
  lines.push(`- **Base URL:** \`${baseUrl}\``);
  lines.push(`- **Generated:** \`${generatedAt}\``);
  lines.push(
    `- **Summary:** ${counts.pass} pass / ${counts.warn} warn / ${counts.fail} fail / ${counts.skip} skip (total ${results.length})`,
  );
  lines.push("");
  lines.push(`| Verdict | Test | Method | Path | Status | Latency | Reason |`);
  lines.push(`| ------- | ---- | ------ | ---- | ------ | ------- | ------ |`);
  for (const r of results) {
    const badge = VERDICT_BADGE[r.verdict] ?? "?";
    const status =
      r.actualStatus != null
        ? `${r.actualStatus}${r.expectedStatus != null && r.actualStatus !== r.expectedStatus ? ` (≠ ${r.expectedStatus})` : ""}`
        : "—";
    const latency =
      r.latencyMs != null
        ? `${r.latencyMs.toFixed(0)} ms${r.latencyBudgetMs ? ` (budget ${r.latencyBudgetMs})` : ""}`
        : "—";
    const pathOnly = (() => {
      try {
        return new URL(r.url).pathname + (new URL(r.url).search ?? "");
      } catch {
        return r.url;
      }
    })();
    lines.push(
      `| ${badge} \`${r.verdict}\` | \`${r.name}\` | \`${r.method ?? "?"}\` | \`${pathOnly}\` | ${status} | ${latency} | ${r.reason} |`,
    );
  }
  const failures = results.filter((r) => r.verdict === "fail");
  if (failures.length > 0) {
    lines.push("");
    lines.push(`## Failures (${failures.length})`);
    lines.push("");
    for (const f of failures) {
      lines.push(`### ❌ \`${f.name}\` — ${f.reason}`);
      lines.push("");
      lines.push(`- URL: \`${f.url}\``);
      if (f.fetchError) {
        lines.push(`- Fetch error: \`${f.fetchError}\``);
      }
      if (f.expectedStatus != null) {
        lines.push(
          `- Expected status: \`${f.expectedStatus}\`, actual: \`${f.actualStatus ?? "—"}\``,
        );
      }
      if (f.latencyMs != null) {
        lines.push(
          `- Latency: \`${f.latencyMs.toFixed(0)} ms\` (budget \`${f.latencyBudgetMs} ms\`)`,
        );
      }
      if (f.shapeDiff && f.shapeDiff.length > 0) {
        lines.push(`- Shape diffs:`);
        for (const d of f.shapeDiff) {
          lines.push(
            `  - \`${d.path}\`: ${d.kind} (expected \`${d.expected}\`, actual \`${d.actual}\`)`,
          );
        }
      }
      if (f.bodyContainsOK === false) {
        lines.push(`- Body did not contain the expected substring.`);
      }
      if (f.bodySnippet) {
        lines.push("");
        lines.push("```");
        lines.push(f.bodySnippet);
        lines.push("```");
      }
      lines.push("");
    }
  }
  const warns = results.filter((r) => r.verdict === "warn");
  if (warns.length > 0) {
    lines.push("");
    lines.push(`## Warnings (${warns.length})`);
    lines.push("");
    for (const w of warns) {
      lines.push(
        `- \`${w.name}\`: ${w.reason} — latency \`${w.latencyMs.toFixed(0)} ms\` exceeds budget \`${w.latencyBudgetMs} ms\` (≤2x; not fail-stop).`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

export function renderJson(results, { baseUrl, generatedAt }) {
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  return JSON.stringify(
    {
      baseUrl,
      generatedAt,
      counts,
      total: results.length,
      results,
    },
    null,
    2,
  );
}

// ---------- CLI entry ----------

function parseArgs(argv) {
  const out = {
    baseUrl: null,
    report: null,
    json: null,
    configPath: DEFAULT_CONFIG_PATH,
    tier: "all",
    only: [],
    skip: [],
    strict: false,
    dryRun: false,
    concurrency: 8,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--base-url":
        out.baseUrl = argv[++i];
        break;
      case "--report":
        out.report = argv[++i];
        break;
      case "--json":
        out.json = argv[++i];
        break;
      case "--config":
        out.configPath = argv[++i];
        break;
      case "--tier":
        out.tier = argv[++i];
        break;
      case "--only":
        out.only = (argv[++i] ?? "").split(",").filter(Boolean);
        break;
      case "--skip":
        out.skip = (argv[++i] ?? "").split(",").filter(Boolean);
        break;
      case "--strict":
        out.strict = true;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--concurrency":
        out.concurrency = Math.max(1, parseInt(argv[++i], 10) || 8);
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (a.startsWith("--")) {
          throw new Error(`Unknown flag: ${a}`);
        }
    }
  }
  return out;
}

const HELP = `post-deploy-smoke — daily smoke checks against a deployed Sergeant server.

Usage:
  node scripts/post-deploy-smoke.mjs --base-url <url> [options]

Required:
  --base-url <url>     Target base URL (or $TARGET_BASE_URL / $STAGING_BASE_URL).

Options:
  --report <path>      Write markdown report (default: stdout).
  --json <path>        Write JSON report.
  --config <path>      Config file (default: scripts/smoke-tests.json).
  --tier critical|extended|all   Filter by tier (default: all).
  --only a,b,c         Run only these test names.
  --skip a,b,c         Skip these test names.
  --strict             Treat latency-over-budget warnings as failures.
  --dry-run            Print plan, do not make HTTP calls.
  --concurrency <n>    Max parallel requests (default: 8).
`;

export async function runMain(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n${HELP}`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const baseUrl =
    args.baseUrl || process.env.TARGET_BASE_URL || process.env.STAGING_BASE_URL;
  if (!baseUrl && !args.dryRun) {
    process.stderr.write(
      "Error: --base-url is required (or set TARGET_BASE_URL / STAGING_BASE_URL).\n",
    );
    return 2;
  }

  let loaded;
  try {
    loaded = await loadConfig(args.configPath);
  } catch (err) {
    process.stderr.write(`Config error: ${err.message}\n`);
    return 2;
  }

  const tests = filterTests(loaded.tests, {
    tier: args.tier,
    only: args.only,
    skip: args.skip,
  });
  if (tests.length === 0) {
    process.stderr.write(
      "No tests selected. Check --tier/--only/--skip flags.\n",
    );
    return 2;
  }

  const generatedAt = new Date().toISOString();
  const sessionCookie = process.env.STAGING_SESSION_COOKIE || "";

  if (args.dryRun) {
    process.stdout.write(`Dry-run — ${tests.length} test(s) planned:\n`);
    for (const t of tests) {
      const authNote =
        t.auth === "session"
          ? sessionCookie
            ? "auth=session(set)"
            : "auth=session(MISSING — will run anonymously)"
          : "auth=none";
      process.stdout.write(
        `  - ${t.name} [${t.tier}] ${t.method} ${t.path} expect=${t.expectedStatus} budget=${t.latencyBudgetMs}ms ${authNote}\n`,
      );
    }
    return 0;
  }

  const results = await runWithConcurrency(tests, args.concurrency, (t) =>
    executeTest(t, {
      baseUrl,
      sessionCookie,
      strict: args.strict,
    }),
  );

  const markdown = renderMarkdown(results, { baseUrl, generatedAt });
  if (args.report) {
    await mkdir(path.dirname(args.report), { recursive: true });
    await writeFile(args.report, markdown, "utf-8");
  }
  process.stdout.write(markdown);
  if (args.json) {
    await mkdir(path.dirname(args.json), { recursive: true });
    await writeFile(
      args.json,
      renderJson(results, { baseUrl, generatedAt }),
      "utf-8",
    );
  }

  const hasFail = results.some((r) => r.verdict === "fail");
  return hasFail ? 1 : 0;
}

const isDirectInvocation =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("post-deploy-smoke.mjs");

if (isDirectInvocation) {
  runMain()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(
        `Unhandled error: ${err.stack ?? err.message ?? String(err)}\n`,
      );
      process.exit(2);
    });
}
