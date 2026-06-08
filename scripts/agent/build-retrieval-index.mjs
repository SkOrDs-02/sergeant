#!/usr/bin/env node
// scripts/agent/build-retrieval-index.mjs
//
// Build the agent retrieval manifest (`docs/governance/retrieval-index.json`)
// that powers `pnpm agent:find`. One chunk per knowledge-graph node + one per
// package export from the symbol index, each enriched with the source file's
// markdown headings so lexical (and, in Phase 2, semantic) search has real
// terms to match.
//
// The manifest is committed and diffable; vectors live out of git in a
// content-hash cache (Phase 2). This is the queryable source of truth.
//
// Sources:
//   docs/governance/knowledge-graph.json   (adr / initiative / playbook / skill / hard-rule / audit nodes)
//   docs/governance/symbol-index.json       (per-package exports → `export:` chunks)
//
// Schema: docs/governance/schemas/retrieval-index.schema.json
// ADR:    docs/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md
//
// Usage:
//   node scripts/agent/build-retrieval-index.mjs           # write
//   node scripts/agent/build-retrieval-index.mjs --check   # CI gate (exit 1 on drift)
//
// Exits 1 on `--check` drift or I/O error.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const GRAPH_PATH = resolve(REPO_ROOT, "docs/governance/knowledge-graph.json");
const SYMBOLS_PATH = resolve(REPO_ROOT, "docs/governance/symbol-index.json");
const OUT_JSON = resolve(REPO_ROOT, "docs/governance/retrieval-index.json");

const SCHEMA_VERSION = 1;

// PR nodes are pure backlinks — noise for "where is X" retrieval. Everything
// else in the graph is a navigable artifact worth surfacing.
const SKIP_NODE_TYPES = new Set(["pr"]);

// Cap heading enrichment so the manifest stays small and diffs stay readable.
const MAX_HEADINGS = 24;

// ── Helpers ──────────────────────────────────────────────────────────────────

function relPath(abs) {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function readSafe(abs) {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function readJson(abs) {
  const raw = readSafe(abs);
  if (!raw)
    throw new Error(
      `Cannot read ${relPath(abs)} — run the upstream generators first.`,
    );
  return JSON.parse(raw);
}

// Extract H1–H3 headings from a markdown file to enrich the searchable text.
function headingsFor(relFilePath) {
  if (!relFilePath || !relFilePath.endsWith(".md")) return [];
  const raw = readSafe(resolve(REPO_ROOT, relFilePath));
  if (!raw) return [];
  const headings = [];
  for (const line of raw.split("\n")) {
    const m = /^#{1,3}\s+(.+?)\s*$/.exec(line);
    if (m) headings.push(m[1].replace(/[`*_]/g, "").trim());
    if (headings.length >= MAX_HEADINGS) break;
  }
  return headings;
}

// Collapse whitespace and dedupe so chunk text is compact and deterministic.
function normalizeText(parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const clean = String(part ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.join(" · ");
}

// Resolve a symbol export's `fromFile` (relative to the package entry dir) to a
// repo-relative pointer the agent can open.
function resolveExportPath(pkg, fromFile) {
  if (!fromFile || fromFile === ".") return pkg.entryFile ?? pkg.path;
  if (fromFile.startsWith(".")) {
    const entryDir = posix.dirname(
      (pkg.entryFile ?? pkg.path).split(sep).join("/"),
    );
    return posix.normalize(posix.join(entryDir, fromFile));
  }
  return pkg.entryFile ?? pkg.path;
}

// ── Build ──────────────────────────────────────────────────────────────────

function buildChunks() {
  const graph = readJson(GRAPH_PATH);
  const symbols = readJson(SYMBOLS_PATH);
  const chunks = [];

  // 1. Knowledge-graph nodes → one chunk each (adr / initiative / playbook /
  //    skill / hard-rule / audit), enriched with the source file's headings.
  for (const node of graph.nodes ?? []) {
    if (SKIP_NODE_TYPES.has(node.type)) continue;
    const headings = headingsFor(node.path);
    const metaValues = Object.values(node.meta ?? {}).map((v) => String(v));
    const text = normalizeText([
      node.title,
      node.id,
      node.type,
      node.status,
      ...metaValues,
      ...headings,
    ]);
    chunks.push({
      id: node.id,
      type: node.type,
      path: node.path,
      line: 1,
      title: node.title ?? node.id,
      tier: node.tier ?? "core",
      status: node.status,
      text,
      contentHash: sha256(text),
    });
  }

  // 2. Package exports → `export:` chunks (extended tier; symbol-level detail).
  for (const pkg of Object.values(symbols.packages ?? {})) {
    for (const exp of pkg.exports ?? []) {
      const path = resolveExportPath(pkg, exp.fromFile);
      const id = `export:${pkg.name}:${exp.name}`;
      const text = normalizeText([
        exp.name,
        exp.kind,
        pkg.name,
        path,
        exp.usageCount != null ? `used ${exp.usageCount}×` : "",
        (exp.usedBy ?? []).length === 0 ? "dead export unused" : "",
      ]);
      chunks.push({
        id,
        type: "export",
        path,
        title: `${exp.name} (${exp.kind})`,
        tier: "extended",
        text,
        contentHash: sha256(text),
      });
    }
  }

  // Deterministic order — stable diffs across regenerations.
  chunks.sort((a, b) => a.id.localeCompare(b.id));
  return chunks;
}

function buildManifest() {
  const chunks = buildChunks();
  const counts = {};
  for (const c of chunks) counts[c.type] = (counts[c.type] ?? 0) + 1;
  counts.total = chunks.length;

  return {
    $schema: "./schemas/retrieval-index.schema.json",
    version: SCHEMA_VERSION,
    generated_at: new Date().toISOString().slice(0, 10),
    sourceHashes: {
      "knowledge-graph": sha256(readSafe(GRAPH_PATH)),
      "symbol-index": sha256(readSafe(SYMBOLS_PATH)),
    },
    counts,
    chunks,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function formatJson(obj, filepath) {
  const opts = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(JSON.stringify(obj), { ...opts, parser: "json" });
}

async function main() {
  const wantsCheck = process.argv.slice(2).includes("--check");

  // `generated_at` is a clock value, so the committed manifest may carry a
  // different date than today; compare everything except that field.
  const manifest = buildManifest();
  const next = await formatJson(manifest, OUT_JSON);

  if (wantsCheck) {
    const current = readSafe(OUT_JSON);
    const strip = (s) =>
      s.replace(/"generated_at":\s*"[^"]*"/, '"generated_at":""');
    if (strip(current) !== strip(next)) {
      console.error(
        `${relPath(OUT_JSON)} is out of date. Run \`pnpm agent:build-index\` and commit.`,
      );
      process.exit(1);
    }
    console.log(
      `retrieval-index: up to date (${manifest.counts.total} chunks).`,
    );
    process.exit(0);
  }

  writeFileSync(OUT_JSON, next);
  console.log(
    `Wrote ${relPath(OUT_JSON)} (${manifest.counts.total} chunks across ${Object.keys(manifest.counts).length - 1} types).`,
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
