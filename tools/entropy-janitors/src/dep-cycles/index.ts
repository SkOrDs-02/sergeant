import { logger } from "../shared/logger.js";
import { scanDepCycles } from "./scanner.js";
import type {
  JanitorResult,
  JanitorOptions,
  JanitorReport,
} from "../shared/types.js";

const HARDCODED_LIMIT = 50;

function parseArgs(
  argv: readonly string[],
): JanitorOptions & { help: boolean } {
  const opts = {
    root: process.cwd(),
    dryRun: false,
    json: false,
    outDir: undefined as string | undefined,
    limit: undefined as number | undefined,
    help: false,
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
    }
  }
  return opts;
}

function printHelp(): void {
  const text = [
    "dep-cycles — find circular dependencies in apps/ and packages/",
    "",
    "Usage:",
    "  pnpm --filter @sergeant/entropy-janitors dep-cycles [options]",
    "",
    "Options:",
    "  --root <path>   Repo root (default: cwd)",
    "  --dry-run       Print summary but do not open an issue",
    "  --json          Emit machine-readable JSON to stdout",
    "  --out-dir <p>   Write report.md / report.json (default: dist/entropy-janitors)",
    "  --limit <n>     Max findings (default: 50)",
    "  -h, --help      Show this help",
  ].join("\n");
  process.stdout.write(text + "\n");
}

export async function runDepCycles(
  argv: readonly string[],
): Promise<JanitorResult | null> {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const started = Date.now();
  const limit = args.limit ?? HARDCODED_LIMIT;
  const { scanned, findings } = await scanDepCycles(args.root, limit);
  const report: JanitorReport = {
    kind: "dep-cycles",
    generatedAt: new Date().toISOString(),
    findings,
    summary: {
      scanned,
      findings: findings.length,
      durationMs: Date.now() - started,
    },
  };
  const result: JanitorResult = {
    report,
    shouldOpenIssue: findings.length > 0,
    issueTitle: `tech-debt(dep-cycles): ${findings.length} circular dep${findings.length === 1 ? "" : "s"}`,
    issueBody: "",
    issueLabels: ["entropy-janitor/dep-cycles", "tech-debt"],
  };
  logger.info("dep-cycles complete", { scanned, findings: findings.length });
  return result;
}

export { parseArgs as parseDepCyclesArgs, printHelp as printDepCyclesHelp };
