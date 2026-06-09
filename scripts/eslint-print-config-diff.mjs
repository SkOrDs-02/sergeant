#!/usr/bin/env node
/**
 * ESLint print-config diff-test gate
 *
 * Runs `eslint --print-config <fixture>` for a set of surface-spanning
 * fixture files, normalises the resolved config (strip absolute paths,
 * recursively sort keys), and compares against committed snapshots under
 * `scripts/__fixtures__/eslint-print-config/`.
 *
 * Purpose: gate PR-31 Phase 2 (per-surface eslint.config.js extraction).
 * Any change to the resolved config — intended or accidental — flips
 * exactly the snapshots it affects; reviewer reads the diff to confirm
 * intent before merge.
 *
 * Usage:
 *   node scripts/eslint-print-config-diff.mjs            # CI mode: diff or pass
 *   node scripts/eslint-print-config-diff.mjs --update   # rewrite snapshots
 *   node scripts/eslint-print-config-diff.mjs --json     # machine-readable
 *
 * Exit codes:
 *   0 — all snapshots match (or --update wrote them)
 *   1 — at least one snapshot diverges (or eslint failed)
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT_DIR = join(
  REPO_ROOT,
  "scripts",
  "__fixtures__",
  "eslint-print-config",
);

/**
 * Fixture set — one entry per resolvable ESLint surface in the monorepo.
 * Add an entry when introducing a new app/package boundary; remove when a
 * surface is consolidated away.
 */
export const FIXTURES = [
  { surface: "server", path: "apps/server/src/index.ts" },
  { surface: "web", path: "apps/web/src/main.tsx" },
  { surface: "mobile", path: "apps/mobile/app/(tabs)/index.tsx" },
  { surface: "mobile-shell", path: "apps/mobile-shell/src/index.ts" },
  { surface: "shared", path: "packages/shared/src/index.ts" },
  { surface: "api-client", path: "packages/api-client/src/index.ts" },
  {
    surface: "eslint-plugin-sergeant-design",
    path: "packages/eslint-plugin-sergeant-design/index.js",
  },
];

/**
 * Normalise resolved ESLint config so snapshots are stable across machines:
 *   - replace REPO_ROOT prefix in every string with `<repo>`
 *   - replace native path separators with `/`
 *   - sort every object's keys
 *   - drop ESLint-internal keys that vary by run (`cwd`, plugin SHA blobs)
 */
export function normaliseConfig(config, repoRoot = REPO_ROOT) {
  const repoRootForward = repoRoot.split(sep).join("/");

  function visit(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(visit);
    if (typeof value === "object") {
      const sortedKeys = Object.keys(value).sort();
      const out = {};
      for (const key of sortedKeys) {
        if (key === "cwd") continue;
        out[key] = visit(value[key]);
      }
      return out;
    }
    if (typeof value === "string") {
      const forward = value.split(sep).join("/");
      if (forward.startsWith(repoRootForward)) {
        return "<repo>" + forward.slice(repoRootForward.length);
      }
      return forward;
    }
    return value;
  }

  return visit(config);
}

/**
 * Stable filename for a fixture's snapshot. Slashes → `__`, parens → `_`
 * so the resulting filename is portable on Windows.
 */
export function snapshotPathFor(fixturePath) {
  const slug = fixturePath
    .replaceAll("/", "__")
    .replaceAll("(", "_")
    .replaceAll(")", "_");
  return join(SNAPSHOT_DIR, slug + ".json");
}

function runEslintPrintConfig(fixturePath) {
  const onWindows = process.platform === "win32";
  const command = onWindows ? "pnpm.cmd" : "pnpm";
  // On Windows pnpm dispatches through a `.cmd` wrapper; without an explicit
  // shell the wrapper resolves but `execFileSync` cannot find the binary
  // along PATH for `pnpm` (no extension). With `shell: true` the `cmd.exe`
  // tokeniser then strips parens like `(tabs)`, so we wrap the fixture path
  // in literal double-quotes. POSIX shells pass either form fine.
  const arg = onWindows ? `"${fixturePath}"` : fixturePath;
  const stdout = execFileSync(
    command,
    ["exec", "eslint", "--print-config", arg],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      shell: onWindows,
    },
  );
  return JSON.parse(stdout);
}

function serialise(config) {
  return JSON.stringify(config, null, 2) + "\n";
}

function main() {
  const args = new Set(process.argv.slice(2));
  const updateMode = args.has("--update");
  const jsonMode = args.has("--json");

  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const results = [];

  for (const fixture of FIXTURES) {
    const fixtureAbs = join(REPO_ROOT, fixture.path);
    if (!existsSync(fixtureAbs)) {
      results.push({
        surface: fixture.surface,
        path: fixture.path,
        status: "skipped",
        reason: "fixture file missing",
      });
      continue;
    }

    let config;
    try {
      const raw = runEslintPrintConfig(fixture.path);
      config = normaliseConfig(raw);
    } catch (err) {
      results.push({
        surface: fixture.surface,
        path: fixture.path,
        status: "error",
        reason: err.stderr?.toString().slice(-500) ?? err.message,
      });
      continue;
    }

    const snapPath = snapshotPathFor(fixture.path);
    const next = serialise(config);

    if (updateMode) {
      writeFileSync(snapPath, next);
      results.push({
        surface: fixture.surface,
        path: fixture.path,
        status: existsSync(snapPath) ? "updated" : "created",
      });
      continue;
    }

    if (!existsSync(snapPath)) {
      results.push({
        surface: fixture.surface,
        path: fixture.path,
        status: "missing",
        reason: `snapshot not found at ${relative(REPO_ROOT, snapPath)} — run with --update`,
      });
      continue;
    }

    const prev = readFileSync(snapPath, "utf8");
    if (prev === next) {
      results.push({
        surface: fixture.surface,
        path: fixture.path,
        status: "match",
      });
    } else {
      results.push({
        surface: fixture.surface,
        path: fixture.path,
        status: "diff",
        snapshotPath: relative(REPO_ROOT, snapPath).replaceAll(sep, "/"),
      });
    }
  }

  const failed = results.filter(
    (r) =>
      r.status === "diff" || r.status === "missing" || r.status === "error",
  );

  if (jsonMode) {
    process.stdout.write(
      JSON.stringify({ results, failed: failed.length }, null, 2) + "\n",
    );
  } else {
    for (const r of results) {
      const tag =
        r.status === "match"
          ? "✓"
          : r.status === "updated" || r.status === "created"
            ? "↻"
            : r.status === "skipped"
              ? "·"
              : "✗";
      const tail =
        r.status === "diff"
          ? ` (snapshot: ${r.snapshotPath})`
          : r.reason
            ? ` — ${r.reason}`
            : "";
      process.stdout.write(
        `${tag} ${r.surface.padEnd(32)} ${r.status}${tail}\n`,
      );
    }
    if (failed.length > 0 && !updateMode) {
      process.stderr.write(
        `\n${failed.length} fixture(s) diverged. Run \`pnpm lint:eslint-config-diff -- --update\` to refresh snapshots after intentional config changes.\n`,
      );
    } else if (updateMode) {
      process.stdout.write(
        `\nWrote ${results.filter((r) => r.status === "updated" || r.status === "created").length} snapshot(s).\n`,
      );
    } else {
      process.stdout.write(`\nAll ${results.length} fixture(s) matched.\n`);
    }
  }

  process.exit(failed.length > 0 && !updateMode ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
