#!/usr/bin/env node
// scripts/precommit-bench.mjs
//
// Mock pre-commit runner — D-1 follow-up (P1-5 from
// `docs/90-work/audits/2026-05-13-testing-devx-roast.md`). Generates a synthetic
// staged-files workload and runs the real pre-commit stages against it
// without touching git, so a contributor can profile the pipeline without
// having to manufacture a real commit.
//
// Stages exercised:
//   1. `prettier --write` over N `.ts` files + ceil(N/4) `.md` files.
//   2. `node scripts/staged-typecheck.mjs <ts files>` — exact same wrapper
//      that lint-staged invokes for `*.{ts,tsx}`.
//   3. `node scripts/docs/bump-last-validated.mjs <md files>` — exact same
//      wrapper that lint-staged invokes for `*.md` (SERGEANT_BUMP_EMAIL is
//      overridden so the bench runs without git config).
//
// Per-stage events emitted by the wrappers via `SERGEANT_TIMING_LOG`
// (see `docs/02-engineering/development/pre-commit-timing.md`) are aggregated alongside
// the wall-clock spawn time so the report exposes both inner ("ms inside
// the script") and outer ("ms incl. node startup") timing.
//
// Output:
//   - Markdown summary on stdout (parseable: stable column order).
//   - Exit code 0 unless a stage spawn fails — failed stages are listed
//     but the bench itself always exits 0 once cleanup is done, so CI
//     dashboards can run it on a schedule without poisoning the build.
//
// Usage:
//   pnpm precommit:bench               # default N = 20 synthetic .ts files
//   pnpm precommit:bench -- --count 50 # custom N
//   node scripts/precommit-bench.mjs --count=10
//
// Side-effects:
//   - Creates and deletes `.husky/.bench-tmp/run-XXXXXX/` (gitignored).
//   - Never spawns `git`, never writes to the index, never commits.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const BENCH_ROOT = join(REPO_ROOT, ".husky", ".bench-tmp");

function parseArgs(argv) {
  let count = 20;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--count" || a === "-n") && argv[i + 1] != null) {
      const next = Number(argv[++i]);
      if (Number.isFinite(next) && next > 0) count = next;
      continue;
    }
    if (a.startsWith("--count=")) {
      const next = Number(a.slice("--count=".length));
      if (Number.isFinite(next) && next > 0) count = next;
    }
  }
  return { count };
}

function makeMockFiles(workdir, count) {
  mkdirSync(workdir, { recursive: true });

  // Drop a self-contained tsconfig.json into the workdir so
  // `staged-typecheck.mjs`'s walk-up resolution picks it up (the repo root
  // has no `tsconfig.json` — only per-app/per-package ones do). Keeping the
  // tsconfig local also avoids polluting any package's `rootDir`/`include`.
  writeFileSync(
    join(workdir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          isolatedModules: true,
        },
      },
      null,
      2,
    ) + "\n",
  );

  const ts = [];
  for (let i = 0; i < count; i++) {
    const p = join(workdir, `mock-${i}.ts`);
    // Intentionally trivial: typechecks under the local bench tsconfig and
    // formats cleanly with Prettier defaults.
    writeFileSync(p, `export const mockValue${i}: number = ${i};\n`);
    ts.push(p);
  }
  const md = [];
  // 1 .md for every 4 .ts files (and at least one), matching the typical
  // ratio of docs:code edits in this repo.
  const mdCount = Math.max(1, Math.ceil(count / 4));
  for (let i = 0; i < mdCount; i++) {
    const p = join(workdir, `mock-${i}.md`);
    writeFileSync(
      p,
      [
        `# Mock doc ${i}`,
        ``,
        `> **Last validated:** 2024-01-01 by @bench. **Next review:** 2024-04-01.`,
        `> **Status:** Active`,
        ``,
        `Synthetic body for \`pnpm precommit:bench\`. Never committed.`,
        ``,
      ].join("\n"),
    );
    md.push(p);
  }
  return { ts, md };
}

function timeSpawn(label, command, args, env) {
  const start = performance.now();
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, ...(env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ms = performance.now() - start;
  return {
    label,
    ms,
    exitCode: result.status ?? (result.signal ? 1 : 0),
    error: result.error ? String(result.error.message ?? result.error) : null,
    stderrTail: result.stderr
      ? result.stderr.toString().trim().split("\n").slice(-3).join("\n")
      : "",
  };
}

function readStageEvents(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const events = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed.stage === "string" &&
        typeof parsed.ms === "number"
      ) {
        events.push(parsed);
      }
    } catch {
      // Skip malformed lines.
    }
  }
  return events;
}

function fmtMs(ms) {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function printReport({ count, summary, innerByStage, totalMs }) {
  const lines = [];
  lines.push("");
  lines.push(`⏱  precommit-bench summary  (N=${count} mock files)`);
  lines.push("");
  lines.push("    stage                   wall-clock   inner (script)   exit");
  lines.push("    ─────                   ──────────   ──────────────   ────");
  for (const row of summary) {
    const inner = innerByStage.get(row.label);
    const innerStr = inner ? fmtMs(inner) : "—";
    lines.push(
      `    ${row.label.padEnd(22)}  ${fmtMs(row.ms).padStart(10)}   ${innerStr.padStart(14)}   ${String(row.exitCode).padStart(4)}`,
    );
  }
  lines.push("    ─────");
  lines.push(`    ${"total".padEnd(22)}  ${fmtMs(totalMs).padStart(10)}`);
  lines.push("");
  // Surface any failing-stage stderr tails so a slow-stage diagnosis is
  // self-contained (no need to re-run with stdio: inherit).
  for (const row of summary) {
    if (row.exitCode !== 0 && row.stderrTail) {
      lines.push(`    [${row.label}] last stderr:`);
      for (const errLine of row.stderrTail.split("\n")) {
        lines.push(`      ${errLine}`);
      }
    }
    if (row.error) {
      lines.push(`    [${row.label}] spawn error: ${row.error}`);
    }
  }
  lines.push("");
  process.stdout.write(lines.join("\n"));
}

function main() {
  const { count } = parseArgs(process.argv.slice(2));

  mkdirSync(BENCH_ROOT, { recursive: true });
  const workdir = mkdtempSync(join(BENCH_ROOT, "run-"));
  const eventLog = join(workdir, "events.jsonl");

  const summary = [];
  const totalStart = performance.now();

  try {
    const { ts, md } = makeMockFiles(workdir, count);

    summary.push(
      timeSpawn(
        "prettier",
        "pnpm",
        [
          "exec",
          "prettier",
          "--write",
          "--no-error-on-unmatched-pattern",
          ...ts.map((p) => relative(REPO_ROOT, p)),
          ...md.map((p) => relative(REPO_ROOT, p)),
        ],
        { SERGEANT_TIMING_LOG: eventLog },
      ),
    );

    summary.push(
      timeSpawn(
        "staged-typecheck",
        process.execPath,
        [
          resolve(__dirname, "staged-typecheck.mjs"),
          ...ts.map((p) => relative(REPO_ROOT, p)),
        ],
        { SERGEANT_TIMING_LOG: eventLog },
      ),
    );

    summary.push(
      timeSpawn(
        "bump-last-validated",
        process.execPath,
        [
          resolve(__dirname, "docs", "bump-last-validated.mjs"),
          ...md.map((p) => relative(REPO_ROOT, p)),
        ],
        {
          SERGEANT_TIMING_LOG: eventLog,
          // Override committer-email resolution so the script does not
          // touch git config / spawn `git` from the synthetic workdir.
          SERGEANT_BUMP_EMAIL: "bench@local",
        },
      ),
    );

    const totalMs = performance.now() - totalStart;
    const events = readStageEvents(eventLog);
    const innerByStage = new Map();
    for (const { stage, ms } of events) {
      innerByStage.set(stage, (innerByStage.get(stage) ?? 0) + ms);
    }

    printReport({ count, summary, innerByStage, totalMs });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }

  return 0;
}

process.exit(main());
