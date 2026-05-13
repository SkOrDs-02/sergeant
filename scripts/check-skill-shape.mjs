#!/usr/bin/env node
// Lint skill files (.agents/skills/<slug>/SKILL.md) against a small shape contract.
//
// What we check:
// 1. SKILL.md exists for every locked skill in .agents/skills-lock.json.
// 2. Each SKILL.md starts with a YAML-ish frontmatter block (--- ... ---) that
//    contains `name:` and `description:` keys. The `description` value must be
//    non-empty and ≤ 220 chars (Claude/Devin tooling truncates aggressively).
// 3. The `name:` value matches the directory slug.
// 4. The body contains either a concrete repo path (apps/*, packages/*, scripts/*,
//    docs/*, .agents/*, .github/*) or a `pnpm`/`pnpx` command — i.e. the skill
//    is grounded, not a free-floating checklist.
// 5. The body links to at least one playbook in docs/playbooks/ OR to the
//    skill catalog (docs/agents/agent-skills-catalog.md or its successor
//    docs/agents/agent-skills-catalog.md once that rename ships).
//
// This is the entrypoint for `pnpm lint:skills`. It exits non-zero with a
// structured error report so CI logs are easy to scan.
//
// Linked initiative: docs/initiatives/archive/_0009-agent-os-hardening.md (PR 1.1).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const skillsDir = path.join(repoRoot, ".agents/skills");
const lockPath = path.join(repoRoot, ".agents/skills-lock.json");

const MAX_DESCRIPTION_LEN = 220;

const PATH_HINT_RE =
  /(?:apps\/[\w./-]+|packages\/[\w./-]+|scripts\/[\w./-]+|docs\/[\w./-]+|\.agents\/[\w./-]+|\.github\/[\w./-]+)/;
const COMMAND_HINT_RE = /\bpnp[mx]\s+[\w:.@/-]+/;
const PLAYBOOK_LINK_RE =
  /docs\/playbooks\/[\w./-]+|docs\/agents\/agent-skills-catalog\.md/;

function readJSON(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function parseFrontmatter(text) {
  // We do not pull a YAML dep just for two scalar fields. Match the leading
  // `---` block and read `key: value` pairs until the closing `---`.
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;
  const block = text.slice(4, end);
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function lintSkill(slug) {
  const skillPath = path.join(skillsDir, slug, "SKILL.md");
  const errors = [];
  let stat;
  try {
    stat = statSync(skillPath);
  } catch {
    return [
      `${slug}: SKILL.md is missing at ${path.relative(repoRoot, skillPath)}`,
    ];
  }
  if (!stat.isFile()) {
    errors.push(`${slug}: SKILL.md is not a regular file`);
    return errors;
  }
  const text = readFileSync(skillPath, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) {
    errors.push(`${slug}: missing or malformed YAML frontmatter (--- … ---)`);
    return errors;
  }
  if (!fm.name) {
    errors.push(`${slug}: frontmatter missing required \`name\` key`);
  } else if (fm.name !== slug) {
    errors.push(
      `${slug}: frontmatter \`name: ${fm.name}\` does not match directory slug`,
    );
  }
  if (!fm.description) {
    errors.push(`${slug}: frontmatter missing required \`description\` key`);
  } else if (fm.description.length > MAX_DESCRIPTION_LEN) {
    errors.push(
      `${slug}: \`description\` is ${fm.description.length} chars (max ${MAX_DESCRIPTION_LEN})`,
    );
  }
  const body = text.slice(text.indexOf("\n---", 4) + 4);
  const hasPath = PATH_HINT_RE.test(body);
  const hasCommand = COMMAND_HINT_RE.test(body);
  if (!hasPath && !hasCommand) {
    errors.push(
      `${slug}: body has no concrete repo path (apps/, packages/, scripts/, docs/, .agents/, .github/) ` +
        `nor any \`pnpm\` command — skill is not grounded`,
    );
  }
  if (!PLAYBOOK_LINK_RE.test(body)) {
    errors.push(
      `${slug}: body has no link to docs/playbooks/* nor to the skill catalog ` +
        `(docs/agents/agent-skills-catalog.md). Skills must point at a recipe.`,
    );
  }
  return errors;
}

function main() {
  let lock;
  try {
    lock = readJSON(lockPath);
  } catch (err) {
    console.error(
      `[lint:skills] cannot read ${path.relative(repoRoot, lockPath)}: ${err.message}`,
    );
    process.exit(1);
  }
  const lockedSlugs = Object.keys(lock.skills ?? {}).sort();
  const dirSlugs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const allErrors = [];

  // Lock vs filesystem drift
  for (const slug of dirSlugs) {
    if (!lockedSlugs.includes(slug)) {
      allErrors.push(
        `${slug}: directory exists but is not in skills-lock.json`,
      );
    }
  }
  for (const slug of lockedSlugs) {
    if (!dirSlugs.includes(slug)) {
      allErrors.push(`${slug}: locked but directory does not exist`);
    }
  }

  // Per-skill content checks
  for (const slug of dirSlugs) {
    if (!lockedSlugs.includes(slug)) continue;
    const errors = lintSkill(slug);
    allErrors.push(...errors);
  }

  if (allErrors.length > 0) {
    console.error(`[lint:skills] ${allErrors.length} issue(s) found:`);
    for (const e of allErrors) console.error(`  ✘ ${e}`);
    console.error("");
    console.error(
      "Fix the SKILL.md files above (frontmatter shape, paths/commands, playbook links) " +
        "or update .agents/skills-lock.json. See docs/initiatives/archive/_0009-agent-os-hardening.md (PR 1.1).",
    );
    process.exit(1);
  }

  console.log(
    `[lint:skills] OK — ${dirSlugs.length} skill(s) pass shape contract (frontmatter + grounding + playbook link).`,
  );
}

main();
