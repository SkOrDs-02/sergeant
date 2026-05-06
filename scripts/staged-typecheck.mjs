#!/usr/bin/env node
// scripts/staged-typecheck.mjs
//
// Pre-commit fast typecheck for staged TypeScript files. Linked to initiative
// 0009-agent-os-hardening.md (PR 1.3 — Husky pre-commit `tsc-files`).
//
// `tsc-files@1.x` resolves `tsconfig.json` from `process.cwd()`, so it cannot
// drive a multi-tsconfig monorepo when invoked from the repo root. This script
// wraps it: staged file paths arrive as positional args, we group each file
// under the nearest `tsconfig.json` walking up the directory tree, then spawn
// `tsc-files --noEmit` once per group with `cwd = tsconfigDir` and the file
// paths rewritten relative to that directory. That keeps `paths`/`extends`
// resolution faithful to each sub-project (apps/web, apps/server, packages/*).
//
// `tsc-files` rewrites the project's `tsconfig.json` with `include: []` and
// only the staged files in `files`. That drops any global type-augmentation
// `.d.ts` that the project relies on through its `include` list (e.g. mobile's
// `nativewind-env.d.ts` reference, which makes `className` valid on RN
// `View`/`Text`/`Pressable`). Without it every staged mobile change would fail
// pre-commit with TS2769 "No overload matches this call. Property 'className'
// does not exist". We re-add those globals via `EXTRA_INPUTS_BY_TSCONFIG`,
// keyed by the tsconfig's path relative to the repo root, so they ship as
// extra `files` entries to `tsc-files`.
//
// Usage (from `lint-staged`):
//   "*.{ts,tsx}": ["node scripts/staged-typecheck.mjs"]
//
// Direct invocation:
//   node scripts/staged-typecheck.mjs apps/web/src/foo.ts apps/server/src/bar.ts
//
// Exit code:
//   0 — all groups type-checked clean (or no TS files passed).
//   1 — at least one group failed (the specific tsc errors are streamed).

import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

/** Walk up from `absFile` until a directory containing `tsconfig.json` is found. */
function findTsconfig(absFile) {
  let dir = dirname(absFile);
  while (dir.length >= REPO_ROOT.length) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const TS_RE = /\.(ts|tsx)$/;

/**
 * Per-project global `.d.ts` references whose `include`-driven loading is
 * stripped by `tsc-files`. Keyed by the tsconfig path relative to the repo
 * root; each value is a list of paths relative to the same tsconfig's
 * directory. Files listed here are appended to every `tsc-files` invocation
 * for that group so the global type augmentations they bring in stay in scope.
 */
const EXTRA_INPUTS_BY_TSCONFIG = {
  "apps/mobile/tsconfig.json": ["nativewind-env.d.ts"],
};

function main() {
  const staged = process.argv
    .slice(2)
    .map((p) => resolve(REPO_ROOT, p))
    .filter((p) => TS_RE.test(p));

  if (staged.length === 0) {
    return 0;
  }

  /** Map<tsconfigPath, absFile[]> */
  const groups = new Map();
  const orphans = [];
  for (const f of staged) {
    const tsconfig = findTsconfig(f);
    if (!tsconfig) {
      orphans.push(f);
      continue;
    }
    if (!groups.has(tsconfig)) groups.set(tsconfig, []);
    groups.get(tsconfig).push(f);
  }

  for (const f of orphans) {
    console.warn(
      `[staged-typecheck] no tsconfig.json found above ${relative(REPO_ROOT, f)} — skipping`,
    );
  }

  if (groups.size === 0) return 0;

  let aggregate = 0;
  for (const [tsconfig, files] of groups) {
    const dir = dirname(tsconfig);
    const rel = files.map((f) => relative(dir, f));
    const tsconfigKey = relative(REPO_ROOT, tsconfig).replaceAll("\\", "/");
    const extras = (EXTRA_INPUTS_BY_TSCONFIG[tsconfigKey] ?? []).filter(
      (p) => existsSync(join(dir, p)) && !rel.includes(p),
    );
    console.log(
      `[staged-typecheck] ${rel.length} file(s) → ${tsconfigKey}` +
        (extras.length ? ` (+${extras.length} global d.ts)` : ""),
    );
    const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const result = spawnSync(
      pnpmBin,
      ["exec", "tsc-files", "--noEmit", "--skipLibCheck", ...rel, ...extras],
      {
        stdio: "inherit",
        cwd: dir,
        shell: process.platform === "win32",
      },
    );
    if (result.error) {
      console.error(
        `[staged-typecheck] failed to start ${pnpmBin}: ${result.error.message}`,
      );
    }
    if (result.status !== 0) {
      aggregate = result.status ?? 1;
    }
  }
  return aggregate;
}

process.exit(main());
