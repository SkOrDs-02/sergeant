#!/usr/bin/env node
// scripts/docs/generate-symbol-catalog.mjs
//
// Build a per-workspace symbol catalog for every Sergeant workspace:
//   - `<workspace>/symbols.json` — exports declared at the workspace's
//      entry point, with cross-package usage counts (`usedBy[]`).
//   - `docs/04-governance/governance/symbol-index.json` — aggregated index of all
//      workspaces with summary counts (totals + dead-export count).
//   - `docs/04-governance/governance/symbol-index.html` — readable dashboard
//      (inline CSS, sortable tables, no external deps).
//
// Phase 2 of Initiative 0014 — Knowledge Graph & Auto-Generated Catalogs.
// ADR-0059 — TypeScript compiler API directly (rejected ts-morph as
// heavy additional dependency; TypeScript is already in devDependencies).
//
// Usage:
//   node scripts/docs/generate-symbol-catalog.mjs            # write
//   node scripts/docs/generate-symbol-catalog.mjs --check    # CI gate
//
// Exits 1 on `--check` diff or I/O error.

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const OUT_INDEX_JSON = resolve(
  REPO_ROOT,
  "docs/04-governance/governance/symbol-index.json",
);
const OUT_INDEX_HTML = resolve(
  REPO_ROOT,
  "docs/04-governance/governance/symbol-index.html",
);

const SCHEMA_VERSION = 1;

// Workspace glob patterns from pnpm-workspace.yaml.
// We don't import a YAML parser — the file is tiny and well-known shape.
const WORKSPACE_GLOBS = ["apps/*", "packages/*", "tools/*"];

// File extensions considered for cross-package usage scanning.
const SRC_EXTS = new Set([".ts", ".tsx", ".mts", ".cts"]);

// Directories pruned from scans.
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

function listWorkspaceDirs() {
  const dirs = [];
  for (const pattern of WORKSPACE_GLOBS) {
    // Pattern is always "<parent>/*"; we just list the parent.
    const parent = pattern.replace(/\/\*$/, "");
    const parentAbs = resolve(REPO_ROOT, parent);
    let entries;
    try {
      entries = readdirSync(parentAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const abs = join(parentAbs, ent.name);
      const pkgPath = join(abs, "package.json");
      if (existsSync(pkgPath)) dirs.push(abs);
    }
  }
  return dirs.sort();
}

function resolveEntryFile(pkgDir, pkg) {
  // Resolution order:
  // 1. source entrypoints (deterministic on clean CI and built worktrees)
  // 2. exports["."].types
  // 3. exports["."].default / exports["."] if string
  // 4. types
  // 5. main
  // 6. root index heuristic
  const candidates = [];
  candidates.push("./src/index.ts", "./src/index.tsx");
  if (pkg.exports && typeof pkg.exports === "object") {
    const dot = pkg.exports["."];
    if (typeof dot === "string") candidates.push(dot);
    else if (dot && typeof dot === "object") {
      if (typeof dot.types === "string") candidates.push(dot.types);
      if (typeof dot.import === "string") candidates.push(dot.import);
      if (typeof dot.default === "string") candidates.push(dot.default);
    }
  }
  if (typeof pkg.types === "string") candidates.push(pkg.types);
  if (typeof pkg.main === "string") candidates.push(pkg.main);
  candidates.push("./index.ts", "./index.tsx");
  for (const rel of candidates) {
    const abs = resolve(pkgDir, rel);
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}

// ── Symbol extraction ───────────────────────────────────────────────────────

/**
 * Walk top-level statements of `sourceFile` and produce a list of exports.
 * Each export: { name, kind, fromFile? }
 *
 * Handled forms:
 *   - export function foo() {}
 *   - export class Foo {}
 *   - export const foo = ...
 *   - export type Foo = ...
 *   - export interface Foo {}
 *   - export enum Foo {}
 *   - export { foo, bar }
 *   - export { foo, bar } from "./mod"
 *   - export * from "./mod"
 *   - export default <something>
 */
function extractSymbols(sourceFile) {
  const out = [];
  const isExported = (node) =>
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const stmt of sourceFile.statements) {
    // export { foo, bar } [from "..."]
    if (ts.isExportDeclaration(stmt)) {
      const fromFile = stmt.moduleSpecifier
        ? stmt.moduleSpecifier.getText(sourceFile).replace(/^["']|["']$/g, "")
        : undefined;
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const spec of stmt.exportClause.elements) {
          out.push({
            name: spec.name.text,
            kind: "re-export",
            ...(fromFile ? { fromFile } : {}),
          });
        }
      } else if (!stmt.exportClause) {
        out.push({
          name: "*",
          kind: "re-export-star",
          ...(fromFile ? { fromFile } : {}),
        });
      }
      continue;
    }
    // export default ...
    if (ts.isExportAssignment(stmt)) {
      out.push({ name: "default", kind: "default-export" });
      continue;
    }
    if (!isExported(stmt)) continue;

    // export function / class / enum
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      out.push({ name: stmt.name.text, kind: "function" });
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      out.push({ name: stmt.name.text, kind: "class" });
    } else if (ts.isEnumDeclaration(stmt)) {
      out.push({ name: stmt.name.text, kind: "enum" });
    } else if (ts.isInterfaceDeclaration(stmt)) {
      out.push({ name: stmt.name.text, kind: "interface" });
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      out.push({ name: stmt.name.text, kind: "type" });
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          out.push({ name: decl.name.text, kind: "const" });
        }
      }
    }
  }

  // Deduplicate by name (re-exports + named exports collide).
  const seen = new Set();
  const dedup = [];
  for (const sym of out) {
    const key = `${sym.name}|${sym.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(sym);
  }
  return dedup;
}

function parseEntryExports(entryAbs) {
  const text = readSafe(entryAbs);
  if (!text) return [];
  const sf = ts.createSourceFile(
    entryAbs,
    text,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ false,
    entryAbs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return extractSymbols(sf);
}

// ── Cross-package usage scan ────────────────────────────────────────────────

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
 * Build a map { "@sergeant/foo": [{ file, imports: ["a", "b"] }, ...] }
 * by scanning every TS source file under workspace roots once.
 * Regex-based — does not handle dynamic imports or aliased import names
 * (`import { x as y }` records `x`, which matches the original export).
 */
function collectImports(workspaceDirs) {
  const importsByPkg = new Map();
  const files = [];
  for (const wsAbs of workspaceDirs) {
    const srcAbs = join(wsAbs, "src");
    if (existsSync(srcAbs)) walkSourceFiles(srcAbs, files);
    else walkSourceFiles(wsAbs, files);
  }

  // Regexes: ESM static imports + re-exports.
  // We accept both single- and double-quoted module specifiers.
  const RE_IMPORT_FROM =
    /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+from\s+)?["'](@sergeant\/[\w-]+)["']/g;
  const RE_IMPORT_NAMES =
    /(?:import|export)\s+(?:type\s+)?\{([^}]+)\}\s*from\s+["'](@sergeant\/[\w-]+)["']/g;

  for (const abs of files) {
    const text = readSafe(abs);
    if (!text) continue;
    // First find every (file, package) edge; named imports added below.
    for (const m of text.matchAll(RE_IMPORT_FROM)) {
      const pkgName = m[1];
      if (!importsByPkg.has(pkgName)) importsByPkg.set(pkgName, []);
    }
    // Add named imports per file (per-package).
    for (const m of text.matchAll(RE_IMPORT_NAMES)) {
      const named = m[1];
      const pkgName = m[2];
      const names = named
        .split(",")
        .map((s) => s.trim())
        .map((s) => s.replace(/\s+as\s+\w+$/i, ""))
        .map((s) => s.replace(/^type\s+/i, ""))
        .filter(Boolean);
      if (!importsByPkg.has(pkgName)) importsByPkg.set(pkgName, []);
      importsByPkg.get(pkgName).push({ file: relPath(abs), names });
    }
  }
  return importsByPkg;
}

// ── Build ───────────────────────────────────────────────────────────────────

export function buildSymbolCatalog() {
  const workspaceDirs = listWorkspaceDirs();
  const importsByPkg = collectImports(workspaceDirs);

  const perPackage = [];
  for (const wsAbs of workspaceDirs) {
    const pkgPath = join(wsAbs, "package.json");
    const pkg = readJSON(pkgPath);
    if (!pkg || !pkg.name) continue;

    const entryAbs = resolveEntryFile(wsAbs, pkg);
    const exports = entryAbs ? parseEntryExports(entryAbs) : [];

    const imports = importsByPkg.get(pkg.name) || [];
    const usageByName = new Map();
    for (const { file, names } of imports) {
      for (const name of names) {
        if (!usageByName.has(name)) usageByName.set(name, new Set());
        usageByName.get(name).add(file);
      }
    }

    const exportsWithUsage = exports.map((sym) => {
      const usedBy = [...(usageByName.get(sym.name) || [])].sort();
      return {
        ...sym,
        usedBy,
        usageCount: usedBy.length,
      };
    });

    const totalImporters = new Set(imports.map((i) => i.file)).size;
    const deadExports = exportsWithUsage.filter(
      (s) =>
        s.usageCount === 0 &&
        s.kind !== "re-export-star" &&
        s.name !== "default",
    ).length;

    perPackage.push({
      name: pkg.name,
      path: relPath(wsAbs),
      entryFile: entryAbs ? relPath(entryAbs) : null,
      stats: {
        exportCount: exportsWithUsage.length,
        totalImporters,
        deadExports,
      },
      exports: exportsWithUsage,
    });
  }

  perPackage.sort((a, b) => a.name.localeCompare(b.name));

  return {
    version: SCHEMA_VERSION,
    generated_at: todayISO(),
    summary: {
      packages: perPackage.length,
      totalExports: perPackage.reduce((n, p) => n + p.stats.exportCount, 0),
      totalDeadExports: perPackage.reduce((n, p) => n + p.stats.deadExports, 0),
    },
    packages: perPackage,
  };
}

// ── Output writers ──────────────────────────────────────────────────────────

function renderPerPackageJSON(packageEntry, globalGeneratedAt) {
  // Trim the per-package view: skip the giant `summary`/`packages` block.
  // Each workspace gets its own minimal artifact.
  const body = {
    $schema:
      "../../docs/04-governance/governance/schemas/symbol-catalog.schema.json",
    version: SCHEMA_VERSION,
    generated_at: globalGeneratedAt,
    package: packageEntry.name,
    entryFile: packageEntry.entryFile,
    stats: packageEntry.stats,
    exports: packageEntry.exports,
  };
  return JSON.stringify(body, null, 2) + "\n";
}

function renderIndexJSON(catalog) {
  return JSON.stringify(catalog, null, 2) + "\n";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderIndexHTML(catalog) {
  const pkgRows = catalog.packages
    .map((p) => {
      const link = `<a href="../../${escapeHtml(p.path)}/symbols.json"><code>${escapeHtml(p.name)}</code></a>`;
      const deadClass = p.stats.deadExports > 0 ? "warn" : "";
      return `<tr><td>${link}</td><td><code>${escapeHtml(p.entryFile || "—")}</code></td><td class="num">${p.stats.exportCount}</td><td class="num">${p.stats.totalImporters}</td><td class="num ${deadClass}">${p.stats.deadExports}</td></tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<title>Sergeant — Symbol Index (${catalog.generated_at})</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 2rem; color: #111; }
  h1 { margin-top: 0; }
  .summary { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .chip { padding: .4rem .65rem; border-radius: 6px; font-weight: 600; background: #e2e3e5; color: #383d41; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; margin-top: 1rem; }
  th, td { padding: .35rem .55rem; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f6f8fa; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.warn { background: #fff3cd; font-weight: 600; }
  code { background: #f6f8fa; padding: 1px 4px; border-radius: 3px; font-size: 13px; }
  .auto-gen { color: #666; font-size: 13px; margin-bottom: 1rem; }
</style>
</head>
<body>
<h1>Sergeant — Symbol Index</h1>
<p class="auto-gen">Generated ${catalog.generated_at} · schema v${catalog.version} · regenerate via <code>pnpm docs:gen-symbols</code>.</p>
<div class="summary">
  <span class="chip">packages: <b>${catalog.summary.packages}</b></span>
  <span class="chip">exports: <b>${catalog.summary.totalExports}</b></span>
  <span class="chip">dead exports: <b>${catalog.summary.totalDeadExports}</b></span>
</div>
<table>
<thead><tr><th>Package</th><th>Entry file</th><th class="num">Exports</th><th class="num">Importers</th><th class="num">Dead</th></tr></thead>
<tbody>
${pkgRows}
</tbody>
</table>
<p class="auto-gen">Dead exports = entries with <code>usageCount === 0</code> excluding <code>re-export-star</code> and <code>default</code>. Cross-package usage scan is regex-based — does not yet resolve aliased imports.</p>
</body>
</html>
`;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

async function formatGenerated(content, parser, filepath) {
  const opts = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(content, { ...opts, parser });
}

async function main() {
  const args = process.argv.slice(2);
  const wantsCheck = args.includes("--check");

  const catalog = buildSymbolCatalog();

  // Build per-package outputs first.
  const perPackagePayloads = await Promise.all(
    catalog.packages.map(async (p) => {
      const target = resolve(REPO_ROOT, p.path, "symbols.json");
      return {
        target,
        content: await formatGenerated(
          renderPerPackageJSON(p, catalog.generated_at),
          "json",
          target,
        ),
      };
    }),
  );

  const indexJson = await formatGenerated(
    renderIndexJSON(catalog),
    "json",
    OUT_INDEX_JSON,
  );
  const indexHtml = await formatGenerated(
    renderIndexHTML(catalog),
    "html",
    OUT_INDEX_HTML,
  );

  if (wantsCheck) {
    // The generated_at stamp changes every calendar day, so a byte-exact
    // compare would flag every catalog as stale the day after it was
    // committed (breaking any PR that outlives midnight). Neutralize the
    // stamp on both sides before comparing — only real content drift fails.
    const stripGeneratedAt = (text) =>
      text === null
        ? null
        : text
            .replace(
              /"generated_at": "\d{4}-\d{2}-\d{2}"/g,
              '"generated_at": "<date>"',
            )
            .replace(
              /Symbol Index \(\d{4}-\d{2}-\d{2}\)/g,
              "Symbol Index (<date>)",
            )
            .replace(/Generated \d{4}-\d{2}-\d{2} ·/g, "Generated <date> ·");
    let mismatch = false;
    for (const { target, content } of perPackagePayloads) {
      const current = readSafe(target);
      if (stripGeneratedAt(current) !== stripGeneratedAt(content)) {
        console.error(
          `${relPath(target)} is out of date. Run \`pnpm docs:gen-symbols\` and commit.`,
        );
        mismatch = true;
      }
    }
    for (const [path, next] of [
      [OUT_INDEX_JSON, indexJson],
      [OUT_INDEX_HTML, indexHtml],
    ]) {
      const current = readSafe(path);
      if (stripGeneratedAt(current) !== stripGeneratedAt(next)) {
        console.error(
          `${relPath(path)} is out of date. Run \`pnpm docs:gen-symbols\` and commit.`,
        );
        mismatch = true;
      }
    }
    if (mismatch) process.exit(1);
    console.log(
      `symbol-index: up to date (${catalog.summary.packages} package${catalog.summary.packages === 1 ? "" : "s"}, ${catalog.summary.totalExports} export${catalog.summary.totalExports === 1 ? "" : "s"}, ${catalog.summary.totalDeadExports} dead).`,
    );
    process.exit(0);
  }

  for (const { target, content } of perPackagePayloads) {
    writeFileSync(target, content);
  }
  writeFileSync(OUT_INDEX_JSON, indexJson);
  writeFileSync(OUT_INDEX_HTML, indexHtml);

  console.log(
    `Wrote symbols.json for ${catalog.summary.packages} package${catalog.summary.packages === 1 ? "" : "s"}, ${relPath(OUT_INDEX_JSON)} and ${relPath(OUT_INDEX_HTML)} (${catalog.summary.totalExports} exports, ${catalog.summary.totalDeadExports} dead).`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  });
}
