#!/usr/bin/env node
// scripts/docs/generate-architecture-diagrams.mjs
//
// Generate `docs/architecture/diagrams/c3-workspaces.md` — an auto-gen
// Mermaid LR graph showing `@sergeant/*` workspace dependency edges.
//
// Input: `docs/governance/symbol-index.json` (Phase 2 output). Each
// `package.exports[].usedBy[]` entry is a file path; group by workspace
// prefix (apps/*, packages/*, tools/*) to derive cross-workspace edges.
//
// Phase 4 of Initiative 0014. ADR-0060 documents why we only ship this
// one auto-gen file (rather than full C3 / C4 automation per the
// original plan): existing C3 diagrams carry editorial narrative that
// can't be derived from code, and C4 is excluded by repo policy.
//
// Usage:
//   node scripts/docs/generate-architecture-diagrams.mjs            # write
//   node scripts/docs/generate-architecture-diagrams.mjs --check    # CI gate
//
// Exits 1 on `--check` diff or I/O error.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const INPUT_INDEX = resolve(REPO_ROOT, "docs/governance/symbol-index.json");
const OUT_MD = resolve(
  REPO_ROOT,
  "docs/architecture/diagrams/c3-workspaces.md",
);

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function readJSON(abs) {
  try {
    return JSON.parse(readSafe(abs));
  } catch {
    return null;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Map a file path (e.g. `apps/web/src/...`, `packages/api-client/src/...`)
// to its workspace key (e.g. `apps/web`, `packages/api-client`).
function workspaceFromPath(filePath) {
  const parts = filePath.split("/");
  if (parts.length < 2) return null;
  if (parts[0] === "apps" || parts[0] === "packages" || parts[0] === "tools") {
    return `${parts[0]}/${parts[1]}`;
  }
  return null;
}

// Map workspace path to its category for visual styling.
function categoryOf(wsPath) {
  if (wsPath.startsWith("apps/")) return "app";
  if (wsPath.startsWith("packages/")) return "package";
  if (wsPath.startsWith("tools/")) return "tool";
  return "package";
}

// Convert a workspace path to a mermaid-safe node id (no slashes / dashes).
function mermaidId(wsPath) {
  return wsPath.replace(/[^a-z0-9]/gi, "_");
}

// ── Source-file scanner (covers re-export-star imports) ────────────────────

const SRC_EXTS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".next",
  "coverage",
  "__tests__",
  "__fixtures__",
  "ios",
  "android",
  ".expo",
]);

function walkSourceFiles(rootAbs, out = []) {
  let entries;
  try {
    entries = readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    if (ent.name.startsWith(".") && ent.name !== ".") continue;
    const abs = join(rootAbs, ent.name);
    if (ent.isDirectory()) {
      walkSourceFiles(abs, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const dot = ent.name.lastIndexOf(".");
    if (dot < 0) continue;
    if (!SRC_EXTS.has(ent.name.slice(dot))) continue;
    out.push(abs);
  }
  return out;
}

/**
 * Scan every workspace's `src/` directory for `from "@sergeant/<x>"`
 * import / export statements. Returns a Map<importerWs, Set<exporterPkg>>.
 *
 * Symbol-catalog's `usedBy[]` only fires for NAMED exports; `re-export-star`
 * packages (most of `@sergeant/shared`, `*-domain`, etc.) get listed with
 * `totalImporters` but no per-symbol usedBy entries — so iterating
 * `pkg.exports[].usedBy[]` misses their inbound edges. We close that gap
 * here with a direct regex pass.
 */
function collectImportEdges(workspaceRoots, pkgNameToPath) {
  const RE_IMPORT_FROM =
    /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+from\s+)?["'](@sergeant\/[\w-]+)["']/g;
  const edges = new Map(); // workspacePath → Set<workspacePath>
  for (const wsAbs of workspaceRoots) {
    const srcAbs = join(wsAbs, "src");
    const files = [];
    walkSourceFiles(srcAbs, files);
    const fromWs = relative(REPO_ROOT, wsAbs).split(sep).join("/");
    if (!edges.has(fromWs)) edges.set(fromWs, new Map());
    const fromMap = edges.get(fromWs);
    for (const file of files) {
      const text = readSafe(file);
      if (!text) continue;
      for (const m of text.matchAll(RE_IMPORT_FROM)) {
        const pkgName = m[1];
        const toWs = pkgNameToPath.get(pkgName);
        if (!toWs) continue;
        if (toWs === fromWs) continue;
        fromMap.set(toWs, (fromMap.get(toWs) || 0) + 1);
      }
    }
  }
  return edges;
}

// ── Build graph from symbol-index + source scan ────────────────────────────

export function buildWorkspaceGraph(symbolIndex) {
  // Map workspace path → metadata (name from package.json mirrored in index).
  const workspaces = new Map();
  const pkgNameToPath = new Map();
  for (const pkg of symbolIndex.packages || []) {
    workspaces.set(pkg.path, {
      path: pkg.path,
      name: pkg.name,
      category: categoryOf(pkg.path),
      exportCount: pkg.stats?.exportCount ?? 0,
      importerCount: pkg.stats?.totalImporters ?? 0,
    });
    pkgNameToPath.set(pkg.name, pkg.path);
  }

  // Edges: derive via direct source-file regex scan (covers re-export-star
  // packages — most of `@sergeant/shared`, `*-domain`, etc.). Inputs:
  // workspace paths from symbol-index → resolve each to an absolute path
  // and scan its `src/` for `from "@sergeant/<x>"` patterns.
  const workspaceAbsPaths = [...workspaces.keys()].map((p) =>
    resolve(REPO_ROOT, p),
  );
  const rawEdges = collectImportEdges(workspaceAbsPaths, pkgNameToPath);

  const edges = new Map();
  for (const [fromWs, toMap] of rawEdges) {
    for (const [toWs, count] of toMap) {
      // Ensure both endpoints are registered (importer-only workspaces
      // get a stub entry).
      if (!workspaces.has(fromWs)) {
        workspaces.set(fromWs, {
          path: fromWs,
          name: fromWs,
          category: categoryOf(fromWs),
          exportCount: 0,
          importerCount: 0,
        });
      }
      edges.set(`${fromWs}|${toWs}`, count);
    }
  }

  // Top-imported packages — sorted by `importerCount` (per symbol-index).
  const topImported = [...workspaces.values()]
    .filter((w) => w.importerCount > 0)
    .sort((a, b) => b.importerCount - a.importerCount)
    .slice(0, 5);

  const edgeList = [...edges.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split("|");
      return { from, to, count };
    })
    .sort((a, b) => {
      if (a.from !== b.from) return a.from.localeCompare(b.from);
      return a.to.localeCompare(b.to);
    });

  return {
    workspaces: [...workspaces.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    edges: edgeList,
    topImported,
  };
}

// ── Markdown / Mermaid rendering ────────────────────────────────────────────

function renderMermaid(graph) {
  const lines = ["flowchart LR"];

  // Group node declarations by category for readability.
  for (const cat of ["app", "tool", "package"]) {
    const ws = graph.workspaces.filter((w) => w.category === cat);
    if (ws.length === 0) continue;
    lines.push(`    subgraph ${cat}s["${cat}s"]`);
    for (const w of ws) {
      const label = w.name;
      lines.push(`        ${mermaidId(w.path)}["${label}"]`);
    }
    lines.push("    end");
  }

  // Edge list.
  for (const e of graph.edges) {
    lines.push(`    ${mermaidId(e.from)} --> ${mermaidId(e.to)}`);
  }

  // Class definitions for category coloring.
  lines.push("");
  lines.push("    classDef app fill:#1d4ed8,stroke:#1e40af,color:#fff");
  lines.push("    classDef tool fill:#b45309,stroke:#7c2d12,color:#fff");
  lines.push("    classDef package fill:#15803d,stroke:#166534,color:#fff");
  for (const cat of ["app", "tool", "package"]) {
    const ws = graph.workspaces.filter((w) => w.category === cat);
    if (ws.length === 0) continue;
    lines.push(
      `    class ${ws.map((w) => mermaidId(w.path)).join(",")} ${cat}`,
    );
  }

  return lines.join("\n");
}

function renderMarkdown(graph, generatedAt) {
  const mermaid = renderMermaid(graph);

  const totalEdges = graph.edges.length;
  const totalWorkspaces = graph.workspaces.length;

  const topImportedRows = graph.topImported
    .map(
      (w, i) =>
        `| ${i + 1} | \`${w.name}\` | ${w.importerCount} | ${w.exportCount} |`,
    )
    .join("\n");

  const inboundCounts = new Map();
  for (const e of graph.edges) {
    inboundCounts.set(e.to, (inboundCounts.get(e.to) || 0) + 1);
  }

  return `# C3 — Workspace dependency graph

> **Last validated:** ${generatedAt} by @Skords-01. **Next review:** ${addDays(generatedAt, 90)}.
> **Status:** Active

<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via \`pnpm docs:gen-architecture-diagrams\`. -->

Workspace-level dependency view of \`@sergeant/*\` import edges. Derived from [\`docs/governance/symbol-index.json\`](../../governance/symbol-index.json) (Phase 2 symbol catalog). Each edge \`A → B\` means workspace **A** imports at least one symbol from workspace **B** via static ESM \`import\` / \`export from\` statements.

**Limitations:** does not include dynamic \`await import()\`, runtime \`require()\`, or \`peerDependencies\` declared in \`package.json\`. For runtime deployment topology see [\`c2-containers.md\`](./c2-containers.md); for feature-level flows see \`c3-cloudsync.md\` / \`c3-chat-tool-use.md\`; for the rationale on what is and isn't auto-generated see [ADR-0060](../../adr/0060-architecture-diagrams-automation-scope.md).

## Graph

\`\`\`mermaid
${mermaid}
\`\`\`

## Stats

- **${totalWorkspaces}** workspaces total — ${graph.workspaces.filter((w) => w.category === "app").length} app${graph.workspaces.filter((w) => w.category === "app").length === 1 ? "" : "s"}, ${graph.workspaces.filter((w) => w.category === "package").length} package${graph.workspaces.filter((w) => w.category === "package").length === 1 ? "" : "s"}, ${graph.workspaces.filter((w) => w.category === "tool").length} tool${graph.workspaces.filter((w) => w.category === "tool").length === 1 ? "" : "s"}.
- **${totalEdges}** cross-workspace import edges.

## Top imported workspaces

The packages most other workspaces depend on. \`Importers\` = unique file count across all workspaces; \`Exports\` = symbols declared at the workspace entry.

| Rank | Workspace | Importers | Exports |
| ---- | --------- | --------- | ------- |
${topImportedRows}

## Drift detection

If a new workspace lands (or an existing one starts importing a new \`@sergeant/*\`) and this file is not regenerated, \`pnpm docs:check-architecture-diagrams\` fails in CI. To refresh:

\`\`\`bash
pnpm docs:gen-symbols                  # refresh symbol-index.json (Phase 2)
pnpm docs:gen-architecture-diagrams    # regenerate this diagram
\`\`\`

Both must succeed before commit.
`;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Markdown formatter (mirror generate-open-work.mjs) ──────────────────────

async function formatMarkdown(content) {
  const { default: prettier } = await import("prettier");
  const opts = (await prettier.resolveConfig(OUT_MD)) ?? {};
  return prettier.format(content, { ...opts, parser: "markdown" });
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const wantsCheck = args.includes("--check");

  const symbolIndex = readJSON(INPUT_INDEX);
  if (!symbolIndex) {
    console.error(
      `Cannot read ${relPath(INPUT_INDEX)} — run \`pnpm docs:gen-symbols\` first.`,
    );
    process.exit(1);
  }

  const graph = buildWorkspaceGraph(symbolIndex);
  const generatedAt = todayISO();
  const raw = renderMarkdown(graph, generatedAt);
  const next = await formatMarkdown(raw);

  if (wantsCheck) {
    const current = readSafe(OUT_MD);
    if (current !== next) {
      console.error(
        `${relPath(OUT_MD)} is out of date. Run \`pnpm docs:gen-architecture-diagrams\` and commit.`,
      );
      process.exit(1);
    }
    console.log(
      `architecture-diagrams: up to date (${graph.workspaces.length} workspace${graph.workspaces.length === 1 ? "" : "s"}, ${graph.edges.length} edge${graph.edges.length === 1 ? "" : "s"}).`,
    );
    process.exit(0);
  }

  writeFileSync(OUT_MD, next);
  console.log(
    `Wrote ${relPath(OUT_MD)} (${graph.workspaces.length} workspace${graph.workspaces.length === 1 ? "" : "s"}, ${graph.edges.length} edge${graph.edges.length === 1 ? "" : "s"}).`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) await main();
