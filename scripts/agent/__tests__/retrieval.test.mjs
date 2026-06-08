// scripts/agent/__tests__/retrieval.test.mjs
//
// Integration tests for the agent retrieval entrypoint (Initiative 0018 Phase 1).
// Exercises the committed manifest + `agent:find` CLI end-to-end so the lexical
// ranking and the --check drift gate stay honest.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");
const BUILD = resolve(REPO_ROOT, "scripts/agent/build-retrieval-index.mjs");
const FIND = resolve(REPO_ROOT, "scripts/agent/find.mjs");
const EVAL = resolve(REPO_ROOT, "scripts/agent/eval-retrieval.mjs");
const MCP = resolve(REPO_ROOT, "scripts/agent/mcp-server.mjs");

function run(script, args = []) {
  return execFileSync("node", [script, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

function runJson(args) {
  // Without VOYAGE_API_KEY the CLI runs in lexical mode and returns
  // { mode: "lexical", results: [...] }.
  const parsed = JSON.parse(run(FIND, [...args, "--json"]));
  assert.equal(parsed.mode, "lexical");
  return parsed.results;
}

test("committed manifest is in sync (--check passes)", () => {
  const out = run(BUILD, ["--check"]);
  assert.match(out, /up to date/);
});

test("lexical search routes a domain query to the owning rule + ADR", () => {
  const results = runJson(["coerce bigint balance"]);
  assert.ok(results.length > 0, "expected at least one hit");
  const ids = results.map((r) => r.id);
  // The hard rule and/or the policy ADR must surface in the top results.
  assert.ok(
    ids.includes("hard-rule:1") || ids.includes("adr:0014"),
    `expected hard-rule:1 or adr:0014 in ${JSON.stringify(ids)}`,
  );
  // Top hit should carry a usable pointer.
  assert.ok(results[0].path && results[0].path.length > 0);
});

test("--type filter restricts results to that chunk type", () => {
  const results = runJson(["react query key", "--type", "playbook"]);
  assert.ok(results.length > 0);
  assert.ok(results.every((r) => r.type === "playbook"));
});

test("--k caps the number of results", () => {
  const results = runJson(["sync", "--k", "3"]);
  assert.ok(results.length <= 3);
});

test("symbol exports are searchable and resolve to a file pointer", () => {
  const results = runJson([
    "ALLOWED_TAILWIND_OPACITY_STEPS",
    "--type",
    "export",
  ]);
  assert.ok(results.length > 0, "expected the exported constant to be found");
  assert.equal(results[0].type, "export");
  assert.match(results[0].path, /\.(ts|tsx|js|mjs)$/);
});

test("empty query exits non-zero with usage", () => {
  assert.throws(() => run(FIND, []), /Usage/);
});

test("golden-set recall gate passes (lexical)", () => {
  // eval-retrieval.mjs exits 0 only when recall@K ≥ the warn threshold.
  const out = run(EVAL, ["--json"]);
  const summary = JSON.parse(out);
  assert.equal(summary.status, "pass");
  assert.ok(
    summary.recall >= summary.warn,
    `recall ${summary.recall} < warn ${summary.warn}`,
  );
});

test("MCP server answers initialize / tools/list / tools/call", () => {
  const lines = [
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}',
    '{"jsonrpc":"2.0","method":"notifications/initialized"}',
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"agent_find","arguments":{"query":"coerce bigint balance","k":2}}}',
  ].join("\n");
  const out = execFileSync("node", [MCP], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    input: lines,
  });
  const responses = out
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const byId = new Map(
    responses.filter((r) => r.id != null).map((r) => [r.id, r]),
  );

  assert.equal(byId.get(1).result.serverInfo.name, "sergeant-agent-find");
  assert.equal(byId.get(2).result.tools[0].name, "agent_find");
  const callText = byId.get(3).result.content[0].text;
  assert.match(callText, /hard-rule:|bigint/i);
});

test("cosineSimilarity behaves (Phase 2 vector math)", async () => {
  const { cosineSimilarity } = await import("../voyage.mjs");
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(Math.abs(cosineSimilarity([1, 1], [2, 2]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 2], null), 0);
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2]), 0); // length mismatch
});
