#!/usr/bin/env node
// scripts/check-agents-family-sync.mjs
//
// Keeps thin platform-specific agent wrappers from becoming parallel policy
// documents. AGENTS.md remains the source of truth; CLAUDE.md, DEVIN.md and
// optional OPENAI.md may only point to it and keep short runtime notes.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_ROOT = resolve(__dirname, "..");

export const WRAPPER_FILES = ["CLAUDE.md", "DEVIN.md", "OPENAI.md"];
export const MAX_WRAPPER_LINES = 40;
const SOURCE_OF_TRUTH_RE =
  /^>\s+\*\*Single source of truth (?:->|→) \[AGENTS\.md\]\(\.\/AGENTS\.md\)\.\*\*/gm;

export function analyzeAgentWrapper(content, relPath) {
  const errors = [];
  const lines = content.split(/\r?\n/);
  const nonEmptyLineCount =
    lines.length > 0 && lines.at(-1) === "" ? lines.length - 1 : lines.length;
  const sourceMatches = [...content.matchAll(SOURCE_OF_TRUTH_RE)];

  if (sourceMatches.length !== 1) {
    errors.push(
      `${relPath}: expected exactly one single-source-of-truth line pointing to AGENTS.md, found ${sourceMatches.length}.`,
    );
  }

  if (nonEmptyLineCount > MAX_WRAPPER_LINES) {
    errors.push(
      `${relPath}: ${nonEmptyLineCount} lines exceeds ${MAX_WRAPPER_LINES}; move detailed policy into AGENTS.md or docs/.`,
    );
  }

  const startupHeadingIndex = lines.findIndex(
    (line) => line.trim() === "## Startup flow",
  );
  if (startupHeadingIndex === -1) {
    errors.push(`${relPath}: missing "## Startup flow" section.`);
    return errors;
  }

  const startupItems = [];
  for (const line of lines.slice(startupHeadingIndex + 1)) {
    if (/^##\s+/.test(line)) break;
    const match = /^(\d+)\.\s+(.+)$/.exec(line.trim());
    if (match) {
      startupItems.push({ number: Number(match[1]), text: match[2] });
    }
  }

  if (startupItems.length < 5) {
    errors.push(
      `${relPath}: Startup flow must have at least 5 numbered items, found ${startupItems.length}.`,
    );
  }

  if (
    startupItems[0]?.number !== 1 ||
    !startupItems[0]?.text.includes("Прочитай [AGENTS.md](./AGENTS.md).")
  ) {
    errors.push(
      `${relPath}: Startup flow item 1 must start by reading [AGENTS.md](./AGENTS.md).`,
    );
  }

  return errors;
}

export function checkAgentsFamilySync(repoRoot = DEFAULT_ROOT) {
  const checked = [];
  const failures = [];

  for (const rel of WRAPPER_FILES) {
    const abs = resolve(repoRoot, rel);
    if (!existsSync(abs)) continue;
    const content = readFileSync(abs, "utf8");
    const errors = analyzeAgentWrapper(content, rel);
    checked.push(relative(repoRoot, abs).replace(/\\/g, "/"));
    failures.push(...errors);
  }

  return {
    checked,
    failures,
    ok: failures.length === 0,
  };
}

function parseArgs(argv) {
  const rootIdx = argv.indexOf("--root");
  return {
    json: argv.includes("--json"),
    root: rootIdx >= 0 ? resolve(argv[rootIdx + 1]) : DEFAULT_ROOT,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = checkAgentsFamilySync(args.root);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  if (report.ok) {
    console.log(
      `AGENTS-family sync OK - checked ${report.checked.join(", ")}.`,
    );
    process.exit(0);
  }

  console.error("AGENTS-family sync check FAILED\n");
  for (const failure of report.failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
