#!/usr/bin/env node
// scripts/agent/eval-retrieval.mjs
//
// Quality gate for `agent:find` (Initiative 0018 Phase 3). Runs the golden set
// (scripts/agent/golden-retrieval.json) through the lexical ranker and reports
// recall@K and MRR. Lexical mode is forced so the gate is deterministic in CI
// (no API key / network). Mirrors the eval-rag-recall.mjs exit-code contract:
//   0 = pass (recall ≥ warn) · 1 = warn (kill ≤ recall < warn) · 2 = kill (recall < kill)
//
// Usage:
//   node scripts/agent/eval-retrieval.mjs          # human table
//   node scripts/agent/eval-retrieval.mjs --json    # machine-readable summary

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const FIND = resolve(REPO_ROOT, "scripts/agent/find.mjs");
const GOLDEN_PATH = resolve(REPO_ROOT, "scripts/agent/golden-retrieval.json");

function topResults(query, k) {
  const out = execFileSync(
    "node",
    [FIND, query, "--lexical", "--json", "--k", String(k)],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  return JSON.parse(out).results;
}

function main() {
  const json = process.argv.slice(2).includes("--json");
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
  const k = golden.k ?? 5;
  const warn = golden.thresholds?.warn ?? 0.8;
  const kill = golden.thresholds?.kill ?? 0.6;

  const rows = [];
  let hits = 0;
  let rrSum = 0;
  for (const c of golden.cases) {
    const ids = topResults(c.query, k).map((r) => r.id);
    const rank = ids.findIndex((id) => c.expected.includes(id)) + 1; // 0 → miss
    const hit = rank > 0;
    if (hit) hits += 1;
    rrSum += hit ? 1 / rank : 0;
    rows.push({ query: c.query, hit, rank: rank || null, top: ids[0] ?? null });
  }

  const recall = hits / golden.cases.length;
  const mrr = rrSum / golden.cases.length;
  const status = recall >= warn ? "pass" : recall >= kill ? "warn" : "kill";

  if (json) {
    console.log(
      JSON.stringify({ k, recall, mrr, warn, kill, status, rows }, null, 2),
    );
  } else {
    console.log(
      `agent:find golden eval (lexical, K=${k}) — ${golden.cases.length} cases\n`,
    );
    for (const r of rows) {
      const mark = r.hit ? `✓ @${r.rank}` : "✗ MISS";
      console.log(`  ${mark.padEnd(8)} ${r.query}`);
      if (!r.hit) console.log(`           top was: ${r.top ?? "(no results)"}`);
    }
    console.log(
      `\n  recall@${k} = ${recall.toFixed(3)}  ·  MRR = ${mrr.toFixed(3)}  ·  ` +
        `status = ${status} (warn ${warn} / kill ${kill})`,
    );
  }

  process.exit(status === "pass" ? 0 : status === "warn" ? 1 : 2);
}

main();
