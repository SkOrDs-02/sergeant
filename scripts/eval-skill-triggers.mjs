#!/usr/bin/env node
// Static golden-set gate for Sergeant skill routing prompts.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const DEFAULT_ROOT = resolve(__dirname, "..");
export const DEFAULT_GOLDEN_PATH = resolve(
  DEFAULT_ROOT,
  "docs/agents/skill-trigger-evals.json",
);

export const CASE_KINDS = new Set(["trigger", "anti-trigger", "workflow"]);
export const REQUIRED_WORKFLOW_CHECKS = new Set([
  "start-here-first",
  "exactly-one-specialist",
]);

const MIN_PROMPT_LENGTH = 24;
const MAX_PROMPT_LENGTH = 800;

function parseArgs(argv) {
  const out = {
    goldenPath: DEFAULT_GOLDEN_PATH,
    json: false,
    root: DEFAULT_ROOT,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      out.json = true;
    } else if (arg === "--root") {
      out.root = resolve(argv[++i] ?? "");
    } else if (arg.startsWith("--root=")) {
      out.root = resolve(arg.slice("--root=".length));
    } else if (arg === "--golden") {
      out.goldenPath = resolve(argv[++i] ?? "");
    } else if (arg.startsWith("--golden=")) {
      out.goldenPath = resolve(arg.slice("--golden=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function asStringArray(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function unique(items) {
  return Array.from(new Set(items));
}

export function collectSkillSlugs(repoRoot) {
  const skillsDir = resolve(repoRoot, ".agents/skills");
  if (!existsSync(skillsDir)) {
    throw new Error(`Missing skills directory: ${skillsDir}`);
  }

  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => {
      const skillPath = resolve(skillsDir, slug, "SKILL.md");
      try {
        return statSync(skillPath).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

export function readGoldenSet(goldenPath = DEFAULT_GOLDEN_PATH) {
  return JSON.parse(readFileSync(goldenPath, "utf8"));
}

export function validateGoldenSet(golden, skillSlugs) {
  const skillSet = new Set(skillSlugs);
  const errors = [];
  const warnings = [];
  const counts = new Map();
  const ids = new Set();

  if (!golden || typeof golden !== "object") {
    return {
      ok: false,
      errors: ["Golden set must be a JSON object."],
      warnings,
      summary: { skills: skillSlugs.length, cases: 0 },
    };
  }

  if (golden.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1.");
  }

  if (!Array.isArray(golden.cases)) {
    errors.push("cases must be an array.");
    return {
      ok: false,
      errors,
      warnings,
      summary: { skills: skillSlugs.length, cases: 0 },
    };
  }

  for (const slug of skillSlugs) {
    counts.set(slug, { trigger: 0, "anti-trigger": 0, workflow: 0 });
  }

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

    if (typeof item.skill !== "string" || !skillSet.has(item.skill)) {
      errors.push(`${label}: skill must name an existing .agents/skills slug.`);
    }

    if (typeof item.kind !== "string" || !CASE_KINDS.has(item.kind)) {
      errors.push(`${label}: kind must be trigger, anti-trigger, or workflow.`);
    }

    if (
      typeof item.prompt !== "string" ||
      item.prompt.trim().length < MIN_PROMPT_LENGTH ||
      item.prompt.length > MAX_PROMPT_LENGTH
    ) {
      errors.push(
        `${label}: prompt must be ${MIN_PROMPT_LENGTH}-${MAX_PROMPT_LENGTH} characters.`,
      );
    }

    if (!asStringArray(item.expectedSkills)) {
      errors.push(`${label}: expectedSkills must be an array of strings.`);
    }

    if (!asStringArray(item.forbiddenSkills ?? [])) {
      errors.push(`${label}: forbiddenSkills must be an array of strings.`);
    }

    const expectedSkills = item.expectedSkills ?? [];
    const forbiddenSkills = item.forbiddenSkills ?? [];
    const unknownExpected = expectedSkills.filter(
      (slug) => !skillSet.has(slug),
    );
    const unknownForbidden = forbiddenSkills.filter(
      (slug) => !skillSet.has(slug),
    );

    for (const slug of unknownExpected) {
      errors.push(`${label}: expectedSkills contains unknown skill ${slug}.`);
    }
    for (const slug of unknownForbidden) {
      errors.push(`${label}: forbiddenSkills contains unknown skill ${slug}.`);
    }

    const overlap = expectedSkills.filter((slug) =>
      forbiddenSkills.includes(slug),
    );
    if (overlap.length > 0) {
      errors.push(
        `${label}: expectedSkills and forbiddenSkills overlap: ${unique(overlap).join(", ")}.`,
      );
    }

    if (item.skill && item.kind && counts.has(item.skill)) {
      counts.get(item.skill)[item.kind] += 1;
    }

    if (item.kind === "trigger" || item.kind === "workflow") {
      if (!expectedSkills.includes(item.skill)) {
        errors.push(
          `${label}: ${item.kind} case must expect its target skill.`,
        );
      }
      if (!expectedSkills.includes("sergeant-start-here")) {
        errors.push(
          `${label}: ${item.kind} case must expect sergeant-start-here.`,
        );
      }
    }

    if (item.kind === "anti-trigger") {
      if (expectedSkills.includes(item.skill)) {
        errors.push(`${label}: anti-trigger must not expect its target skill.`);
      }
      if (!forbiddenSkills.includes(item.skill)) {
        errors.push(`${label}: anti-trigger must forbid its target skill.`);
      }
    }

    if (item.kind === "workflow") {
      if (!asStringArray(item.complianceChecks)) {
        errors.push(`${label}: workflow case needs complianceChecks array.`);
      } else {
        for (const check of REQUIRED_WORKFLOW_CHECKS) {
          if (!item.complianceChecks.includes(check)) {
            errors.push(`${label}: workflow case missing ${check}.`);
          }
        }
      }
    }

    const specialists = expectedSkills.filter(
      (slug) => slug !== "sergeant-start-here",
    );
    if (
      (item.kind === "trigger" || item.kind === "workflow") &&
      item.skill !== "sergeant-start-here" &&
      specialists.length !== 1
    ) {
      errors.push(
        `${label}: trigger/workflow cases must expect exactly one specialist skill.`,
      );
    }
  }

  const goldenSkills = new Set(golden.cases.map((item) => item.skill));
  for (const slug of skillSlugs) {
    const count = counts.get(slug);
    if (!goldenSkills.has(slug)) {
      errors.push(`${slug}: missing all golden cases.`);
      continue;
    }
    if (count.trigger < 2) {
      errors.push(
        `${slug}: needs at least 2 trigger cases; found ${count.trigger}.`,
      );
    }
    if (count["anti-trigger"] < 1) {
      errors.push(
        `${slug}: needs at least 1 anti-trigger case; found ${count["anti-trigger"]}.`,
      );
    }
    if (count.workflow < 1) {
      errors.push(
        `${slug}: needs at least 1 workflow case; found ${count.workflow}.`,
      );
    }
  }

  for (const item of golden.cases) {
    if (item?.skill && !skillSet.has(item.skill)) continue;
    const expected = item?.expectedSkills ?? [];
    if (
      (item?.kind === "trigger" || item?.kind === "workflow") &&
      item.skill !== "sergeant-start-here" &&
      !expected.includes(item.skill)
    ) {
      warnings.push(`${item.id}: target skill is not in expectedSkills.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      skills: skillSlugs.length,
      cases: golden.cases.length,
      triggerCases: golden.cases.filter((item) => item.kind === "trigger")
        .length,
      antiTriggerCases: golden.cases.filter(
        (item) => item.kind === "anti-trigger",
      ).length,
      workflowCases: golden.cases.filter((item) => item.kind === "workflow")
        .length,
    },
  };
}

export function run({
  repoRoot = DEFAULT_ROOT,
  goldenPath = DEFAULT_GOLDEN_PATH,
}) {
  const skillSlugs = collectSkillSlugs(repoRoot);
  const golden = readGoldenSet(goldenPath);
  return validateGoldenSet(golden, skillSlugs);
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const report = run({ repoRoot: args.root, goldenPath: args.goldenPath });

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
      process.exit(report.ok ? 0 : 1);
    }

    if (report.ok) {
      console.log(
        `[eval:skills] OK — ${report.summary.cases} case(s) cover ${report.summary.skills} skill(s).`,
      );
      process.exit(0);
    }

    console.error("[eval:skills] skill trigger golden-set failed:");
    for (const error of report.errors) {
      console.error(`  ✘ ${error}`);
    }
    process.exit(1);
  } catch (err) {
    if (args?.json) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            errors: [err instanceof Error ? err.message : String(err)],
          },
          null,
          2,
        ),
      );
    } else {
      console.error(
        `[eval:skills] ${err instanceof Error ? err.message : err}`,
      );
    }
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
