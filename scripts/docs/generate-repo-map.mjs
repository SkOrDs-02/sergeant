#!/usr/bin/env node
// scripts/docs/generate-repo-map.mjs
//
// Build a machine-readable mirror of `docs/architecture/repo-map.md` by
// enumerating workspaces (`pnpm-workspace.yaml`) and parsing each
// `package.json`. Output: `docs/governance/repo-map.auto.json`.
//
// Acts as a **drift detector**: the markdown view stays hand-maintained
// (editorial Purpose column, build/deploy narrative, test-stack
// summaries). This generator verifies that every workspace listed in
// the JSON appears verbatim in the markdown — catching the case where
// a new package lands without the matrix doc being updated.
//
// Phase 3 of Initiative 0014. The plan originally said «replace
// repo-map.md with auto-gen»; switched to drift-detector here so we
// keep the rich hand-maintained Purpose / Stack narrative which can't
// be derived from code.
//
// Usage:
//   node scripts/docs/generate-repo-map.mjs            # write
//   node scripts/docs/generate-repo-map.mjs --check    # CI gate
//
// Exits 1 on `--check` diff, missing workspace coverage in the
// markdown view, or I/O error.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const OUT_JSON = resolve(REPO_ROOT, "docs/governance/repo-map.auto.json");
const VIEW_MD = resolve(REPO_ROOT, "docs/architecture/repo-map.md");
const CODEOWNERS_PATH = resolve(REPO_ROOT, ".github/CODEOWNERS");
const ROOT_PKG = resolve(REPO_ROOT, "package.json");

const SCHEMA_VERSION = 1;
const WORKSPACE_GLOBS = ["apps/*", "packages/*", "tools/*"];

// Whitelist of dependency names that go into `frameworkDeps`.
// Anything not in this set is excluded from the auto-derived snapshot
// to keep the JSON focused on signals a human cares about (framework,
// runtime, test runner). The map value is the category label used
// elsewhere if we ever want to facet the view.
const FRAMEWORK_WHITELIST = new Set([
  "react",
  "react-dom",
  "react-native",
  "vite",
  "express",
  "fastify",
  "expo",
  "@capacitor/core",
  "@capacitor/cli",
  "tailwindcss",
  "@tanstack/react-query",
  "zod",
  "drizzle-orm",
  "drizzle-kit",
  "@anthropic-ai/sdk",
  "voyage-ai",
  "pg",
  "better-auth",
  "@sentry/node",
  "@sentry/browser",
  "@sentry/react",
  "pino",
  "prom-client",
  "grammy",
  "node-cron",
  "typescript",
  "vitest",
  "jest",
  "playwright",
  "@playwright/test",
  "msw",
  "ts-node",
  "tsx",
  "nativewind",
  "@anthropic-ai/claude-code",
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

function categoryFor(workspacePath) {
  if (workspacePath.startsWith("apps/")) return "app";
  if (workspacePath.startsWith("packages/")) return "package";
  if (workspacePath.startsWith("tools/")) return "tool";
  return "package";
}

function inferTestRunner(scripts) {
  const t = (scripts?.test || "").toLowerCase();
  if (!t) return null;
  if (t.includes("vitest")) return "vitest";
  if (t.includes("jest")) return "jest";
  if (t.includes("playwright")) return "playwright";
  if (t.includes("lhci")) return "lhci";
  if (t.includes("node --test")) return "node-test";
  return null;
}

function listWorkspaceDirs() {
  const dirs = [];
  for (const pattern of WORKSPACE_GLOBS) {
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
      if (existsSync(join(abs, "package.json"))) dirs.push(abs);
    }
  }
  return dirs.sort();
}

function loadOwners() {
  const text = readSafe(CODEOWNERS_PATH);
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [pathPattern, ...handles] = line.split(/\s+/);
    if (!pathPattern || handles.length === 0) continue;
    rules.push({ pattern: pathPattern, handle: handles[0] });
  }
  return rules;
}

function ownerFor(workspaceRel, rules) {
  // CODEOWNERS uses gitignore-like globs. We do a cheap prefix match
  // by stripping leading slash + trailing slash and testing
  // startsWith. Good enough for /apps/web/, /packages/api-client/ etc.
  // For unmatched, fall back to the most-specific `/apps/*` style rule.
  const normalized = workspaceRel.endsWith("/")
    ? workspaceRel
    : workspaceRel + "/";
  // Most-specific first: prefer longer prefixes.
  const candidates = rules
    .map((r) => {
      const p = r.pattern.replace(/^\//, "").replace(/\*\*$/, "");
      return { prefix: p, handle: r.handle };
    })
    .filter(
      (r) => r.prefix && normalized.startsWith(r.prefix.replace(/\*$/, "")),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return candidates[0]?.handle || null;
}

function pickFrameworkDeps(pkg) {
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
  const out = [];
  for (const [name, version] of Object.entries(deps)) {
    if (FRAMEWORK_WHITELIST.has(name)) {
      out.push({ name, version });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function extractToolchain() {
  const root = readJSON(ROOT_PKG) || {};
  const dev = root.devDependencies || {};
  return {
    node: root.engines?.node || null,
    pnpm: root.packageManager || root.engines?.pnpm || null,
    typescript: dev.typescript || null,
    turbo: dev.turbo || null,
  };
}

// ── Build ───────────────────────────────────────────────────────────────────

export function buildRepoMap() {
  const dirs = listWorkspaceDirs();
  const owners = loadOwners();
  const workspaces = [];
  for (const dir of dirs) {
    const pkg = readJSON(join(dir, "package.json"));
    if (!pkg?.name) continue;
    const rel = relPath(dir);
    workspaces.push({
      name: pkg.name,
      path: rel,
      category: categoryFor(rel),
      ...(pkg.private === true ? { private: true } : {}),
      ...(pkg.version ? { version: pkg.version } : {}),
      ...(pkg.type ? { type: pkg.type } : {}),
      frameworkDeps: pickFrameworkDeps(pkg),
      testRunner: inferTestRunner(pkg.scripts),
      owner: ownerFor(rel, owners),
    });
  }
  workspaces.sort((a, b) => {
    // app → tool → package (matches narrative order in markdown)
    const order = { app: 0, tool: 1, package: 2 };
    if (a.category !== b.category) return order[a.category] - order[b.category];
    return a.name.localeCompare(b.name);
  });
  return {
    $schema: "./schemas/repo-map.schema.json",
    version: SCHEMA_VERSION,
    generated_at: todayISO(),
    toolchain: extractToolchain(),
    workspaces,
  };
}

// ── Markdown coverage check ─────────────────────────────────────────────────

/**
 * Verify that every workspace listed in `repoMap.workspaces` is mentioned
 * (by its package name OR its workspace path) somewhere in the markdown
 * view. Returns an array of error strings (empty if everything passes).
 */
export function findMissingMentions(repoMap, viewText) {
  const errors = [];
  for (const ws of repoMap.workspaces) {
    const nameQuoted = "`" + ws.name + "`";
    const pathQuoted = "`" + ws.path + "`";
    const nameOk = viewText.includes(nameQuoted) || viewText.includes(ws.name);
    const pathOk = viewText.includes(pathQuoted) || viewText.includes(ws.path);
    if (!nameOk && !pathOk) {
      errors.push(
        `workspace ${ws.name} (${ws.path}) is not mentioned in ${relPath(VIEW_MD)}`,
      );
    }
  }
  return errors;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function renderJSON(map) {
  return JSON.stringify(map, null, 2) + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const wantsCheck = args.includes("--check");

  const map = buildRepoMap();
  const nextJson = renderJSON(map);
  const viewText = readSafe(VIEW_MD);

  const coverageErrors = findMissingMentions(map, viewText);

  if (wantsCheck) {
    const current = readSafe(OUT_JSON);
    let mismatch = false;
    if (current !== nextJson) {
      console.error(
        `${relPath(OUT_JSON)} is out of date. Run \`pnpm docs:gen-repo-map\` and commit.`,
      );
      mismatch = true;
    }
    if (coverageErrors.length > 0) {
      console.error(
        `${relPath(VIEW_MD)} is missing ${coverageErrors.length} workspace mention${coverageErrors.length === 1 ? "" : "s"}:`,
      );
      for (const err of coverageErrors) console.error(`  - ${err}`);
      mismatch = true;
    }
    if (mismatch) process.exit(1);
    console.log(
      `repo-map.auto.json: up to date (${map.workspaces.length} workspace${map.workspaces.length === 1 ? "" : "s"}); markdown coverage OK.`,
    );
    process.exit(0);
  }

  writeFileSync(OUT_JSON, nextJson);
  if (coverageErrors.length > 0) {
    console.warn(
      `Warning: ${relPath(VIEW_MD)} is missing ${coverageErrors.length} workspace mention${coverageErrors.length === 1 ? "" : "s"}; --check would fail.`,
    );
    for (const err of coverageErrors) console.warn(`  - ${err}`);
  }
  console.log(
    `Wrote ${relPath(OUT_JSON)} (${map.workspaces.length} workspace${map.workspaces.length === 1 ? "" : "s"}).`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) main();
