import { runCapture } from "../shared/git.js";
import { logger } from "../shared/logger.js";
import type { DriftFinding } from "../shared/types.js";

export interface KnipRun {
  readonly files: readonly string[];
  readonly exports: readonly string[];
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  readonly durationMs: number;
}

interface KnipJsonReport {
  files?: Array<{ name?: string }>;
  exports?: Array<{ name?: string; file?: string }>;
  dependencies?: Array<{ name?: string }>;
  devDependencies?: Array<{ name?: string }>;
  _unusedTsconfigJson?: unknown;
}

export async function runKnipJson(
  root: string,
  workspace = false,
): Promise<KnipRun> {
  const started = Date.now();
  const args = [
    "--reporter",
    "json",
    workspace ? "--workspaces" : "--no-workspaces",
  ];
  const result = await runCapture("npx", ["--no-install", "knip", ...args], {
    cwd: root,
    timeoutMs: 180_000,
  });
  const durationMs = Date.now() - started;
  if (result.code !== 0 && result.stdout.length === 0) {
    throw new Error(`knip failed: ${result.stderr || "no stdout"}`);
  }
  let parsed: KnipJsonReport;
  try {
    parsed = JSON.parse(result.stdout || "{}") as KnipJsonReport;
  } catch (err) {
    logger.warn("knip JSON parse failed, falling back to empty result", {
      error: String(err),
    });
    parsed = {};
  }
  return {
    files: (parsed.files ?? [])
      .map((f) => f.name ?? "<unknown>")
      .filter(Boolean),
    exports: (parsed.exports ?? []).map(
      (e) => `${e.file ?? "?"}:${e.name ?? "?"}`,
    ),
    dependencies: (parsed.dependencies ?? [])
      .map((d) => d.name ?? "<unknown>")
      .filter(Boolean),
    devDependencies: (parsed.devDependencies ?? [])
      .map((d) => d.name ?? "<unknown>")
      .filter(Boolean),
    durationMs,
  };
}

export function toFindings(run: KnipRun, limit: number): DriftFinding[] {
  const out: DriftFinding[] = [];
  for (const f of run.files) {
    if (out.length >= limit) break;
    out.push({
      kind: "missing-symbol",
      path: f,
      message: "Unused file (Knip: not imported anywhere).",
      severity: "warning",
    });
  }
  for (const e of run.exports) {
    if (out.length >= limit) break;
    const [file, name] = e.split(":");
    out.push({
      kind: "missing-symbol",
      path: file ?? "<unknown>",
      message: `Unused export \`${name ?? "?"}\`.`,
      severity: "warning",
    });
  }
  for (const d of run.dependencies) {
    if (out.length >= limit) break;
    out.push({
      kind: "missing-symbol",
      path: "package.json",
      message: `Unused dependency \`${d}\`.`,
      severity: "warning",
    });
  }
  for (const d of run.devDependencies) {
    if (out.length >= limit) break;
    out.push({
      kind: "missing-symbol",
      path: "package.json",
      message: `Unused devDependency \`${d}\`.`,
      severity: "warning",
    });
  }
  return out;
}

void logger;
