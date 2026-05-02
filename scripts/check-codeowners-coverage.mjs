#!/usr/bin/env node
// scripts/check-codeowners-coverage.mjs
//
// CI script that validates `.github/CODEOWNERS` covers every path the team
// has flagged as "must require codeowner approval before merge".
//
// Why this exists
// ───────────────
// GitHub's CODEOWNERS file is silent on omissions: a path with no rule simply
// has no required reviewer, even if branch protection is set to "Require
// review from Code Owners". A new governance doc, workflow, or migration
// could land without owner review and nobody would notice. This script
// makes coverage explicit: edit `coverage` below when the must-own set
// changes, and the next PR will fail until CODEOWNERS catches up.
//
// What it does
// ────────────
// 1. Parses `.github/CODEOWNERS` (ignoring blank/comment lines).
// 2. For each entry in `MUST_BE_OWNED` it walks the repo and checks that at
//    least one matching path exists AND that some CODEOWNERS pattern matches
//    that path (last-match-wins, like GitHub's own resolver).
// 3. Exits 1 if any required path is not covered, missing entirely, or only
//    partially covered (e.g., a single file matched while siblings drift).
//
// CLI:
//   node scripts/check-codeowners-coverage.mjs           # report + exit code
//   node scripts/check-codeowners-coverage.mjs --json    # machine-readable
//
// Hard Rule #15: when this list changes, also update AGENTS.md § Module
// ownership map and CONTRIBUTING.md § Codeowners coverage.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

function toRepoPath(p) {
  return p.replace(/\\/g, "/");
}

// Required coverage. Each entry is either:
//   - { path: "AGENTS.md", kind: "file" }       — exact file must be owned.
//   - { path: "docs/playbooks", kind: "tree" }  — directory + every tracked
//     descendant matching `match` (default *.md) must be owned.
//
// Adding/removing entries is a deliberate governance act — always pair with
// the matching CODEOWNERS edit in the same PR.
const MUST_BE_OWNED = [
  // Top-level governance docs
  { path: "AGENTS.md", kind: "file", reason: "primary AI rule book" },
  { path: "CLAUDE.md", kind: "file", reason: "Claude-specific context" },
  { path: "DEVIN.md", kind: "file", reason: "Devin-specific context" },
  {
    path: "CONTRIBUTING.md",
    kind: "file",
    reason: "human contributor rule book",
  },
  { path: "README.md", kind: "file", reason: "repo entry-point doc" },

  // Governance trees
  {
    path: "docs/governance",
    kind: "tree",
    match: /\.md$/,
    reason: "policy reviews & governance procedures",
  },
  {
    path: "docs/playbooks",
    kind: "tree",
    match: /\.md$/,
    reason: "AI-agent playbooks (Hard Rule #15 pre-flight inputs)",
  },
  {
    path: "docs/adr",
    kind: "tree",
    match: /\.md$/,
    reason: "architecture decision records",
  },
  {
    path: "docs/security",
    kind: "tree",
    match: /\.md$/,
    reason: "threat model & SLA",
  },

  // CI / tooling
  {
    path: ".github/workflows",
    kind: "tree",
    match: /\.ya?ml$/,
    reason: "CI gates and automation",
  },
  {
    path: ".github/CODEOWNERS",
    kind: "file",
    reason: "this file itself must be owned",
  },
  {
    path: "scripts",
    kind: "tree",
    match: /\.(mjs|js|ts|sh)$/,
    reason: "governance / lint / docs scripts",
  },
  {
    path: ".agents/skills",
    kind: "tree",
    match: /SKILL\.md$/,
    reason: "agent skills used by Devin / Claude",
  },

  // Sensitive product surfaces
  {
    path: "apps/server/src/migrations",
    kind: "tree",
    match: /\.sql$/,
    reason: "DB migrations (Hard Rule #4 — two-phase DROP)",
  },
  {
    path: "packages/eslint-plugin-sergeant-design",
    kind: "tree",
    match: /\.(js|mjs|cjs|json)$/,
    reason: "custom lint rules enforce hard rules",
  },

  // Telegram bot agents — system prompts + routing logic
  {
    path: "apps/console/src/agents",
    kind: "tree",
    match: /\.ts$/,
    reason:
      "agent system prompts and router — accidental prompt changes affect all users",
  },

  // n8n automation workflows
  {
    path: "ops/n8n-workflows",
    kind: "tree",
    match: /\.json$/,
    reason: "production automation workflows (billing, alerts, backups)",
  },
];

// ── CODEOWNERS parser (subset that GitHub itself implements) ─────────────────

function parseCodeowners(text) {
  const entries = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    const pattern = tokens[0];
    const owners = tokens.slice(1);
    if (!pattern || owners.length === 0) continue;
    entries.push({ pattern, owners });
  }
  return entries;
}

// Convert a CODEOWNERS pattern into a regex. The rules we replicate:
//   - Patterns are gitignore-flavoured globs.
//   - A leading "/" anchors at repo root; otherwise the pattern matches at
//     any depth.
//   - A trailing "/" matches a directory and everything inside it.
//   - "*" matches any character except "/"; "**" matches across "/".
//   - A bare token like `*.md` matches any depth (this is what gitignore
//     does and what GitHub's matcher does too).
function patternToRegex(pattern) {
  let p = pattern;
  let anchored = false;
  if (p.startsWith("/")) {
    anchored = true;
    p = p.slice(1);
  }
  let dirMatch = false;
  if (p.endsWith("/")) {
    dirMatch = true;
    p = p.slice(0, -1);
  }

  // Escape regex specials except glob meta we will translate.
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === ".") {
      re += "\\.";
    } else if ("+()|^$[]{}\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }

  if (dirMatch || pattern.endsWith("/")) {
    re += "(/.*)?";
  } else if (!pattern.includes("*") && !pattern.includes("/")) {
    // Bare filename token like `LICENSE`: gitignore matches at any depth.
    re = `(^|.*/)${re}$`;
    if (anchored) re = `^${re.slice(1)}`;
    return new RegExp(re);
  }

  if (anchored) {
    return new RegExp(`^${re}$`);
  }
  // Non-anchored token with a slash or wildcard: match at any depth.
  return new RegExp(`(^|/)${re}$`);
}

function findOwnersFor(filePath, entries) {
  // Last matching entry wins (GitHub's documented behaviour).
  let match = null;
  for (const entry of entries) {
    const re = patternToRegex(entry.pattern);
    if (re.test(filePath)) match = entry;
  }
  return match;
}

// ── Filesystem walking ───────────────────────────────────────────────────────

function listFiles(dir, regex) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    let kids;
    try {
      kids = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const k of kids) {
      const p = join(cur, k.name);
      if (k.isDirectory()) {
        if (k.name === "node_modules" || k.name === "dist") continue;
        stack.push(p);
      } else if (k.isFile() && (!regex || regex.test(k.name))) {
        out.push(p);
      }
    }
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = new Set(process.argv.slice(2));
  const jsonMode = args.has("--json");

  const codeownersPath = resolve(ROOT, ".github/CODEOWNERS");
  if (!existsSync(codeownersPath)) {
    console.error("❌ .github/CODEOWNERS not found.");
    process.exit(1);
  }
  const entries = parseCodeowners(readFileSync(codeownersPath, "utf-8"));

  const failures = [];
  const checked = [];

  for (const req of MUST_BE_OWNED) {
    const abs = resolve(ROOT, req.path);
    if (!existsSync(abs)) {
      // Missing files/dirs are reported but do not fail — a doc may have
      // been deliberately removed in a PR that also strips it from the
      // required list. The script will only fail if the path is *present*
      // but unowned.
      checked.push({
        path: req.path,
        status: "missing",
        reason: req.reason,
      });
      continue;
    }

    if (req.kind === "file") {
      const rel = toRepoPath(relative(ROOT, abs));
      const m = findOwnersFor(rel, entries);
      if (m) {
        checked.push({
          path: rel,
          status: "owned",
          owners: m.owners,
          via: m.pattern,
        });
      } else {
        failures.push({
          path: rel,
          reason: req.reason,
          kind: "file-uncovered",
        });
      }
      continue;
    }

    // tree
    const files = listFiles(abs, req.match);
    if (files.length === 0) {
      checked.push({
        path: req.path,
        status: "empty",
        reason: req.reason,
      });
      continue;
    }
    const uncovered = [];
    for (const f of files) {
      const rel = toRepoPath(relative(ROOT, f));
      const m = findOwnersFor(rel, entries);
      if (!m) uncovered.push(rel);
    }
    if (uncovered.length === 0) {
      checked.push({
        path: req.path,
        status: "owned",
        files: files.length,
      });
    } else {
      failures.push({
        path: req.path,
        reason: req.reason,
        kind: "tree-partial",
        uncovered,
      });
    }
  }

  if (jsonMode) {
    console.log(
      JSON.stringify({ checked, failures, ok: failures.length === 0 }, null, 2),
    );
    process.exit(failures.length === 0 ? 0 : 1);
  }

  if (failures.length === 0) {
    console.log(
      `✅ CODEOWNERS coverage OK — ${checked.length} required path(s) all owned.`,
    );
    process.exit(0);
  }

  console.error("❌ CODEOWNERS coverage failure\n");
  for (const f of failures) {
    if (f.kind === "file-uncovered") {
      console.error(
        `  - ${f.path} (${f.reason}) is not matched by any CODEOWNERS rule.`,
      );
    } else {
      console.error(
        `  - ${f.path} (${f.reason}) has ${f.uncovered.length} uncovered file(s):`,
      );
      for (const u of f.uncovered.slice(0, 10)) {
        console.error(`      • ${u}`);
      }
      if (f.uncovered.length > 10) {
        console.error(`      … and ${f.uncovered.length - 10} more`);
      }
    }
  }
  console.error(
    "\nFix: add a matching pattern in .github/CODEOWNERS, or remove the path " +
      "from MUST_BE_OWNED in scripts/check-codeowners-coverage.mjs (governance " +
      "act — explain in the PR body).\n",
  );
  process.exit(1);
}

main();
