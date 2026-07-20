#!/usr/bin/env node
// Static lexical eval for playbook routing.
// For each golden case, scores playbook filenames against the prompt and
// checks that expectedPlaybook ranks first (match) or that forbidden
// playbooks do not rank first (anti-match).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_ROOT = resolve(__dirname, "..");
export const DEFAULT_GOLDEN_PATH = resolve(
  DEFAULT_ROOT,
  "docs/00-start/agents/playbook-routing-evals.json",
);
export const DEFAULT_PLAYBOOKS_DIR = resolve(
  DEFAULT_ROOT,
  "docs/00-start/playbooks",
);

const MIN_CASES = 8;
const VALID_KINDS = new Set(["match", "anti-match"]);

/** Stop words excluded from keyword scoring. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "do",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "the",
  "to",
  "was",
  "with",
]);

/**
 * Extract scoring keywords from a playbook filename.
 * E.g. "add-sql-migration.md" → ["add", "sql", "migration"]
 */
export function keywordsFromFilename(filename) {
  return filename
    .replace(/\.md$/, "")
    .split(/[-_]/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()))
    .map((w) => w.toLowerCase());
}

/**
 * Score a prompt against a playbook by counting keyword overlaps.
 * Returns a non-negative integer.
 */
export function scorePromptAgainstPlaybook(prompt, playbookFile) {
  const promptLower = prompt.toLowerCase();
  const keywords = keywordsFromFilename(playbookFile);
  let score = 0;
  for (const kw of keywords) {
    if (promptLower.includes(kw)) {
      score++;
    }
  }
  return score;
}

/**
 * Rank all playbook files by score for a given prompt.
 * Returns an array sorted by descending score.
 */
export function rankPlaybooks(prompt, playbookFiles) {
  return playbookFiles
    .map((file) => ({
      file,
      score: scorePromptAgainstPlaybook(prompt, file),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.file.length - b.file.length ||
        a.file.localeCompare(b.file),
    );
}

/**
 * Collect playbook filenames (*.md) from the playbooks directory,
 * excluding non-playbook files like README, INDEX, _TEMPLATE, etc.
 */
export function collectPlaybookFiles(playbooksDir = DEFAULT_PLAYBOOKS_DIR) {
  if (!existsSync(playbooksDir)) {
    throw new Error(`Missing playbooks directory: ${playbooksDir}`);
  }
  return readdirSync(playbooksDir)
    .filter(
      (f) =>
        f.endsWith(".md") &&
        !f.startsWith("_") &&
        !["README.md", "INDEX.md", "playbook-catalog.md"].includes(f),
    )
    .sort();
}

export function readGoldenSet(goldenPath = DEFAULT_GOLDEN_PATH) {
  return JSON.parse(readFileSync(goldenPath, "utf8"));
}

export function validateGoldenSet(golden, playbookFiles) {
  const errors = [];
  const fileSet = new Set(playbookFiles);

  if (!golden || typeof golden !== "object") {
    return { ok: false, errors: ["Golden file must be a JSON object."] };
  }
  if (golden.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (!Array.isArray(golden.cases)) {
    errors.push("cases must be an array.");
    return { ok: false, errors };
  }
  if (golden.cases.length < MIN_CASES) {
    errors.push(
      `cases must have at least ${MIN_CASES} items; found ${golden.cases.length}.`,
    );
  }

  const ids = new Set();
  for (const [index, item] of golden.cases.entries()) {
    const label =
      item && typeof item === "object" && typeof item.id === "string"
        ? item.id
        : `case[${index}]`;

    if (!item || typeof item !== "object") {
      errors.push(`${label}: case must be an object.`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.trim() === "") {
      errors.push(`${label}: id is required.`);
    } else if (ids.has(item.id)) {
      errors.push(`${label}: duplicate id.`);
    } else {
      ids.add(item.id);
    }
    if (!VALID_KINDS.has(item.kind)) {
      errors.push(`${label}: kind must be "match" or "anti-match".`);
    }
    if (typeof item.prompt !== "string" || item.prompt.trim().length < 10) {
      errors.push(`${label}: prompt must be a string of at least 10 chars.`);
    }
    if (typeof item.expectedPlaybook !== "string") {
      errors.push(`${label}: expectedPlaybook must be a string.`);
    } else if (!fileSet.has(item.expectedPlaybook)) {
      errors.push(
        `${label}: expectedPlaybook "${item.expectedPlaybook}" does not exist in the playbooks directory.`,
      );
    }
    if (item.forbiddenPlaybooks !== undefined) {
      if (
        !Array.isArray(item.forbiddenPlaybooks) ||
        !item.forbiddenPlaybooks.every((f) => typeof f === "string")
      ) {
        errors.push(
          `${label}: forbiddenPlaybooks must be an array of strings.`,
        );
      } else {
        for (const fp of item.forbiddenPlaybooks) {
          if (!fileSet.has(fp)) {
            errors.push(
              `${label}: forbiddenPlaybooks contains "${fp}" which does not exist in the playbooks directory.`,
            );
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Evaluate a single case. Returns { id, kind, ok, reason, ranked }.
 */
export function evalCase(item, playbookFiles) {
  const ranked = rankPlaybooks(item.prompt, playbookFiles);
  const topFile = ranked[0]?.file ?? null;

  if (item.kind === "match") {
    const ok = topFile === item.expectedPlaybook;
    return {
      id: item.id,
      kind: item.kind,
      ok,
      reason: ok
        ? `top match is "${topFile}" ✓`
        : `expected top match "${item.expectedPlaybook}" but got "${topFile}"`,
      ranked: ranked.slice(0, 5),
    };
  }

  // anti-match: expectedPlaybook must be top (we confirm the expected beats forbidden),
  // and none of forbiddenPlaybooks must be the top match.
  const forbidden = item.forbiddenPlaybooks ?? [];
  const forbiddenTopHit = forbidden.find((f) => f === topFile);
  if (forbiddenTopHit) {
    return {
      id: item.id,
      kind: item.kind,
      ok: false,
      reason: `forbidden playbook "${forbiddenTopHit}" appears as top match`,
      ranked: ranked.slice(0, 5),
    };
  }
  return {
    id: item.id,
    kind: item.kind,
    ok: true,
    reason: `top match is "${topFile}" (not forbidden) ✓`,
    ranked: ranked.slice(0, 5),
  };
}

export function run({
  goldenPath = DEFAULT_GOLDEN_PATH,
  playbooksDir = DEFAULT_PLAYBOOKS_DIR,
} = {}) {
  const playbookFiles = collectPlaybookFiles(playbooksDir);
  const golden = readGoldenSet(goldenPath);

  const validation = validateGoldenSet(golden, playbookFiles);
  if (!validation.ok) {
    return {
      ok: false,
      validationErrors: validation.errors,
      results: [],
      total: 0,
      passed: 0,
      failed: 0,
    };
  }

  const results = golden.cases.map((item) => evalCase(item, playbookFiles));
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;

  return {
    ok: failed === 0,
    validationErrors: [],
    results,
    total: results.length,
    passed,
    failed,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    goldenPath: DEFAULT_GOLDEN_PATH,
    playbooksDir: DEFAULT_PLAYBOOKS_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
    } else if (arg.startsWith("--golden=")) {
      out.goldenPath = resolve(arg.slice("--golden=".length));
    } else if (arg === "--golden") {
      out.goldenPath = resolve(argv[++i] ?? "");
    } else if (arg.startsWith("--playbooks=")) {
      out.playbooksDir = resolve(arg.slice("--playbooks=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const report = run({
      goldenPath: args.goldenPath,
      playbooksDir: args.playbooksDir,
    });

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.ok ? 0 : 1);
    }

    if (report.validationErrors.length > 0) {
      console.error("[eval:playbooks] Validation failed:");
      for (const err of report.validationErrors) {
        console.error(`  ✘ ${err}`);
      }
      process.exit(1);
    }

    if (report.ok) {
      console.log(
        `[eval:playbooks] OK — ${report.passed}/${report.total} cases passed.`,
      );
      process.exit(0);
    }

    console.error(
      `[eval:playbooks] FAIL — ${report.failed}/${report.total} cases failed.`,
    );
    for (const r of report.results.filter((r) => !r.ok)) {
      console.error(`  ✘ ${r.id}: ${r.reason}`);
      if (r.ranked.length > 0) {
        console.error(
          `    top-5: ${r.ranked.map((x) => `${x.file}(${x.score})`).join(", ")}`,
        );
      }
    }
    process.exit(1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (args?.json) {
      console.log(JSON.stringify({ ok: false, errors: [msg] }, null, 2));
    } else {
      console.error(`[eval:playbooks] ${msg}`);
    }
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
