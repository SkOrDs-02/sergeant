#!/usr/bin/env node
// scripts/codex/status.mjs
//
// Read-only status summary for the repo-owned Codex layer.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function listNames(dir, suffix = "") {
  const abs = resolve(REPO_ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((entry) =>
      suffix
        ? entry.isFile() && entry.name.endsWith(suffix)
        : entry.isDirectory(),
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function parseBranchStatus() {
  const raw = runGit(["status", "--porcelain=v2", "--branch"]);
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const branch = { name: "unknown", upstream: null, ahead: 0, behind: 0 };
  const changes = { staged: 0, unstaged: 0, untracked: 0 };

  for (const line of lines) {
    if (line.startsWith("# branch.head ")) {
      branch.name = line.replace("# branch.head ", "");
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      branch.upstream = line.replace("# branch.upstream ", "");
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      const match = /# branch\.ab \+(\d+) -(\d+)/.exec(line);
      if (match) {
        branch.ahead = Number(match[1]);
        branch.behind = Number(match[2]);
      }
      continue;
    }
    if (line.startsWith("? ")) {
      changes.untracked += 1;
      continue;
    }
    if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const status = line.slice(2, 4);
      if (status[0] !== ".") changes.staged += 1;
      if (status[1] !== ".") changes.unstaged += 1;
    }
  }

  return { branch, changes };
}

function printList(label, names) {
  console.log(`${label}: ${names.length}`);
  if (names.length > 0) {
    console.log(`  ${names.join(", ")}`);
  }
}

const { branch, changes } = parseBranchStatus();
const codexAgents = listNames(".codex/agents", ".toml").map((name) =>
  name.replace(/\.toml$/, ""),
);
const repoSkills = listNames(".agents/skills");
const hasCodexConfig = existsSync(resolve(REPO_ROOT, ".codex/config.toml"));
const hasCodexHooks = existsSync(resolve(REPO_ROOT, ".codex/hooks.json"));

console.log("Codex status");
console.log("============");
console.log(
  `Branch: ${branch.name}${branch.upstream ? ` -> ${branch.upstream}` : ""}`,
);
console.log(`Ahead/behind: +${branch.ahead} / -${branch.behind}`);
console.log(
  `Changes: staged ${changes.staged}, unstaged ${changes.unstaged}, untracked ${changes.untracked}`,
);
console.log(`Codex config: ${hasCodexConfig ? "present" : "missing"}`);
console.log(`Codex hooks: ${hasCodexHooks ? "present" : "missing"}`);
printList("Codex agents", codexAgents);
printList("Repo skills", repoSkills);
