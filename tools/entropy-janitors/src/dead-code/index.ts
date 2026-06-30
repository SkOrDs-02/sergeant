import { logger } from "../shared/logger.js";
import { runKnipJson, toFindings } from "./knip-runner.js";
import type {
  JanitorResult,
  JanitorOptions,
  JanitorReport,
} from "../shared/types.js";

const HARDCODED_LIMIT = 200;

function parseArgs(
  argv: readonly string[],
): JanitorOptions & { help: boolean; workspace: boolean } {
  const opts = {
    root: process.cwd(),
    dryRun: false,
    json: false,
    outDir: undefined as string | undefined,
    limit: undefined as number | undefined,
    help: false,
    workspace: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--root") {
      const v = argv[++i];
      if (v) opts.root = v;
    } else if (a === "--out-dir") {
      const v = argv[++i];
      if (v) opts.outDir = v;
    } else if (a === "--limit") {
      const v = argv[++i];
      if (v) opts.limit = Number.parseInt(v, 10);
    } else if (a === "--no-workspace") {
      opts.workspace = false;
    }
  }
  return opts;
}

function printHelp(): void {
  const text = [
    "dead-code — run Knip and report unused files/exports/dependencies",
    "",
    "Usage:",
    "  pnpm --filter @sergeant/entropy-janitors dead-code [options]",
    "",
    "Options:",
    "  --root <path>   Repo root (default: cwd)",
    "  --workspace     Run across all workspaces (default)",
    "  --no-workspace  Run on root package only",
    "  --dry-run       Print summary but do not open an issue",
    "  --json          Emit machine-readable JSON to stdout",
    "  --out-dir <p>   Write report.md / report.json (default: dist/entropy-janitors)",
    "  --limit <n>     Max findings (default: 200)",
    "  -h, --help      Show this help",
  ].join("\n");
  process.stdout.write(text + "\n");
}

export async function runDeadCode(
  argv: readonly string[],
): Promise<JanitorResult | null> {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const started = Date.now();
  let knip;
  try {
    knip = await runKnipJson(args.root, args.workspace);
  } catch (err) {
    logger.error("knip run failed", { error: String(err) });
    return {
      report: {
        kind: "dead-code",
        generatedAt: new Date().toISOString(),
        findings: [],
        summary: { scanned: 0, findings: 0, durationMs: Date.now() - started },
      },
      shouldOpenIssue: false,
      issueTitle: "tech-debt(dead-code): janitor error",
      issueBody: String(err),
      issueLabels: ["entropy-janitor/dead-code", "tech-debt"],
    };
  }
  const limit = args.limit ?? HARDCODED_LIMIT;
  const findings = toFindings(knip, limit);
  const report: JanitorReport = {
    kind: "dead-code",
    generatedAt: new Date().toISOString(),
    findings,
    summary: {
      scanned:
        knip.files.length +
        knip.exports.length +
        knip.dependencies.length +
        knip.devDependencies.length,
      findings: findings.length,
      durationMs: Date.now() - started,
    },
  };
  const result: JanitorResult = {
    report,
    shouldOpenIssue: findings.length > 0,
    issueTitle: `tech-debt(dead-code): ${findings.length} unused symbol${findings.length === 1 ? "" : "s"}`,
    issueBody: "",
    issueLabels: ["entropy-janitor/dead-code", "tech-debt"],
  };
  logger.info("dead-code complete", {
    files: knip.files.length,
    exports: knip.exports.length,
    deps: knip.dependencies.length + knip.devDependencies.length,
    findings: findings.length,
  });
  return result;
}

export { parseArgs as parseDeadCodeArgs, printHelp as printDeadCodeHelp };
