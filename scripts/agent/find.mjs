#!/usr/bin/env node
// scripts/agent/find.mjs
//
// `pnpm agent:find "<query>"` — one search entrypoint over the committed
// retrieval manifest. Returns ranked `path:line — title [type]` pointers so an
// agent can jump straight to the right artifact instead of grepping blind.
//
// Phase 1 is lexical-only (token overlap, zero network, works offline). Phase 2
// layers Voyage embeddings on top with automatic fallback to this ranking when
// no API key is present. See docs/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md.
//
// Usage:
//   pnpm agent:find "coerce bigint balance"
//   pnpm agent:find "react query key" --type playbook --k 5
//   pnpm agent:find "sync conflict" --json
//
// Flags:
//   --type <t>   filter to one chunk type (adr|initiative|playbook|skill|hard-rule|audit|export|...)
//   --k <n>      number of results (default 8)
//   --json       machine-readable output

import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const INDEX_PATH = resolve(REPO_ROOT, "docs/governance/retrieval-index.json");

// Tiny stopword set — drop terms that match almost everything.
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "or",
  "is",
  "are",
  "where",
  "what",
  "how",
  "do",
  "does",
  "i",
  "we",
  "this",
  "that",
  "with",
  "де",
  "що",
  "як",
  "чи",
  "у",
  "в",
  "і",
  "та",
  "це",
]);

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9а-яіїєґ]+/iu)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function parseArgs(argv) {
  const opts = { type: null, k: 8, json: false, query: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type") opts.type = argv[++i];
    else if (a === "--k") opts.k = Math.max(1, Number(argv[++i]) || 8);
    else if (a === "--json") opts.json = true;
    else opts.query.push(a);
  }
  opts.query = opts.query.join(" ").trim();
  return opts;
}

function loadIndex() {
  let raw;
  try {
    raw = readFileSync(INDEX_PATH, "utf8");
  } catch {
    console.error(
      `retrieval index not found at ${relative(REPO_ROOT, INDEX_PATH).split(sep).join("/")}.\n` +
        `Run \`pnpm agent:build-index\` first.`,
    );
    process.exit(1);
  }
  return JSON.parse(raw);
}

// Lexical score: query-token overlap, weighted by where the term lands.
// Title/id hits count more than body-text hits; an exact title substring wins.
function scoreChunk(chunk, queryTokens, queryString) {
  const titleTokens = new Set(tokenize(chunk.title));
  const idTokens = new Set(tokenize(chunk.id));
  const textTokens = tokenize(chunk.text);
  const textCount = new Map();
  for (const t of textTokens) textCount.set(t, (textCount.get(t) ?? 0) + 1);

  let score = 0;
  let matched = 0;
  for (const qt of queryTokens) {
    let hit = false;
    if (titleTokens.has(qt)) {
      score += 6;
      hit = true;
    }
    if (idTokens.has(qt)) {
      score += 3;
      hit = true;
    }
    const tc = textCount.get(qt);
    if (tc) {
      score += 1 + Math.min(tc - 1, 3) * 0.25; // diminishing returns on repeats
      hit = true;
    }
    if (hit) matched += 1;
  }

  if (matched === 0) return 0;
  // Reward coverage of the query (all terms present > one term many times).
  score *= 0.5 + (matched / queryTokens.length) * 0.5;
  // Exact title substring → strong boost.
  if (queryString && chunk.title.toLowerCase().includes(queryString))
    score += 8;
  // Gentle tier preference: core artifacts before symbol-level detail.
  if (chunk.tier === "core") score += 0.5;
  return score;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.query) {
    console.error(
      'Usage: pnpm agent:find "<query>" [--type <t>] [--k <n>] [--json]',
    );
    process.exit(1);
  }

  const index = loadIndex();
  const queryTokens = [...new Set(tokenize(opts.query))];
  const queryString = opts.query.toLowerCase();

  let candidates = index.chunks;
  if (opts.type) candidates = candidates.filter((c) => c.type === opts.type);

  const ranked = candidates
    .map((c) => ({ chunk: c, score: scoreChunk(c, queryTokens, queryString) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, opts.k);

  if (opts.json) {
    console.log(
      JSON.stringify(
        ranked.map((r) => ({
          id: r.chunk.id,
          type: r.chunk.type,
          path: r.chunk.path,
          line: r.chunk.line ?? null,
          title: r.chunk.title,
          status: r.chunk.status ?? null,
          score: Number(r.score.toFixed(2)),
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (ranked.length === 0) {
    console.log(
      `No matches for "${opts.query}" (lexical). Try fewer / different terms.`,
    );
    return;
  }

  console.log(`agent:find "${opts.query}" — top ${ranked.length} (lexical):\n`);
  for (const { chunk, score } of ranked) {
    // Don't append a line number to anchor-style pointers (e.g. foo.json#1).
    const where =
      chunk.line && !chunk.path.includes("#")
        ? `${chunk.path}:${chunk.line}`
        : chunk.path;
    const status = chunk.status ? ` {${chunk.status}}` : "";
    console.log(`  ${where}`);
    console.log(
      `    ${chunk.title}  [${chunk.type}]${status}  (${score.toFixed(1)})`,
    );
  }
}

main();
