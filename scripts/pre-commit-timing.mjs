#!/usr/bin/env node
// scripts/pre-commit-timing.mjs
//
// Pre-commit timing wrapper. Closes audit item P1-5 from
// `docs/90-work/audits/2026-05-13-testing-devx-roast.md` — "Pre-commit timing не
// вимірюється". Invoked by `.husky/pre-commit` instead of `pnpm exec
// lint-staged` directly, so we keep one source of truth for the staged
// pipeline while collecting non-invasive timing data.
//
// What it does:
//   1. Spawns `pnpm exec lint-staged --concurrent false` as a child
//      process (same command the hook used to run directly).
//   2. Measures wall-clock time around the spawn with
//      `perf_hooks.performance.now()`.
//   3. Optionally forwards per-stage events emitted by downstream
//      scripts via the `SERGEANT_TIMING_LOG` env var (JSONL contract,
//      documented in `docs/02-engineering/development/pre-commit-timing.md`).
//   4. Prints a Markdown summary to stderr so devs see it immediately
//      after a slow commit, without polluting stdout that git pipes.
//   5. Appends one JSON-lines record to
//      `.husky/.pre-commit-timings.log` (gitignored) for later
//      aggregation by `pnpm pre-commit:timings`.
//   6. Re-exits with the lint-staged exit code so commit semantics
//      stay identical (Hard Rule #7 — do not skip / weaken the hook).
//
// Opt-out:
//   - `SERGEANT_SKIP_TIMING=1 git commit ...` runs lint-staged directly
//     without timing capture. Provided for local debugging only — must
//     NOT be used as a CI gate (per task spec).
//
// Usage:
//   node scripts/pre-commit-timing.mjs
//
// Exit codes:
//   - Mirror the lint-staged child exit code.
//   - 2 — wrapper itself failed (failed to spawn child). The hook
//     still fails closed; commit is blocked.

import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const LOG_PATH = join(REPO_ROOT, ".husky", ".pre-commit-timings.log");

/**
 * Spawn lint-staged the same way `.husky/pre-commit` used to. Returns
 * the exit code of the child once it terminates.
 */
function runLintStaged(env) {
  return new Promise((resolveExit, rejectSpawn) => {
    const child = spawn(
      "pnpm",
      ["exec", "lint-staged", "--concurrent", "false"],
      {
        cwd: REPO_ROOT,
        stdio: "inherit",
        env,
        shell: process.platform === "win32",
      },
    );
    child.on("error", rejectSpawn);
    child.on("exit", (code, signal) => {
      if (typeof code === "number") {
        resolveExit(code);
        return;
      }
      // Signal-terminated processes have code=null; surface a non-zero
      // exit so the commit is blocked.
      resolveExit(signal ? 128 + 1 : 1);
    });
  });
}

/**
 * Parse the JSONL timing-events file written by downstream scripts.
 * Each non-empty line is `{ stage: string, ms: number }`. Malformed
 * lines are skipped silently — timing must never block a commit.
 */
function readStageEvents(path) {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const stages = [];
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
        stages.push({ stage: parsed.stage, ms: parsed.ms });
      }
    } catch {
      // Skip malformed lines.
    }
  }
  return stages;
}

/**
 * Aggregate stage events by stage name (sum of ms + count of invocations).
 */
function aggregateStages(events) {
  const agg = new Map();
  for (const { stage, ms } of events) {
    const cur = agg.get(stage) ?? { stage, totalMs: 0, calls: 0 };
    cur.totalMs += ms;
    cur.calls += 1;
    agg.set(stage, cur);
  }
  return [...agg.values()].sort((a, b) => b.totalMs - a.totalMs);
}

function formatMs(ms) {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function printSummary({ totalMs, stages, exitCode }) {
  const lines = [];
  lines.push("");
  lines.push("⏱  pre-commit timing summary");
  lines.push(`   total: ${formatMs(totalMs)} · exit ${exitCode}`);
  if (stages.length > 0) {
    lines.push("   stages:");
    for (const { stage, totalMs: stageMs, calls } of stages) {
      const callsLabel = calls === 1 ? "1 call" : `${calls} calls`;
      lines.push(
        `     - ${stage.padEnd(24)} ${formatMs(stageMs).padStart(9)}  (${callsLabel})`,
      );
    }
  }
  lines.push("   log:   .husky/.pre-commit-timings.log (gitignored)");
  lines.push(
    "   tip:   run `pnpm pre-commit:timings` to see p50/p95 over recent commits.",
  );
  lines.push("");
  process.stderr.write(lines.join("\n"));
}

function appendLogRecord(record) {
  try {
    appendFileSync(LOG_PATH, `${JSON.stringify(record)}\n`, "utf8");
  } catch (err) {
    // Logging must never block a commit. Surface a one-line note and
    // continue.
    process.stderr.write(
      `\n[pre-commit-timing] failed to append to ${LOG_PATH}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

async function main() {
  // Opt-out path — keeps behaviour identical to the pre-wrapper era so
  // a contributor can fall back if the wrapper ever misbehaves.
  if (process.env.SERGEANT_SKIP_TIMING === "1") {
    const code = await runLintStaged(process.env);
    process.exit(code);
  }

  // Per-stage events live in a session-scoped tmp file so concurrent
  // commits never trample each other (e.g. CI jobs, rebase loops).
  const sessionDir = mkdtempSync(join(tmpdir(), "sergeant-precommit-timing-"));
  const stageEventsPath = join(sessionDir, "events.jsonl");
  const childEnv = {
    ...process.env,
    SERGEANT_TIMING_LOG: stageEventsPath,
  };

  const startedAt = performance.now();
  let exitCode = 1;
  try {
    exitCode = await runLintStaged(childEnv);
  } catch (err) {
    process.stderr.write(
      `\n[pre-commit-timing] failed to spawn lint-staged: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    rmSync(sessionDir, { recursive: true, force: true });
    process.exit(2);
  }
  const totalMs = performance.now() - startedAt;

  const stageEvents = readStageEvents(stageEventsPath);
  const stages = aggregateStages(stageEvents);
  rmSync(sessionDir, { recursive: true, force: true });

  printSummary({ totalMs, stages, exitCode });
  appendLogRecord({
    ts: new Date().toISOString(),
    totalMs: Math.round(totalMs),
    stages: Object.fromEntries(
      stages.map((s) => [
        s.stage,
        { ms: Math.round(s.totalMs), calls: s.calls },
      ]),
    ),
    exitCode,
    node: process.versions.node,
  });

  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(
    `\n[pre-commit-timing] unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(2);
});
