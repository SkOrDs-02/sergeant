import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { logger } from "../shared/logger.js";
import { scanDocDrift } from "./scan.js";
import type {
  JanitorResult,
  DriftFinding,
  JanitorOptions,
  JanitorReport,
} from "../shared/types.js";

const HARDCODED_LIMIT = 500;

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
    "doc-drift — find broken doc references (path:line)",
    "",
    "Usage:",
    "  pnpm --filter @sergeant/entropy-janitors doc-drift [options]",
    "",
    "Options:",
    "  --root <path>   Repo root (default: cwd)",
    "  --dry-run       Print summary but do not open an issue",
    "  --json          Emit machine-readable JSON to stdout",
    "  --out-dir <p>   Write report.md / report.json (default: dist/entropy-janitors)",
    "  --limit <n>     Max findings (default: 500)",
    "  -h, --help      Show this help",
  ].join("\n");
  process.stdout.write(text + "\n");
}

async function scanRqKeyReferences(
  root: string,
  knownKeys: readonly string[],
): Promise<DriftFinding[]> {
  if (knownKeys.length === 0) return [];
  const out: DriftFinding[] = [];
  const search = [
    "AGENTS.md",
    ".agents/skills",
    "docs/00-start/agents/agent-skills-catalog.md",
  ];
  for (const rel of search) {
    const p = resolve(root, rel);
    let body: string;
    try {
      body = await readFile(p, "utf8");
    } catch {
      continue;
    }
    for (const key of knownKeys) {
      if (!body.includes(key)) {
        out.push({
          kind: "missing-symbol",
          path: relative(root, p),
          message: `Hardcoded RQ-keys doc references symbol \`${key}\` not exported from queryKeys.ts.`,
          severity: "warning",
        });
      }
    }
  }
  return out;
}

export async function runDocDrift(
  argv: readonly string[],
): Promise<JanitorResult | null> {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }
  const started = Date.now();
  const limit = args.limit ?? HARDCODED_LIMIT;
  const { scanned, findings } = await scanDocDrift({ root: args.root, limit });
  const rqKeys = await readRqKeyNames(args.root);
  const rqFindings = await scanRqKeyReferences(args.root, rqKeys);
  const all = [...findings, ...rqFindings].slice(0, limit);
  const report: JanitorReport = {
    kind: "doc-drift",
    generatedAt: new Date().toISOString(),
    findings: all,
    summary: {
      scanned,
      findings: all.length,
      durationMs: Date.now() - started,
    },
  };
  const result: JanitorResult = {
    report,
    shouldOpenIssue: all.length > 0,
    issueTitle: `tech-debt(doc-drift): ${all.length} broken doc reference${all.length === 1 ? "" : "s"}`,
    issueBody: "",
    issueLabels: ["entropy-janitor/doc-drift", "tech-debt"],
  };
  logger.info("doc-drift complete", {
    scanned,
    findings: all.length,
    durationMs: report.summary.durationMs,
  });
  return result;
}

async function readRqKeyNames(root: string): Promise<string[]> {
  const p = resolve(root, "apps/web/src/shared/lib/api/queryKeys.ts");
  let body: string;
  try {
    body = await readFile(p, "utf8");
  } catch {
    return [];
  }
  const re = /export const (\w+Keys)\b/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1]) names.push(m[1]);
  }
  return names;
}

const _arg = parseArgs;
void _arg;
export { parseArgs, printHelp };
