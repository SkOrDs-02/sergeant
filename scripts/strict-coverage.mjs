#!/usr/bin/env node
/**
 * strict-coverage.mjs
 *
 * Scans all tsconfig.json files in apps/* and packages/* and reports
 * strict TypeScript coverage per package. Resolves `extends` chains
 * naïvely (following local paths and @sergeant/config presets).
 *
 * Usage: node scripts/strict-coverage.mjs [--json] [--root <dir>]
 *
 * Outputs a markdown table to stdout (suitable for $GITHUB_STEP_SUMMARY).
 * With --json, outputs machine-readable JSON instead.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

// --- Helpers ---

// Strip JSON comments (single-line and block) and trailing commas,
// respecting string boundaries so "//" inside strings is preserved.
function stripJsonComments(text) {
  let result = "";
  let i = 0;
  while (i < text.length) {
    // String literal — pass through unchanged
    if (text[i] === '"') {
      result += '"';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") {
          result += text[i] + (text[i + 1] || "");
          i += 2;
        } else {
          result += text[i];
          i++;
        }
      }
      if (i < text.length) {
        result += '"';
        i++;
      }
    }
    // Single-line comment
    else if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    }
    // Block comment
    else if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
    } else {
      result += text[i];
      i++;
    }
  }
  // Remove trailing commas before } or ]
  result = result.replace(/,\s*([\]}])/g, "$1");
  return result;
}

/** Parse a tsconfig-like JSON file (with comments/trailing commas). */
function parseTsconfig(filePath) {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(stripJsonComments(raw));
}

/**
 * Workspace package aliases — resolved directly to the package's source
 * directory inside the monorepo so the script works without
 * `pnpm install` populating `node_modules`. Mirrors the alias map in
 * `tools/tsconfig-guard/check.mjs`; both must stay in sync.
 */
function getPackageAliasMap(rootDir) {
  return {
    "@sergeant/config": join(rootDir, "packages/config"),
  };
}

/**
 * Resolve `extends` to a file path.
 * Handles relative paths, workspace aliases (`@sergeant/*`), and
 * `node_modules` package references.
 */
function resolveExtends(extendsValue, fromDir, rootDir) {
  if (extendsValue.startsWith(".")) {
    const resolved = resolve(fromDir, extendsValue);
    if (existsSync(resolved)) return resolved;
    if (existsSync(resolved + ".json")) return resolved + ".json";
    return null;
  }

  // Workspace alias resolution — independent of node_modules state.
  const aliasMap = getPackageAliasMap(rootDir);
  for (const [alias, target] of Object.entries(aliasMap)) {
    if (extendsValue === alias) {
      const candidate = join(target, "tsconfig.json");
      if (existsSync(candidate)) return candidate;
    }
    if (extendsValue.startsWith(alias + "/")) {
      const rest = extendsValue.slice(alias.length + 1);
      const candidate = join(target, rest);
      if (existsSync(candidate)) return candidate;
      if (!candidate.endsWith(".json") && existsSync(candidate + ".json")) {
        return candidate + ".json";
      }
    }
  }

  // Package reference — try node_modules resolution
  const candidates = [
    join(rootDir, "node_modules", extendsValue),
    join(rootDir, "node_modules", extendsValue + ".json"),
    join(fromDir, "node_modules", extendsValue),
    join(fromDir, "node_modules", extendsValue + ".json"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve compilerOptions by following the `extends` chain (max 5 levels).
 * Returns merged compilerOptions.
 */
function resolveCompilerOptions(filePath, rootDir, depth = 0) {
  if (depth > 5 || !existsSync(filePath)) return {};

  const config = parseTsconfig(filePath);
  let parentOpts = {};

  if (config.extends) {
    const parentPath = resolveExtends(
      config.extends,
      dirname(filePath),
      rootDir,
    );
    if (parentPath) {
      parentOpts = resolveCompilerOptions(parentPath, rootDir, depth + 1);
    }
  }

  return { ...parentOpts, ...(config.compilerOptions || {}) };
}

// --- Glob helper ---

// Find files matching "baseDir/*/suffix" pattern.
function findFilesInSubdirs(baseDir, filename) {
  if (!existsSync(baseDir)) return [];

  const entries = readdirSync(baseDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const candidate = join(baseDir, entry.name, filename);
      if (existsSync(candidate)) {
        results.push(candidate);
      }
    }
  }
  return results;
}

// --- Main ---

/**
 * Scan the repo and return strict coverage info.
 * @param {string} rootDir - repo root
 * @returns {{ packages: Array<{name: string, path: string, strict: boolean, strictNullChecks: boolean, noImplicitAny: boolean, allowJs: boolean}>, summary: {total: number, strictCount: number, pct: number} }}
 */
export function scanStrictCoverage(rootDir) {
  const tsconfigPaths = [
    ...findFilesInSubdirs(join(rootDir, "apps"), "tsconfig.json"),
    ...findFilesInSubdirs(join(rootDir, "packages"), "tsconfig.json"),
  ].sort();

  const packages = [];

  for (const tsconfigPath of tsconfigPaths) {
    const opts = resolveCompilerOptions(tsconfigPath, rootDir);
    const relPath = tsconfigPath.replace(rootDir + "/", "");
    const name = relPath.replace("/tsconfig.json", "");

    const strict = opts.strict === true;
    const strictNullChecks =
      opts.strictNullChecks !== undefined
        ? opts.strictNullChecks === true
        : strict;
    const noImplicitAny =
      opts.noImplicitAny !== undefined ? opts.noImplicitAny === true : strict;
    const allowJs = opts.allowJs === true;

    packages.push({
      name,
      path: relPath,
      strict,
      strictNullChecks,
      noImplicitAny,
      allowJs,
    });
  }

  const total = packages.length;
  const strictCount = packages.filter((p) => p.strict).length;
  const pct = total > 0 ? Math.round((strictCount / total) * 100) : 0;

  return { packages, summary: { total, strictCount, pct } };
}

/** Format results as a markdown table. */
export function formatMarkdown(result) {
  const { packages, summary } = result;
  const lines = [];

  lines.push("## Strict TypeScript Coverage");
  lines.push("");
  lines.push(
    `**Summary:** ${summary.strictCount} / ${summary.total} packages have full \`strict: true\` (${summary.pct}%)`,
  );
  lines.push("");
  lines.push(
    "| Package | strict | strictNullChecks | noImplicitAny | allowJs |",
  );
  lines.push(
    "| ------- | ------ | ---------------- | ------------- | ------- |",
  );

  for (const pkg of packages) {
    const row = [
      pkg.name,
      pkg.strict ? "✅" : "❌",
      pkg.strictNullChecks ? "✅" : "❌",
      pkg.noImplicitAny ? "✅" : "❌",
      pkg.allowJs ? "⚠️" : "—",
    ];
    lines.push(`| ${row.join(" | ")} |`);
  }

  lines.push("");
  lines.push(
    `> strict TS coverage: ${summary.strictCount} / ${summary.total} packages (${summary.pct}%)`,
  );

  return lines.join("\n");
}

// --- CLI entrypoint ---

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const rootIdx = args.indexOf("--root");
  const rootDir =
    rootIdx !== -1 && args[rootIdx + 1]
      ? resolve(args[rootIdx + 1])
      : resolve(import.meta.dirname, "..");

  const result = scanStrictCoverage(rootDir);

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatMarkdown(result));
  }
}

// Run if invoked directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("strict-coverage.mjs");

if (isMain) {
  main();
}
