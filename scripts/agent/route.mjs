#!/usr/bin/env node
// scripts/agent/route.mjs
//
// `pnpm agent:route` — tool-agnostic orientation primitive (Initiative 0019,
// Tier 2). Given the files a session is touching (git diff vs a base ref, or
// explicit paths), it prints:
//   • the specialist Sergeant skill(s) to load, and
//   • the hard rules currently in scope for those paths, and
//   • a suggested `agent:find` query
// so an agent (or a harness SessionStart hook) lands on the right skill + rules
// without the maintainer re-explaining every time.
//
// Deliberately harness-neutral: a plain Node script reading git + the canonical
// skill-mapping + hard-rules registry. Each harness wires it into its own
// session-start equivalent from its OWN global config — the repo carries no
// harness hook (AGENTS.md § "Harness config lives outside the repo").
//
// Reuses scripts/docs/skill-mapping.json (path→skill, canonical per Initiative
// 0015) and docs/governance/hard-rules.json (scope globs) — no duplicated
// routing logic. See docs/adr/0066-…md (sibling retrieval primitive).
//
// Usage:
//   pnpm agent:route                       # diff vs origin/main + uncommitted
//   pnpm agent:route --base HEAD~3          # diff vs a specific ref
//   pnpm agent:route apps/web/src/x.tsx …   # explicit paths
//   pnpm agent:route --json

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const MAPPING_PATH = resolve(REPO_ROOT, "scripts/docs/skill-mapping.json");
const HARD_RULES_PATH = resolve(
  REPO_ROOT,
  "docs/04-governance/governance/hard-rules.json",
);

function readJson(abs) {
  return JSON.parse(readFileSync(abs, "utf8"));
}

// Minimal glob→RegExp: supports `**` (any depth, incl. /), `*` (one segment).
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(file, globs) {
  return (globs ?? []).some((g) => globToRegExp(g).test(file));
}

function parseArgs(argv) {
  const opts = { base: null, json: false, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") opts.base = argv[++i];
    else if (a === "--json") opts.json = true;
    else opts.paths.push(a);
  }
  return opts;
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

// Resolve the set of changed files: explicit paths win; otherwise diff vs base
// (committed) ∪ uncommitted working-tree + staged changes.
function changedFiles(opts) {
  if (opts.paths.length > 0) {
    return [...new Set(opts.paths.map((p) => p.split(sep).join("/")))];
  }
  let base = opts.base;
  if (!base) {
    base = git(["rev-parse", "--verify", "--quiet", "origin/main"])
      ? "origin/main"
      : git(["rev-parse", "--verify", "--quiet", "main"])
        ? "main"
        : "HEAD";
  }
  const files = new Set();
  // `base...HEAD` is git's merge-base diff range (changes on this branch), not
  // a typographic ellipsis — hence the targeted lint suppression.
  // eslint-disable-next-line sergeant-design/no-ellipsis-dots
  const branchRange = `${base}...HEAD`;
  for (const out of [
    git(["diff", "--name-only", branchRange]),
    git(["diff", "--name-only", "HEAD"]),
    git(["diff", "--name-only", "--cached"]),
  ]) {
    for (const line of out.split("\n")) if (line.trim()) files.add(line.trim());
  }
  return [...files];
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const mapping = readJson(MAPPING_PATH);
  const hardRules = readJson(HARD_RULES_PATH);
  const rules = Array.isArray(hardRules) ? hardRules : (hardRules.rules ?? []);
  const files = changedFiles(opts);

  // Path → skill via the canonical skill-mapping (first matching rule wins).
  const skillHits = new Map(); // skill → files[]
  for (const file of files) {
    const rule = mapping.skillRules.find((r) => matchesAny(file, r.globs));
    const skill = rule ? rule.skill : mapping.fallbackSkill;
    if (!skillHits.has(skill)) skillHits.set(skill, []);
    skillHits.get(skill).push(file);
  }
  const skills = [...skillHits.entries()]
    // Some mapping labels (e.g. `docs`) are routing categories, not loadable
    // skills — flag whether a SKILL.md actually exists so we don't tell the
    // agent to Read a file that isn't there.
    .map(([skill, fs]) => ({
      skill,
      files: fs,
      count: fs.length,
      exists: existsSync(
        resolve(REPO_ROOT, `.agents/skills/${skill}/SKILL.md`),
      ),
    }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));

  // Active hard rules: any scope glob matches any changed file. Split universal
  // (`**/*`-style, always-on) from path-specific so the path-specific ones lead.
  const active = [];
  for (const r of rules) {
    const scope = r.scope ?? [];
    const universal = scope.some((g) => g === "**/*" || g === "**");
    const specific = scope.some(
      (g) =>
        !["**/*", "**", "main", "master"].includes(g) &&
        files.some((f) => globToRegExp(g).test(f)),
    );
    if (specific || (universal && files.length > 0)) {
      active.push({
        id: r.id,
        title: r.title,
        universal: specific ? false : universal,
      });
    }
  }
  active.sort(
    (a, b) =>
      Number(a.universal) - Number(b.universal) || Number(a.id) - Number(b.id),
  );

  const topSurface = files.length
    ? files[0].split("/").slice(0, 2).join("/") || files[0]
    : "";
  const suggestion = `pnpm agent:find "<what you're changing in ${topSurface || "the repo"}>"`;

  if (opts.json) {
    console.log(
      JSON.stringify({ files, skills, hardRules: active, suggestion }, null, 2),
    );
    return;
  }

  if (files.length === 0) {
    console.log(
      "agent:route — no changed files detected (clean tree vs base). Pass paths explicitly or --base <ref>.",
    );
    return;
  }

  console.log(`agent:route — ${files.length} changed file(s)\n`);
  console.log("Load skill (most-touched first):");
  for (const s of skills) {
    const n = `${s.count} file${s.count === 1 ? "" : "s"}`;
    if (s.exists) {
      console.log(`  • Read .agents/skills/${s.skill}/SKILL.md  (${n})`);
    } else {
      console.log(
        `  • ${s.skill} — no specialist skill; governance/docs only  (${n})`,
      );
    }
  }
  if (active.length) {
    console.log("\nHard rules in scope:");
    for (const r of active) {
      console.log(`  • #${r.id} — ${r.title}${r.universal ? " (always)" : ""}`);
    }
  }
  console.log(`\nLocate related docs:\n  ${suggestion}`);
}

main();
