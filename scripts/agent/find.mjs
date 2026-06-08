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
//   --json       machine-readable output ({ mode, results })
//   --lexical    force lexical mode even when a Voyage key + vector cache exist
//
// Semantic mode activates automatically when VOYAGE_API_KEY is set and the
// vector cache (`pnpm agent:embed`) is populated; any Voyage error degrades to lexical.

import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cosineSimilarity,
  embedTexts,
  hasApiKey,
  loadVectorCache,
} from "./voyage.mjs";

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
  const opts = { type: null, k: 8, json: false, lexical: false, query: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type") opts.type = argv[++i];
    else if (a === "--k") opts.k = Math.max(1, Number(argv[++i]) || 8);
    else if (a === "--json") opts.json = true;
    else if (a === "--lexical") opts.lexical = true;
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

// Lexical ranking (Phase 1) — always available, zero network.
function rankLexical(candidates, opts) {
  const queryTokens = [...new Set(tokenize(opts.query))];
  const queryString = opts.query.toLowerCase();
  return candidates
    .map((c) => ({ chunk: c, score: scoreChunk(c, queryTokens, queryString) }))
    .filter((r) => r.score > 0);
}

// Semantic ranking (Phase 2) — blend cosine similarity with normalized lexical
// so exact-term hits still help and uncached chunks degrade gracefully.
async function rankSemantic(candidates, opts) {
  const cache = loadVectorCache();
  const [queryVec] = await embedTexts([opts.query], { inputType: "query" });
  const lexical = rankLexical(candidates, opts);
  const maxLex = Math.max(1, ...lexical.map((r) => r.score));
  const lexById = new Map(lexical.map((r) => [r.chunk.id, r.score]));

  const scored = candidates
    .map((chunk) => {
      const vec = cache.vectors[chunk.contentHash];
      const cosine = vec ? Math.max(0, cosineSimilarity(queryVec, vec)) : 0;
      const lexNorm = (lexById.get(chunk.id) ?? 0) / maxLex;
      return { chunk, score: 0.7 * cosine + 0.3 * lexNorm };
    })
    .filter((r) => r.score > 0);
  return scored;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.query) {
    console.error(
      'Usage: pnpm agent:find "<query>" [--type <t>] [--k <n>] [--json] [--lexical]',
    );
    process.exit(1);
  }

  const index = loadIndex();
  let candidates = index.chunks;
  if (opts.type) candidates = candidates.filter((c) => c.type === opts.type);

  // Mode selection with automatic degradation: semantic needs an API key AND a
  // populated vector cache; otherwise (or on any Voyage error) fall back to lexical.
  const cache = loadVectorCache();
  const canSemantic =
    !opts.lexical &&
    hasApiKey() &&
    cache &&
    Object.keys(cache.vectors ?? {}).length > 0;

  let mode = "lexical";
  let results;
  if (canSemantic) {
    try {
      results = await rankSemantic(candidates, opts);
      mode = "semantic";
    } catch (err) {
      console.error(
        `semantic mode failed (${err.message}); falling back to lexical.`,
      );
      results = rankLexical(candidates, opts);
    }
  } else {
    results = rankLexical(candidates, opts);
  }

  const ranked = results
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, opts.k);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          mode,
          results: ranked.map((r) => ({
            id: r.chunk.id,
            type: r.chunk.type,
            path: r.chunk.path,
            line: r.chunk.line ?? null,
            title: r.chunk.title,
            status: r.chunk.status ?? null,
            score: Number(r.score.toFixed(3)),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (ranked.length === 0) {
    console.log(
      `No matches for "${opts.query}" (${mode}). Try fewer / different terms.`,
    );
    return;
  }

  console.log(`agent:find "${opts.query}" — top ${ranked.length} (${mode}):\n`);
  for (const { chunk, score } of ranked) {
    // Don't append a line number to anchor-style pointers (e.g. foo.json#1).
    const where =
      chunk.line && !chunk.path.includes("#")
        ? `${chunk.path}:${chunk.line}`
        : chunk.path;
    const status = chunk.status ? ` {${chunk.status}}` : "";
    console.log(`  ${where}`);
    console.log(
      `    ${chunk.title}  [${chunk.type}]${status}  (${score.toFixed(2)})`,
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
