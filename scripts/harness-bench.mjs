#!/usr/bin/env node
// Static offline benchmark for the Sergeant harness golden-task suite.
// Validates schema and scores each task with lexical keyword matching.

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_ROOT = resolve(__dirname, "..");
export const DEFAULT_GOLDEN_PATH = resolve(
  DEFAULT_ROOT,
  "docs/00-start/agents/harness-golden-tasks.json",
);

const MIN_TASKS = 10;
const PASS_RATE_THRESHOLD = 0.7;

const VALID_SURFACES = new Set(["web", "server", "mobile", "docs", "cross"]);

/** Primary skill for each surface used in scoring. */
const SURFACE_PRIMARY_SKILL = {
  web: "sergeant-web-ui",
  server: "sergeant-server-api",
  mobile: "sergeant-mobile-expo",
  docs: "sergeant-writing-skills",
  cross: null,
};

/** Extra domain keywords beyond slug parts, by skill. */
const EXTRA_SKILL_KEYWORDS = {
  "sergeant-server-api": [
    "route",
    "endpoint",
    "serializer",
    "bigint",
    "contract",
    "coerce",
    "coercion",
    "response",
    "openapi",
  ],
  "sergeant-web-ui": [
    "tailwind",
    "querykey",
    "queryhook",
    "rq",
    "component",
    "accessibility",
    "a11y",
    "focus-visible",
    "touch target",
    "factory",
    "inline",
  ],
  "sergeant-data-and-migrations": [
    "sql",
    "postgres",
    "schema",
    "column",
    "table",
    "outbox",
    "sequential",
    "drop",
    "two-phase",
    "numbering",
  ],
  "sergeant-hubchat": [
    "hub",
    "chat",
    "executor",
    "action card",
    "prompt-cache",
    "tool definition",
    "tool registry",
  ],
  "sergeant-mobile-expo": [
    "react native",
    "mmkv",
    "deep-link",
    "android",
    "ios",
    "nativewind",
    "navigation guard",
  ],
  "sergeant-deploy-and-observability": [
    "coolify",
    "vercel",
    "sentry",
    "health",
    "env var",
    "environment variable",
    "runbook",
    "pipeline",
    "redeploy",
  ],
  "sergeant-writing-skills": [
    "frontmatter",
    "lock hash",
    "skill.md",
    "skills:lock",
    "body scan",
  ],
  "sergeant-bugfix-and-regression": [
    "failing",
    "flaky",
    "red ci",
    "hotfix",
    "violation",
    "downgrading",
    "regression",
  ],
  "sergeant-e2e-testing": [
    "playwright",
    "smoke",
    "accessibility test",
    "e2e",
    "browser",
  ],
  "better-auth-best-practices": [
    "session",
    "cookie",
    "login",
    "account",
    "better auth",
    "token",
  ],
  "sergeant-tech-debt": [
    "eslint.baseline",
    "dead code",
    "knip",
    "baseline",
    "module size",
  ],
  "sergeant-feature-delivery": [
    "feature",
    "new screen",
    "new page",
    "behavior change",
  ],
};

const SLUG_STOP_WORDS = new Set([
  "sergeant",
  "and",
  "best",
  "practices",
  "the",
  "for",
]);

export function collectSkillSlugs(repoRoot) {
  const skillsDir = resolve(repoRoot, ".agents/skills");
  if (!existsSync(skillsDir)) {
    throw new Error(`Missing skills directory: ${skillsDir}`);
  }
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => {
      try {
        return statSync(resolve(skillsDir, slug, "SKILL.md")).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

function slugKeywords(slug) {
  const parts = slug
    .split("-")
    .filter((p) => p.length >= 3 && !SLUG_STOP_WORDS.has(p));
  const extras = EXTRA_SKILL_KEYWORDS[slug] ?? [];
  return [...parts, ...extras].map((k) => k.toLowerCase());
}

export function buildSkillKeywordMap(slugs) {
  const map = new Map();
  for (const slug of slugs) {
    map.set(slug, slugKeywords(slug));
  }
  return map;
}

/** Score a single task: fraction of expectedSkills matched via keywords or surface. */
export function scoreTask(task, skillKeywordMap) {
  const promptLower = task.prompt.toLowerCase();
  const primarySkill = SURFACE_PRIMARY_SKILL[task.surface] ?? null;
  let matched = 0;
  for (const skill of task.expectedSkills) {
    if (skill === "sergeant-start-here") {
      matched++;
      continue;
    }
    if (skill === primarySkill) {
      matched++;
      continue;
    }
    const keywords = skillKeywordMap.get(skill) ?? [];
    if (keywords.some((kw) => promptLower.includes(kw))) {
      matched++;
    }
  }
  const total = task.expectedSkills.length;
  return total > 0 ? matched / total : 1;
}

export function validateTasks(golden, skillSlugs) {
  const errors = [];
  const skillSet = new Set(skillSlugs);

  if (!golden || typeof golden !== "object") {
    return { ok: false, errors: ["Golden file must be a JSON object."] };
  }
  if (golden.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }
  if (!Array.isArray(golden.tasks)) {
    errors.push("tasks must be an array.");
    return { ok: false, errors };
  }
  if (golden.tasks.length < MIN_TASKS) {
    errors.push(
      `tasks must have at least ${MIN_TASKS} items; found ${golden.tasks.length}.`,
    );
  }

  const ids = new Set();
  for (const [index, task] of golden.tasks.entries()) {
    const label =
      task && typeof task === "object" && typeof task.id === "string"
        ? task.id
        : `task[${index}]`;

    if (!task || typeof task !== "object") {
      errors.push(`${label}: task must be an object.`);
      continue;
    }
    if (typeof task.id !== "string" || task.id.trim() === "") {
      errors.push(`${label}: id is required.`);
    } else if (ids.has(task.id)) {
      errors.push(`${label}: duplicate id.`);
    } else {
      ids.add(task.id);
    }
    if (typeof task.title !== "string" || task.title.trim() === "") {
      errors.push(`${label}: title is required.`);
    }
    if (typeof task.prompt !== "string" || task.prompt.trim().length < 20) {
      errors.push(`${label}: prompt must be a non-empty string (≥20 chars).`);
    }
    if (
      !Array.isArray(task.expectedSkills) ||
      !task.expectedSkills.every((s) => typeof s === "string")
    ) {
      errors.push(`${label}: expectedSkills must be an array of strings.`);
    } else {
      for (const slug of task.expectedSkills) {
        if (!skillSet.has(slug)) {
          errors.push(
            `${label}: expectedSkills references unknown skill "${slug}".`,
          );
        }
      }
    }
    if (
      task.expectedPlaybook !== null &&
      task.expectedPlaybook !== undefined &&
      typeof task.expectedPlaybook !== "string"
    ) {
      errors.push(`${label}: expectedPlaybook must be a string or null.`);
    }
    if (!VALID_SURFACES.has(task.surface)) {
      errors.push(
        `${label}: surface must be one of ${[...VALID_SURFACES].join(", ")}.`,
      );
    }
    if (typeof task.acceptance !== "string" || task.acceptance.trim() === "") {
      errors.push(`${label}: acceptance is required.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function runBench(golden, skillSlugs) {
  const keywordMap = buildSkillKeywordMap(skillSlugs);
  const taskResults = [];
  let passed = 0;
  for (const task of golden.tasks) {
    const score = scoreTask(task, keywordMap);
    const ok = score >= PASS_RATE_THRESHOLD;
    if (ok) passed++;
    taskResults.push({ id: task.id, score: Math.round(score * 100) / 100, ok });
  }
  const total = golden.tasks.length;
  const passRate = total > 0 ? passed / total : 0;
  return {
    ok: passRate >= PASS_RATE_THRESHOLD,
    version: golden.schemaVersion ?? null,
    total,
    passed,
    failed: total - passed,
    passRate: Math.round(passRate * 100) / 100,
    tasks: taskResults,
  };
}

function parseArgs(argv) {
  const out = {
    out: null,
    json: false,
    root: DEFAULT_ROOT,
    goldenPath: DEFAULT_GOLDEN_PATH,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
    } else if (arg.startsWith("--out=")) {
      out.out = arg.slice("--out=".length);
    } else if (arg === "--out") {
      out.out = argv[++i] ?? null;
    } else if (arg.startsWith("--root=")) {
      out.root = resolve(arg.slice("--root=".length));
    } else if (arg === "--root") {
      out.root = resolve(argv[++i] ?? "");
    } else if (arg.startsWith("--golden=")) {
      out.goldenPath = resolve(arg.slice("--golden=".length));
    } else if (arg === "--golden") {
      out.goldenPath = resolve(argv[++i] ?? "");
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
    const skillSlugs = collectSkillSlugs(args.root);
    const golden = JSON.parse(readFileSync(args.goldenPath, "utf8"));

    const validation = validateTasks(golden, skillSlugs);
    if (!validation.ok) {
      const report = { ok: false, errors: validation.errors };
      if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
      if (args.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.error("[harness:bench] Validation failed:");
        for (const err of validation.errors) {
          console.error(`  ✘ ${err}`);
        }
      }
      process.exit(1);
    }

    const bench = runBench(golden, skillSlugs);
    const summary = {
      ok: bench.ok,
      version: bench.version,
      total: bench.total,
      passed: bench.passed,
      failed: bench.failed,
      passRate: bench.passRate,
      tasks: bench.tasks,
    };

    if (args.out) writeFileSync(args.out, JSON.stringify(summary, null, 2));

    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
      process.exit(bench.ok ? 0 : 1);
    }

    if (bench.ok) {
      console.log(
        `[harness:bench] OK — ${bench.passed}/${bench.total} tasks passed (${Math.round(bench.passRate * 100)}%).`,
      );
      process.exit(0);
    }

    console.error(
      `[harness:bench] FAIL — pass rate ${Math.round(bench.passRate * 100)}% < ${Math.round(PASS_RATE_THRESHOLD * 100)}% threshold.`,
    );
    for (const t of bench.tasks.filter((t) => !t.ok)) {
      console.error(`  ✘ ${t.id} (score ${t.score})`);
    }
    process.exit(1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (args?.json) {
      console.log(JSON.stringify({ ok: false, errors: [msg] }, null, 2));
    } else {
      console.error(`[harness:bench] ${msg}`);
    }
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
