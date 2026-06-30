#!/usr/bin/env node
import { runDocDrift } from "./doc-drift/index.js";
import { runDeadCode } from "./dead-code/index.js";
import { runDepCycles } from "./dep-cycles/index.js";
import {
  printCliSummary,
  buildIssuePayload,
  writeReportArtifacts,
} from "./shared/output.js";
import { runCapture, ghIssueExists } from "./shared/git.js";
import { logger } from "./shared/logger.js";
import type {
  JanitorResult,
  JanitorOptions,
  IssueDispatch,
} from "./shared/types.js";

type Command = "doc-drift" | "dead-code" | "dep-cycles" | "all" | "help";

function commandFromArgv(argv: readonly string[]): {
  command: Command;
  rest: string[];
} {
  const first = argv[0];
  if (!first || first === "help" || first === "--help" || first === "-h") {
    return { command: "help", rest: [] };
  }
  if (
    first === "doc-drift" ||
    first === "dead-code" ||
    first === "dep-cycles" ||
    first === "all"
  ) {
    return { command: first, rest: argv.slice(1) as string[] };
  }
  return { command: "doc-drift", rest: argv as string[] };
}

function printGlobalHelp(): void {
  const text = [
    "entropy-janitors — scheduled repo entropy checks (Harness Engineering v1)",
    "",
    "Subcommands:",
    "  doc-drift    Broken doc references (path:line)",
    "  dead-code    Unused files/exports/dependencies (Knip wrapper)",
    "  dep-cycles   Circular dependencies in apps/ and packages/",
    "  all          Run all three sequentially",
    "  help         Show this help",
    "",
    "Each subcommand accepts: --root, --dry-run, --json, --out-dir, --limit, -h/--help",
    "See `pnpm --filter @sergeant/entropy-janitors <subcommand> --help` for details.",
  ].join("\n");
  process.stdout.write(text + "\n");
}

async function maybeOpenIssue(
  result: JanitorResult,
  options: JanitorOptions,
  repo: string,
  branch: string,
  commitSha: string,
): Promise<IssueDispatch> {
  if (options.dryRun) return { created: false, reason: "dry-run" };
  if (!result.shouldOpenIssue) return { created: false, reason: "no-findings" };
  const exists = await ghIssueExists(result.issueTitle);
  if (exists) return { created: false, reason: "duplicate" };
  const payload = buildIssuePayload(result, repo, branch, commitSha);
  const args = [
    "issue",
    "create",
    "--title",
    payload.title,
    "--body",
    payload.body,
    "--label",
    payload.labels.join(","),
  ];
  const proc = await runCapture("gh", args, { cwd: options.root });
  if (proc.code !== 0) {
    logger.error("gh issue create failed", { stderr: proc.stderr });
    return { created: false, reason: "gh-failed" };
  }
  const match = proc.stdout.match(/\/issues\/(\d+)/);
  const num = match && match[1] ? Number.parseInt(match[1], 10) : undefined;
  return { created: true, number: num, reason: "ok" };
}

async function getRepoContext(
  root: string,
): Promise<{ repo: string; branch: string; commitSha: string }> {
  const branchProc = await runCapture(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: root },
  );
  const shaProc = await runCapture("git", ["rev-parse", "HEAD"], { cwd: root });
  const remoteProc = await runCapture("git", ["remote", "get-url", "origin"], {
    cwd: root,
  });
  const remote = remoteProc.stdout.trim();
  const match = remote.match(/[:/]([^/:]+\/[^/:]+?)(?:\.git)?$/);
  const repo = match && match[1] ? match[1] : "unknown/unknown";
  return {
    repo,
    branch: branchProc.stdout.trim() || "HEAD",
    commitSha: shaProc.stdout.trim() || "unknown",
  };
}

function toOptions(
  rest: readonly string[],
): JanitorOptions & { workspace: boolean } {
  const out: {
    root: string;
    dryRun: boolean;
    workspace: boolean;
    json?: boolean;
    outDir?: string;
    limit?: number;
  } = {
    root: process.cwd(),
    dryRun: false,
    workspace: true,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--root") {
      const v = rest[++i];
      if (v) out.root = v;
    } else if (a === "--out-dir") {
      const v = rest[++i];
      if (v) out.outDir = v;
    } else if (a === "--limit") {
      const v = rest[++i];
      if (v) out.limit = Number.parseInt(v, 10);
    } else if (a === "--no-workspace") {
      out.workspace = false;
    }
  }
  return out;
}

async function runSubcommand(
  command: "doc-drift" | "dead-code" | "dep-cycles",
  rest: readonly string[],
): Promise<JanitorResult | null> {
  if (command === "doc-drift") return runDocDrift(rest);
  if (command === "dead-code") return runDeadCode(rest);
  return runDepCycles(rest);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { command, rest } = commandFromArgv(argv);
  if (command === "help") {
    printGlobalHelp();
    return;
  }
  const options = toOptions(rest);
  const outDir = options.outDir ?? "dist/entropy-janitors";
  const effectiveOptions: JanitorOptions = { ...options, outDir };

  if (command === "all") {
    let totalFindings = 0;
    for (const sub of ["doc-drift", "dead-code", "dep-cycles"] as const) {
      const result = await runSubcommand(sub, rest);
      if (!result) continue;
      printCliSummary(result, effectiveOptions);
      if (result.shouldOpenIssue) {
        const { reportPath } = await writeReportArtifacts(
          result,
          effectiveOptions,
        );
        logger.info(`artifact written: ${reportPath}`);
        const ctx = await getRepoContext(options.root);
        const issue = await maybeOpenIssue(
          result,
          effectiveOptions,
          ctx.repo,
          ctx.branch,
          ctx.commitSha,
        );
        logger.info("issue dispatch", { kind: sub, ...issue });
      }
      totalFindings += result.report.findings.length;
    }
    logger.info("all janitors complete", { totalFindings });
    return;
  }

  const result = await runSubcommand(command, rest);
  if (!result) return;
  printCliSummary(result, effectiveOptions);
  if (result.shouldOpenIssue) {
    await writeReportArtifacts(result, effectiveOptions);
    const ctx = await getRepoContext(options.root);
    const issue = await maybeOpenIssue(
      result,
      effectiveOptions,
      ctx.repo,
      ctx.branch,
      ctx.commitSha,
    );
    logger.info("issue dispatch", { kind: command, ...issue });
  }
  if (result.report.findings.length > 0) {
    process.exitCode = 0;
  }
}

main().catch((err) => {
  logger.error("fatal", { error: String(err) });
  process.exitCode = 1;
});
