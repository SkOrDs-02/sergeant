#!/usr/bin/env node
// scripts/ci-bump-harness-version.mjs
// PR-time harness version bumper.
// Reads .kilo/harness-versions.json, detects which governance surfaces the
// diff touches (AGENTS.md / .agents/skills/** / docs/04-governance/governance/rules/** /
// eslint-plugin-sergeant-design rules / .husky hooks), increments the patch by
// default (typo, link, freshness), minor when adding a new skill/section,
// and major when a Hard Rule changes. Updates the file in place.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const FILE = resolve(process.cwd(), ".kilo/harness-versions.json");

if (!existsSync(FILE)) {
  console.error(`[bump] ${FILE} not found. Run from repo root.`);
  process.exit(1);
}

const raw = readFileSync(FILE, "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`[bump] invalid JSON in ${FILE}: ${err.message}`);
  process.exit(1);
}

if (data.schemaVersion !== 1) {
  console.error(
    `[bump] unsupported schemaVersion=${data.schemaVersion}; expected 1`,
  );
  process.exit(1);
}

const baseRef = process.env.BUMP_BASE_REF || "origin/main";
const headRef = process.env.BUMP_HEAD_REF || "HEAD";
let diff;
try {
  diff = execSync(`git diff --name-only ${baseRef}...${headRef}`, {
    encoding: "utf8",
  });
} catch (err) {
  diff = execSync("git diff --name-only HEAD~1...HEAD", { encoding: "utf8" });
}
const touched = diff.split("\n").filter(Boolean);

const isSkills = (p) => p.startsWith(".agents/skills/") && p.endsWith(".md");
const isRules = (p) =>
  p.startsWith("docs/04-governance/governance/rules/") && p.endsWith(".md");
const isAgentsMd = (p) => p === "AGENTS.md";
const isHusky = (p) => p.startsWith(".husky/");
const isEslintPlugin = (p) =>
  p.startsWith("packages/eslint-plugin-sergeant-design/");
const isDoc = (p) => p.startsWith("docs/04-governance/");

const hasSkills = touched.some(isSkills);
const hasRules = touched.some(isRules);
const hasAgents = touched.some(isAgentsMd);
const hasHusky = touched.some(isHusky);
const hasEslint = touched.some(isEslintPlugin);

let bump = "patch";
const reasons = [];
if (hasRules) {
  bump = "major";
  reasons.push("Hard Rule files changed");
}
if (hasAgents || hasSkills || hasEslint) {
  if (bump !== "major") bump = "minor";
  if (hasAgents) reasons.push("AGENTS.md modified");
  if (hasSkills) reasons.push("skill file added/modified");
  if (hasEslint) reasons.push("eslint-plugin-sergeant-design modified");
}
if (bump === "patch") {
  reasons.push("typo / link / freshness-only change");
}

const [maj, min, pat] = data.current.split(".").map((n) => parseInt(n, 10));
let next = data.current;
if (bump === "major") next = `${maj + 1}.0.0`;
else if (bump === "minor") next = `${maj}.${min + 1}.0`;
else next = `${maj}.${min}.${pat + 1}`;

const today = new Date().toISOString().slice(0, 10);
const entry = {
  releasedAt: today,
  changes: [`bump from ${data.current} -> ${next}: ${reasons.join("; ")}`],
  agentsTestedWith: [],
  passRateBaseline: null,
};

const fromVersion = data.current;
data.current = next;
data.versions[next] = entry;
if (!Array.isArray(data.versions[next].changes))
  data.versions[next].changes = entry.changes;

writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(
  `[bump] ${fromVersion} -> ${next} (${bump}) — ${reasons.join("; ")}`,
);
