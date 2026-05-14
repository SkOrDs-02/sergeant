#!/usr/bin/env node
// scripts/pact-drift-check.mjs
//
// Cron-time **runtime** drift checker for Pact consumer-driven contracts
// (PR-42 #2675 + persona-extend #2703). Each consumer interaction in
// `packages/api-client/pacts/*.json` describes the wire-shape the
// `@sergeant/api-client` expects. The provider-replay test
// (`apps/server/src/__tests__/contracts/provider.test.ts`) verifies this
// inside Vitest against a mocked `createApp()`, but only on PRs that
// run the test suite.
//
// This script complements that by hitting the **live** server
// (staging by default) for each interaction and comparing the actual
// response shape against the pact-described shape. The CI workflow
// `.github/workflows/pact-drift.yml` runs it daily at 06:00 UTC and
// opens a `contract-drift` issue on failure.
//
// Why bother when provider-replay already exists?
//
//   • Provider-replay runs against `createApp()` — handler logic in
//     isolation. It does NOT catch infra-level drift: WAF / CDN /
//     reverse-proxy rewrites, middleware ordering, response-header
//     normalisation, content negotiation, or rollout configuration
//     (feature flags that change response shape per environment).
//   • The pact file is the **consumer's** expectation. If staging
//     starts returning a renamed field — even with the test suite
//     green — every Web/Mobile client in production breaks the next
//     deploy.
//   • Daily cron with idempotent issue creation gives us "alarm
//     before the on-call gets paged" semantics: the issue appears
//     within ~24h of drift introduction.
//
// What it checks (schema, not values):
//
//   • HTTP status code — must exactly match the pact's status.
//   • Response body **shape** (recursive `{key: type}` skeleton):
//       fail   = missing field or type mismatch (string ≠ number);
//       warn   = extra field at the same path (additive change —
//                client will ignore it, but it's worth a heads-up);
//       pass   = shapes match.
//
//   We deliberately do NOT compare values — staging will of course
//   return different numbers / IDs / timestamps than the canned
//   pact fixture. Mismatched values are normal; mismatched **shape**
//   is the contract violation.
//
// Auth model:
//
//   Live endpoints behind Better Auth need a real session cookie.
//   The script reads `STAGING_SESSION_COOKIE` (e.g. set to
//   `better-auth.session_token=<value>` in CI secrets). If absent,
//   auth-required endpoints are skipped with a `WARN: missing-auth`
//   marker — public endpoints (`/healthz`) still run.
//
//   Mutation endpoints (POST/PUT/PATCH/DELETE) are skipped by
//   default — even idempotent ones can pollute a shared staging DB
//   or burn LLM quota. Opt in with `--include-mutations` for an
//   adhoc deeper check.
//
// CLI:
//
//   node scripts/pact-drift-check.mjs                              # human summary, exit 1 on FAIL
//   node scripts/pact-drift-check.mjs --base-url https://api.staging.sergeant.app
//   node scripts/pact-drift-check.mjs --report drift-report.md     # write markdown
//   node scripts/pact-drift-check.mjs --json drift-report.json     # machine output
//   node scripts/pact-drift-check.mjs --include-mutations          # POST/etc too
//   node scripts/pact-drift-check.mjs --strict                     # warns → fails
//   node scripts/pact-drift-check.mjs --timeout 15000              # per-request timeout (ms)
//   node scripts/pact-drift-check.mjs --dry-run                    # parse + plan; no network
//
// Environment:
//
//   STAGING_BASE_URL          required unless --base-url passed
//   STAGING_SESSION_COOKIE    optional; full Cookie header value
//   PACT_FILES                ":"-separated list of pact JSON paths
//                             (default: packages/api-client/pacts/*.json)
//   PACT_DRIFT_TIMEOUT_MS     default 10000
//
// Exit codes:
//
//   0 — all interactions PASS or WARN (or were skipped)
//   1 — at least one interaction is FAIL
//   2 — script-level error (bad args, no pacts found, …)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_PACT_DIR = resolve(REPO_ROOT, "packages", "api-client", "pacts");
const DEFAULT_TIMEOUT_MS = 10_000;
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ── Shape extraction ────────────────────────────────────────────────────────

/**
 * Reduce a JSON value to a recursive shape descriptor. Used both for the
 * pact-described shape and the live-response shape; the diff engine
 * compares two skeletons rather than two raw values.
 *
 * Shape grammar:
 *   primitive    → "null" | "boolean" | "number" | "string"
 *   array        → { kind: "array", items: <Shape>|null }  (null = empty array)
 *   object       → { kind: "object", props: { [key]: <Shape> } }
 *
 * Arrays collapse all elements into a representative shape — if elements
 * disagree, we surface that as a `mixed_array_elements` diff entry.
 */
export function extractShape(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: "array", items: null };
    const itemShapes = value.map(extractShape);
    const merged = mergeArrayShapes(itemShapes);
    return { kind: "array", items: merged };
  }
  if (typeof value === "object") {
    const props = {};
    for (const [k, v] of Object.entries(value)) {
      props[k] = extractShape(v);
    }
    return { kind: "object", props };
  }
  // undefined, function, symbol, bigint — not JSON-serialisable.
  return "unknown";
}

function mergeArrayShapes(shapes) {
  if (shapes.length === 0) return null;
  const [first, ...rest] = shapes;
  let merged = first;
  for (const s of rest) {
    merged = mergeShape(merged, s);
  }
  return merged;
}

function mergeShape(a, b) {
  if (shapeEquals(a, b)) return a;
  if (typeof a === "string" && typeof b === "string") {
    // Two different primitives in the same array — flag.
    return { kind: "union", variants: [a, b] };
  }
  if (
    typeof a === "object" &&
    a &&
    a.kind === "object" &&
    typeof b === "object" &&
    b &&
    b.kind === "object"
  ) {
    const props = { ...a.props };
    for (const [k, v] of Object.entries(b.props)) {
      props[k] = props[k] ? mergeShape(props[k], v) : v;
    }
    return { kind: "object", props };
  }
  return { kind: "union", variants: [a, b] };
}

function shapeEquals(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "string") return a === b;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "array") return shapeEquals(a.items, b.items);
  if (a.kind === "object") {
    const ak = Object.keys(a.props).sort();
    const bk = Object.keys(b.props).sort();
    if (ak.length !== bk.length) return false;
    if (ak.some((k, i) => k !== bk[i])) return false;
    return ak.every((k) => shapeEquals(a.props[k], b.props[k]));
  }
  return false;
}

// ── Shape diff ──────────────────────────────────────────────────────────────

/**
 * Compare two shape skeletons and emit a list of diff entries.
 *
 * Entry shape: { path: string, severity: "fail"|"warn", kind: string, expected?: string, actual?: string }
 *
 * Severities:
 *   fail — missing field, type mismatch, array-vs-object, object-vs-primitive
 *   warn — extra field at the same path (live has more than pact)
 */
export function diffShape(expected, actual, basePath = "$") {
  const diffs = [];
  diffShapeAt(expected, actual, basePath, diffs);
  return diffs;
}

function diffShapeAt(expected, actual, path, out) {
  if (expected === actual) return;

  // Primitive vs primitive.
  if (typeof expected === "string" && typeof actual === "string") {
    if (expected !== actual) {
      out.push({
        path,
        severity: "fail",
        kind: "type_mismatch",
        expected,
        actual,
      });
    }
    return;
  }

  // Expected primitive, actual non-primitive (or vice versa).
  if (typeof expected === "string" || typeof actual === "string") {
    out.push({
      path,
      severity: "fail",
      kind: "kind_mismatch",
      expected: shapeKindLabel(expected),
      actual: shapeKindLabel(actual),
    });
    return;
  }

  if (!expected || !actual) {
    out.push({
      path,
      severity: "fail",
      kind: "null_shape",
      expected: shapeKindLabel(expected),
      actual: shapeKindLabel(actual),
    });
    return;
  }

  if (expected.kind !== actual.kind) {
    out.push({
      path,
      severity: "fail",
      kind: "kind_mismatch",
      expected: shapeKindLabel(expected),
      actual: shapeKindLabel(actual),
    });
    return;
  }

  if (expected.kind === "array") {
    if (expected.items === null && actual.items === null) return;
    if (expected.items === null) {
      // Pact had empty array; live has elements — additive, warn.
      out.push({
        path: `${path}[*]`,
        severity: "warn",
        kind: "array_now_populated",
        expected: "[]",
        actual: shapeKindLabel(actual.items),
      });
      return;
    }
    if (actual.items === null) {
      // Pact expected elements; live array empty — could be data drift
      // (no rows on staging) rather than schema drift. Warn so cron
      // doesn't go red just because the test user has no records.
      out.push({
        path: `${path}[*]`,
        severity: "warn",
        kind: "array_now_empty",
        expected: shapeKindLabel(expected.items),
        actual: "[]",
      });
      return;
    }
    diffShapeAt(expected.items, actual.items, `${path}[*]`, out);
    return;
  }

  if (expected.kind === "object") {
    for (const [k, ev] of Object.entries(expected.props)) {
      const childPath = `${path}.${k}`;
      if (!(k in actual.props)) {
        out.push({
          path: childPath,
          severity: "fail",
          kind: "missing_field",
          expected: shapeKindLabel(ev),
        });
        continue;
      }
      diffShapeAt(ev, actual.props[k], childPath, out);
    }
    for (const k of Object.keys(actual.props)) {
      if (!(k in expected.props)) {
        out.push({
          path: `${path}.${k}`,
          severity: "warn",
          kind: "extra_field",
          actual: shapeKindLabel(actual.props[k]),
        });
      }
    }
    return;
  }

  if (expected.kind === "union" || actual.kind === "union") {
    out.push({
      path,
      severity: "warn",
      kind: "union_shape",
      expected: shapeKindLabel(expected),
      actual: shapeKindLabel(actual),
    });
    return;
  }
}

function shapeKindLabel(s) {
  if (s === null || s === undefined) return "missing";
  if (typeof s === "string") return s;
  if (s.kind === "array") return "array";
  if (s.kind === "object") return "object";
  if (s.kind === "union") {
    return `union(${s.variants.map(shapeKindLabel).join("|")})`;
  }
  return "unknown";
}

// ── Pact loading ────────────────────────────────────────────────────────────

export function loadPactFiles(paths) {
  const interactions = [];
  for (const file of paths) {
    let raw;
    try {
      raw = readFileSync(file, "utf-8");
    } catch (err) {
      throw new Error(`Cannot read pact file: ${file} (${err.message})`);
    }
    let pact;
    try {
      pact = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in pact file: ${file} (${err.message})`);
    }
    if (!Array.isArray(pact.interactions)) {
      throw new Error(`Pact ${file} has no interactions[]`);
    }
    for (const interaction of pact.interactions) {
      interactions.push({
        consumer: pact.consumer?.name ?? "unknown-consumer",
        provider: pact.provider?.name ?? "unknown-provider",
        file,
        ...interaction,
      });
    }
  }
  return interactions;
}

function discoverPactFiles({ pactFilesEnv, pactDir = DEFAULT_PACT_DIR }) {
  if (pactFilesEnv) {
    return pactFilesEnv
      .split(":")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => resolve(REPO_ROOT, p));
  }
  let entries;
  try {
    entries = readdirSync(pactDir);
  } catch (err) {
    throw new Error(`Pact directory not found: ${pactDir} (${err.message})`);
  }
  return entries
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(pactDir, f))
    .filter((f) => statSync(f).isFile());
}

// ── HTTP runner ─────────────────────────────────────────────────────────────

function buildUrl(baseUrl, interaction) {
  const url = new URL(interaction.request.path, baseUrl);
  const q = interaction.request.query;
  if (q && typeof q === "object") {
    for (const [k, v] of Object.entries(q)) {
      const values = Array.isArray(v) ? v : [v];
      for (const item of values) url.searchParams.append(k, String(item));
    }
  }
  return url.toString();
}

async function executeInteraction(interaction, opts) {
  const { baseUrl, cookie, timeoutMs, includeMutations } = opts;
  const method = interaction.request.method.toUpperCase();

  if (MUTATION_METHODS.has(method) && !includeMutations) {
    return {
      verdict: "skip",
      reason: "mutation_skipped",
      detail:
        "POST/PUT/PATCH/DELETE skipped by default — pass --include-mutations to opt in.",
    };
  }

  const headers = {
    accept: "application/json",
    ...(interaction.request.headers ?? {}),
  };
  if (cookie) headers.cookie = cookie;

  const url = buildUrl(baseUrl, interaction);
  const body = interaction.request.body;
  const init = { method, headers };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    if (!headers["content-type"] && !headers["Content-Type"]) {
      init.headers["content-type"] = "application/json";
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  init.signal = controller.signal;

  const expectedStatus = interaction.response?.status ?? 200;
  let res;
  let text;
  try {
    res = await fetch(url, init);
    text = await res.text();
  } catch (err) {
    return {
      verdict: "fail",
      reason: "fetch_error",
      detail: `${err.name}: ${err.message}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && !cookie) {
    return {
      verdict: "skip",
      reason: "missing_auth",
      detail: `Endpoint returned 401 and STAGING_SESSION_COOKIE was not set.`,
    };
  }

  if (res.status !== expectedStatus) {
    return {
      verdict: "fail",
      reason: "status_mismatch",
      detail: `Expected ${expectedStatus}, got ${res.status}.`,
      actualStatus: res.status,
      expectedStatus,
    };
  }

  let actualBody;
  try {
    actualBody = text.length > 0 ? JSON.parse(text) : null;
  } catch (err) {
    return {
      verdict: "fail",
      reason: "non_json_response",
      detail: `Could not parse JSON: ${err.message}`,
      expectedStatus,
      actualStatus: res.status,
    };
  }

  const expectedShape = extractShape(interaction.response?.body ?? null);
  const actualShape = extractShape(actualBody);
  const diffs = diffShape(expectedShape, actualShape);

  const fails = diffs.filter((d) => d.severity === "fail");
  const warns = diffs.filter((d) => d.severity === "warn");
  if (fails.length > 0) {
    return {
      verdict: "fail",
      reason: "shape_drift",
      detail: `${fails.length} shape failure(s), ${warns.length} warning(s).`,
      diffs,
      expectedStatus,
      actualStatus: res.status,
    };
  }
  if (warns.length > 0) {
    return {
      verdict: "warn",
      reason: "additive_drift",
      detail: `${warns.length} additive change(s) — backward-compatible.`,
      diffs,
      expectedStatus,
      actualStatus: res.status,
    };
  }
  return {
    verdict: "pass",
    reason: "ok",
    detail: "Status + body shape match the contract.",
    expectedStatus,
    actualStatus: res.status,
  };
}

// ── Reporters ───────────────────────────────────────────────────────────────

const VERDICT_EMOJI = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  skip: "⏭️",
};

export function renderMarkdown(results, { baseUrl, generatedAt }) {
  const total = results.length;
  const counts = countByVerdict(results);
  const lines = [];
  lines.push("# Pact contract drift report");
  lines.push("");
  lines.push(`- **Generated:** ${generatedAt}`);
  lines.push(`- **Base URL:** \`${baseUrl}\``);
  lines.push(
    `- **Totals:** ${total} interaction(s) — ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail, ${counts.skip} skip`,
  );
  lines.push("");
  lines.push(
    "Verdict legend: ✅ pass · ⚠️ warn (additive drift, backward-compatible) · ❌ fail (shape break) · ⏭️ skip.",
  );
  lines.push("");
  lines.push("## Per-interaction");
  lines.push("");
  lines.push("| Verdict | Method | Path | Status | Reason | Detail |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    const emoji = VERDICT_EMOJI[r.verdict] ?? r.verdict;
    const path = r.interaction.request.path;
    const method = r.interaction.request.method;
    const status =
      r.actualStatus && r.expectedStatus
        ? r.actualStatus === r.expectedStatus
          ? `${r.actualStatus}`
          : `${r.actualStatus} (expected ${r.expectedStatus})`
        : "-";
    lines.push(
      `| ${emoji} ${r.verdict} | ${method} | \`${path}\` | ${status} | ${r.reason} | ${oneLine(r.detail)} |`,
    );
  }
  const failed = results.filter((r) => r.verdict === "fail");
  if (failed.length > 0) {
    lines.push("");
    lines.push("## Failures (detail)");
    for (const r of failed) {
      lines.push("");
      lines.push(
        `### ❌ \`${r.interaction.request.method} ${r.interaction.request.path}\``,
      );
      lines.push("");
      lines.push(`- **Reason:** ${r.reason}`);
      lines.push(`- **Detail:** ${r.detail}`);
      if (Array.isArray(r.diffs) && r.diffs.length > 0) {
        lines.push("- **Diff entries:**");
        for (const d of r.diffs) {
          lines.push(
            `  - ${d.severity === "fail" ? "❌" : "⚠️"} \`${d.path}\` — ${d.kind}` +
              (d.expected ? ` (expected: \`${d.expected}\`)` : "") +
              (d.actual ? ` (actual: \`${d.actual}\`)` : ""),
          );
        }
      }
    }
  }
  const warned = results.filter((r) => r.verdict === "warn");
  if (warned.length > 0) {
    lines.push("");
    lines.push("## Warnings (additive drift)");
    for (const r of warned) {
      lines.push("");
      lines.push(
        `### ⚠️ \`${r.interaction.request.method} ${r.interaction.request.path}\``,
      );
      lines.push("");
      lines.push(`- ${r.detail}`);
      if (Array.isArray(r.diffs) && r.diffs.length > 0) {
        for (const d of r.diffs) {
          lines.push(
            `  - \`${d.path}\` — ${d.kind}` +
              (d.actual ? ` (actual: \`${d.actual}\`)` : ""),
          );
        }
      }
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "_See `docs/testing/pact-drift-runbook.md` for triage steps and fix recipes._",
  );
  return lines.join("\n");
}

function oneLine(s) {
  if (!s) return "-";
  return String(s).replace(/\s+/g, " ").slice(0, 160);
}

function countByVerdict(results) {
  const out = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of results) out[r.verdict] = (out[r.verdict] ?? 0) + 1;
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.STAGING_BASE_URL ?? "",
    cookie: process.env.STAGING_SESSION_COOKIE ?? "",
    pactFilesEnv: process.env.PACT_FILES ?? "",
    timeoutMs: Number(process.env.PACT_DRIFT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    includeMutations: false,
    strict: false,
    reportPath: null,
    jsonPath: null,
    dryRun: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base-url") opts.baseUrl = argv[++i];
    else if (a === "--cookie") opts.cookie = argv[++i];
    else if (a === "--pact-files") opts.pactFilesEnv = argv[++i];
    else if (a === "--timeout") opts.timeoutMs = Number(argv[++i]);
    else if (a === "--include-mutations") opts.includeMutations = true;
    else if (a === "--strict") opts.strict = true;
    else if (a === "--report") opts.reportPath = argv[++i];
    else if (a === "--json") opts.jsonPath = argv[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

const HELP = `pact-drift-check — runtime drift checker for Pact consumer contracts

Usage:
  node scripts/pact-drift-check.mjs [options]

Options:
  --base-url <url>          Provider base URL (default: $STAGING_BASE_URL)
  --cookie <value>          Full Cookie header for auth (default: $STAGING_SESSION_COOKIE)
  --pact-files <paths>      ":"-separated list of pact JSON files
                            (default: packages/api-client/pacts/*.json)
  --timeout <ms>            Per-request timeout (default: 10000)
  --include-mutations       Also exercise POST/PUT/PATCH/DELETE interactions
  --strict                  Treat warnings as failures
  --report <path>           Write markdown report
  --json <path>             Write machine-readable JSON
  --dry-run                 Parse pacts + plan; no HTTP, no exit-1 on fail
  -h, --help                Show this help

Exit codes:
  0   all PASS/WARN/SKIP
  1   at least one FAIL (or any WARN under --strict)
  2   script-level error (bad args, no pacts found, …)
`;

export async function runMain(argv = process.argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (!opts.dryRun && !opts.baseUrl) {
    process.stderr.write(
      "error: --base-url (or $STAGING_BASE_URL) is required.\n",
    );
    return 2;
  }

  let pactFiles;
  try {
    pactFiles = discoverPactFiles({ pactFilesEnv: opts.pactFilesEnv });
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 2;
  }
  if (pactFiles.length === 0) {
    process.stderr.write("error: no pact files found.\n");
    return 2;
  }

  let interactions;
  try {
    interactions = loadPactFiles(pactFiles);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 2;
  }

  const generatedAt = new Date().toISOString();
  const results = [];
  for (const interaction of interactions) {
    if (opts.dryRun) {
      results.push({
        interaction,
        verdict: "skip",
        reason: "dry_run",
        detail: "Dry-run mode — no HTTP request made.",
      });
      continue;
    }
    const verdictPayload = await executeInteraction(interaction, {
      baseUrl: opts.baseUrl,
      cookie: opts.cookie,
      timeoutMs: opts.timeoutMs,
      includeMutations: opts.includeMutations,
    });
    results.push({ interaction, ...verdictPayload });
  }

  const counts = countByVerdict(results);
  const hardFail = counts.fail > 0;
  const strictFail = opts.strict && counts.warn > 0;
  const exitCode = hardFail || strictFail ? 1 : 0;

  const reportMarkdown = renderMarkdown(results, {
    baseUrl: opts.baseUrl || "(dry-run)",
    generatedAt,
  });
  process.stdout.write(`${reportMarkdown}\n`);

  if (opts.reportPath) {
    writeFileSync(opts.reportPath, reportMarkdown, "utf-8");
  }
  if (opts.jsonPath) {
    writeFileSync(
      opts.jsonPath,
      JSON.stringify(
        {
          generatedAt,
          baseUrl: opts.baseUrl || null,
          counts,
          exitCode,
          results: results.map((r) => ({
            method: r.interaction.request.method,
            path: r.interaction.request.path,
            description: r.interaction.description,
            verdict: r.verdict,
            reason: r.reason,
            detail: r.detail,
            expectedStatus: r.expectedStatus ?? null,
            actualStatus: r.actualStatus ?? null,
            diffs: r.diffs ?? [],
          })),
        },
        null,
        2,
      ),
      "utf-8",
    );
  }

  return exitCode;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runMain(process.argv).then((code) => {
    process.exit(code);
  });
}
