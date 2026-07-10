import { resolve } from "node:path";
import { logger } from "../shared/logger.js";
import { scanDualwriteResidue } from "./scan.js";
import type {
  JanitorOptions,
  JanitorReport,
  JanitorResult,
} from "../shared/types.js";

const HARDCODED_LIMIT = 200;

function parseArgs(
  argv: readonly string[],
): JanitorOptions & { help: boolean } {
  const opts: {
    root: string;
    dryRun: boolean;
    json: boolean;
    outDir?: string;
    limit?: number;
    help: boolean;
  } = {
    root: process.cwd(),
    dryRun: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--root") {
      const v = argv[++i];
      if (v) opts.root = resolve(v);
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
    "dualwrite-residue — flag new raw LS/MMKV module-data reads after teardown",
    "",
    "Usage:",
    "  pnpm --filter @sergeant/entropy-janitors dualwrite-residue [options]",
    "",
    "Options:",
    "  --root <path>   Repo root (default: cwd)",
    "  --dry-run       Print summary but do not open an issue",
    "  --json          Emit machine-readable JSON to stdout",
    "  --out-dir <p>   Write report.md / report.json",
    "  --limit <n>     Max findings (default: 200)",
    "  -h, --help      Show this help",
  ].join("\n");
  process.stdout.write(text + "\n");
}

export async function runDualwriteResidue(
  argv: readonly string[],
): Promise<JanitorResult | null> {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const started = Date.now();
  const limit = args.limit ?? HARDCODED_LIMIT;
  const { scanned, findings } = await scanDualwriteResidue({
    root: args.root,
    limit,
  });
  const report: JanitorReport = {
    kind: "dualwrite-residue",
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
    issueTitle: `tech-debt(dualwrite-residue): ${findings.length} LS module-data residue finding${findings.length === 1 ? "" : "s"}`,
    issueBody: "",
    issueLabels: ["entropy-janitor/dualwrite-residue", "tech-debt"],
  };
  logger.info("dualwrite-residue complete", {
    scanned,
    findings: findings.length,
    durationMs: report.summary.durationMs,
  });
  return result;
}

export { parseArgs, printHelp };
