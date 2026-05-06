#!/usr/bin/env node
// scripts/check-discoverability.mjs
//
// Discoverability gate: every named role must be able to reach every
// canonical target within ≤ 2 markdown-link hops from a known entrypoint.
//
// Why this exists
// ───────────────
// `agent-skills-catalog.md`, `playbook-catalog.md`, `review-checklist.md`,
// the on-call playbooks etc. only pay off if a fresh contributor / agent /
// on-call can reach them in a couple of clicks. Today nothing prevents a
// landing page from drifting out of sync with the doc that should be
// linked from it. This script catches that drift before merge:
//
//   1. parse each entrypoint *.md and follow only `[text](target)` links;
//   2. BFS through other repo *.md files up to `maxHops` links deep;
//   3. for every (role × target) row in `ROUTES`, fail if the target is
//      not reachable within the allowed hop budget.
//
// Adding/changing rows is a deliberate governance act — pair the diff
// with the doc edits that close the gap, like `MUST_BE_OWNED` in
// `check-codeowners-coverage.mjs`.
//
// CLI:
//   node scripts/check-discoverability.mjs            # report + exit code
//   node scripts/check-discoverability.mjs --json     # machine-readable
//   node scripts/check-discoverability.mjs --root <dir>   # alt repo root (tests)
//
// Linked initiative: docs/planning/ai-coding-improvements.md § Next blocks
// (Discoverability tests).

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_ROOT = resolve(__dirname, "..");

// ── Route matrix ─────────────────────────────────────────────────────────────
//
// One row = "role X must, from at least one of these entrypoints, reach
// target Y within ≤ maxHops link clicks". `entrypoints` is OR — any single
// entry that satisfies the budget passes the row.
//
// Targets are repo-relative paths. They can point at any file; only `.md`
// files are followed for further hops, so a `.json` / `.sql` target only
// counts if some `.md` directly links to it inside the budget.
//
// Edits here must come with the doc edits that satisfy the new constraint
// — the script is the gate, not the source of policy.

export const DEFAULT_MAX_HOPS = 2;

export const ROUTES = [
  // ── New agent landing for the first time ──────────────────────────────────
  {
    role: "new-agent",
    reason: "agent operating-system entrypoint",
    entrypoints: ["AGENTS.md"],
    target: ".agents/skills/sergeant-start-here/SKILL.md",
  },
  {
    role: "new-agent",
    reason: "skill routing catalog",
    entrypoints: ["AGENTS.md"],
    target: "docs/agents/agent-skills-catalog.md",
  },
  {
    role: "new-agent",
    reason: "workflow decision trees",
    entrypoints: ["AGENTS.md"],
    target: "docs/agents/agent-workflows.md",
  },
  {
    role: "new-agent",
    reason: "30-minute onboarding",
    entrypoints: ["AGENTS.md"],
    target: "docs/agents/onboarding.md",
  },
  {
    role: "new-agent",
    reason: "playbook routing catalog",
    entrypoints: ["AGENTS.md"],
    target: "docs/playbooks/playbook-catalog.md",
  },
  {
    role: "new-agent",
    reason: "execution recipes overview",
    entrypoints: ["AGENTS.md"],
    target: "docs/playbooks/README.md",
  },
  {
    role: "new-agent",
    reason: "machine-readable hard rules registry",
    entrypoints: ["AGENTS.md"],
    target: "docs/governance/hard-rules.json",
  },
  {
    role: "new-agent",
    reason: "generated hard rules matrix",
    entrypoints: ["AGENTS.md"],
    target: "docs/governance/hard-rules-matrix.md",
  },

  // ── New human contributor landing on the repo ────────────────────────────
  {
    role: "new-contributor",
    reason: "human contributor manual",
    entrypoints: ["README.md"],
    target: "CONTRIBUTING.md",
  },
  {
    role: "new-contributor",
    reason: "repo policy and hard rules",
    entrypoints: ["README.md"],
    target: "AGENTS.md",
  },
  {
    role: "new-contributor",
    reason: "execution recipes overview",
    entrypoints: ["README.md"],
    target: "docs/playbooks/README.md",
  },
  {
    role: "new-contributor",
    reason: "doc index",
    entrypoints: ["README.md"],
    target: "docs/README.md",
  },

  // ── On-call: hot-path playbooks reachable from any landing page ──────────
  {
    role: "on-call",
    reason: "declare a production incident",
    entrypoints: ["README.md", "AGENTS.md", "docs/playbooks/README.md"],
    target: "docs/playbooks/declare-incident.md",
  },
  {
    role: "on-call",
    reason: "respond to a prod regression",
    entrypoints: ["README.md", "AGENTS.md", "docs/playbooks/README.md"],
    target: "docs/playbooks/hotfix-prod-regression.md",
  },
  {
    role: "on-call",
    reason: "investigate alert / degradation",
    entrypoints: ["README.md", "AGENTS.md", "docs/playbooks/README.md"],
    target: "docs/playbooks/investigate-alert.md",
  },
  {
    role: "on-call",
    reason: "restore from backup",
    entrypoints: ["README.md", "AGENTS.md", "docs/playbooks/README.md"],
    target: "docs/playbooks/restore-from-backup.md",
  },
  {
    role: "on-call",
    reason: "write postmortem after an incident",
    entrypoints: ["README.md", "AGENTS.md", "docs/playbooks/README.md"],
    target: "docs/playbooks/write-postmortem.md",
  },

  // ── Reviewer: pre-merge governance ───────────────────────────────────────
  {
    role: "reviewer",
    reason: "review checklist",
    entrypoints: ["AGENTS.md", "README.md", "CONTRIBUTING.md"],
    target: "docs/governance/review-checklist.md",
  },
  {
    role: "reviewer",
    reason: "review-and-merge skill",
    entrypoints: ["AGENTS.md"],
    target: ".agents/skills/sergeant-review-and-merge/SKILL.md",
  },
];

// ── Markdown link extraction ─────────────────────────────────────────────────

const FENCE_RE = /^\s*```/;

/**
 * Extract `[text](target)` links from a markdown string. Skips fenced code
 * blocks and inline code spans, mirroring `check-markdown-links.mjs`.
 *
 * @returns {{ target: string, line: number }[]}
 */
export function extractLinks(content) {
  const out = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const stripped = line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
    // The `(?<!!)` lookbehind drops `![alt](src)` image syntax — images
    // are not navigation links and shouldn't count as discoverability hops.
    const re =
      /(?<!!)\[([^\]]+)\]\(([^()\s]+(?:\([^()]*\))?[^()\s]*)(?:\s+"[^"]*")?\)/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      out.push({ target: m[2], line: i + 1 });
    }
  }
  return out;
}

const ALWAYS_SKIP_SCHEMES =
  /^(mailto:|tel:|javascript:|data:|chrome:|https?:)/i;

/**
 * Resolve a markdown link target to a repo-relative path (with the anchor
 * stripped) or `null` if the link is external / a pure anchor / invalid.
 */
export function resolveTarget(sourceFile, target, repoRoot) {
  if (!target) return null;
  const trimmed = target.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return null;
  if (ALWAYS_SKIP_SCHEMES.test(trimmed)) return null;
  const [pathPart] = trimmed.split("#");
  if (!pathPart) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  const abs = isAbsolute(decoded)
    ? resolve(repoRoot, decoded.replace(/^\/+/, ""))
    : resolve(dirname(sourceFile), decoded);
  const rel = relative(repoRoot, abs).replace(/\\/g, "/");
  if (rel.startsWith("..")) return null;
  return rel;
}

/**
 * If `target` resolves to a directory, expand it to a `README.md` inside
 * the directory when one exists. This matches GitHub's UI behaviour and
 * the convention used across docs/* in this repo.
 */
function expandDirectoryTarget(repoRoot, rel) {
  if (!rel) return rel;
  const abs = resolve(repoRoot, rel);
  if (!existsSync(abs)) return rel;
  let st;
  try {
    st = statSync(abs);
  } catch {
    return rel;
  }
  if (!st.isDirectory()) return rel;
  const readme = join(rel, "README.md").replace(/\\/g, "/");
  const readmeAbs = resolve(repoRoot, readme);
  if (existsSync(readmeAbs)) return readme;
  return rel;
}

// ── BFS ──────────────────────────────────────────────────────────────────────

/**
 * Find the shortest path (in hops) from any entrypoint to `target`,
 * crawling outgoing markdown links from each visited *.md node. Returns
 * `{ hops, path }` on success or `null` when unreachable within the
 * budget.
 *
 * `path` is the chain of repo-relative paths starting at the entrypoint
 * that satisfied the row.
 */
export function findShortestPath(repoRoot, entrypoints, target, maxHops) {
  const normalizedTarget = expandDirectoryTarget(repoRoot, target);
  // Visited stores the best (smallest) hop count we've seen for a node so
  // we don't re-expand it later with a worse budget.
  const visited = new Map();
  const queue = [];
  for (const entry of entrypoints) {
    const norm = expandDirectoryTarget(repoRoot, entry);
    if (norm === normalizedTarget || entry === target) {
      // Caller asked to reach an entrypoint from itself; treat as 0 hops.
      return { hops: 0, path: [norm] };
    }
    if (!visited.has(norm)) {
      visited.set(norm, 0);
      queue.push({ rel: norm, hops: 0, path: [norm] });
    }
  }
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.hops >= maxHops) continue;
    const abs = resolve(repoRoot, cur.rel);
    if (!cur.rel.toLowerCase().endsWith(".md")) continue;
    if (!existsSync(abs)) continue;
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const links = extractLinks(content);
    for (const link of links) {
      const resolved = resolveTarget(abs, link.target, repoRoot);
      if (!resolved) continue;
      const expanded = expandDirectoryTarget(repoRoot, resolved);
      const nextHops = cur.hops + 1;
      const nextPath = [...cur.path, expanded];
      if (expanded === normalizedTarget || resolved === target) {
        return { hops: nextHops, path: nextPath };
      }
      if (!expanded.toLowerCase().endsWith(".md")) continue;
      if (!existsSync(resolve(repoRoot, expanded))) continue;
      const seen = visited.get(expanded);
      if (seen !== undefined && seen <= nextHops) continue;
      visited.set(expanded, nextHops);
      queue.push({ rel: expanded, hops: nextHops, path: nextPath });
    }
  }
  return null;
}

// ── Walking helpers (used by future fixture-driven extensions) ───────────────

/** List every .md file under `dir`, skipping vendor / build outputs. */
export function walkMarkdown(root, dir = root, out = []) {
  const SKIP = new Set([
    "node_modules",
    ".git",
    ".turbo",
    ".next",
    ".cache",
    "dist",
    "dist-server",
    "build",
    "coverage",
    "ios",
    "android",
  ]);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (SKIP.has(ent.name)) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkMarkdown(root, p, out);
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(relative(root, p).replace(/\\/g, "/"));
    }
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const rootIdx = argv.indexOf("--root");
  return {
    json: argv.includes("--json"),
    rootArg: rootIdx >= 0 ? argv[rootIdx + 1] : null,
  };
}

/**
 * Run the discoverability gate against `repoRoot` using `routes`. Pure
 * function — exported so unit tests don't need to spawn the CLI.
 */
export function checkRoutes(
  repoRoot,
  routes = ROUTES,
  maxHops = DEFAULT_MAX_HOPS,
) {
  const checked = [];
  const failures = [];
  for (const row of routes) {
    const missingEntrypoints = row.entrypoints.filter(
      (e) => !existsSync(resolve(repoRoot, e)),
    );
    if (missingEntrypoints.length === row.entrypoints.length) {
      // None of the configured entrypoints exist. Treat as a missing
      // pre-condition rather than a route failure — surfaces show up in
      // the JSON report with status="missing-entrypoints" so a future
      // refactor that drops AGENTS.md doesn't pretend the route is fine.
      checked.push({
        role: row.role,
        target: row.target,
        reason: row.reason,
        status: "missing-entrypoints",
        entrypoints: row.entrypoints,
      });
      continue;
    }
    if (!existsSync(resolve(repoRoot, row.target))) {
      checked.push({
        role: row.role,
        target: row.target,
        reason: row.reason,
        status: "missing-target",
        entrypoints: row.entrypoints,
      });
      continue;
    }
    const result = findShortestPath(
      repoRoot,
      row.entrypoints,
      row.target,
      row.maxHops ?? maxHops,
    );
    if (!result) {
      failures.push({
        role: row.role,
        target: row.target,
        reason: row.reason,
        entrypoints: row.entrypoints,
        maxHops: row.maxHops ?? maxHops,
      });
      continue;
    }
    checked.push({
      role: row.role,
      target: row.target,
      reason: row.reason,
      status: "reachable",
      hops: result.hops,
      via: result.path,
      entrypoints: row.entrypoints,
    });
  }
  return { checked, failures, ok: failures.length === 0 };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.rootArg ? resolve(args.rootArg) : DEFAULT_ROOT;
  const report = checkRoutes(repoRoot);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  const reachable = report.checked.filter((c) => c.status === "reachable");
  const missingEntries = report.checked.filter(
    (c) => c.status === "missing-entrypoints",
  );
  const missingTargets = report.checked.filter(
    (c) => c.status === "missing-target",
  );

  if (report.ok) {
    console.log(
      `✅ Discoverability OK — ${reachable.length} route(s) reachable within budget.`,
    );
    if (missingEntries.length > 0) {
      console.log(
        `   (${missingEntries.length} row(s) skipped — entrypoint files missing.)`,
      );
    }
    if (missingTargets.length > 0) {
      console.log(
        `   (${missingTargets.length} row(s) skipped — target file missing.)`,
      );
    }
    process.exit(0);
  }

  console.error("❌ Discoverability failure\n");
  for (const f of report.failures) {
    console.error(
      `  - role=${f.role}: cannot reach ${f.target} within ${f.maxHops} hop(s) from any of:`,
    );
    for (const e of f.entrypoints) {
      console.error(`      • ${e}`);
    }
    console.error(`    reason: ${f.reason}\n`);
  }
  console.error(
    "Fix: add a markdown link from one of the listed entrypoints (or a doc " +
      "they already reach within the budget) to the missing target. If the " +
      "row is wrong, edit ROUTES in scripts/check-discoverability.mjs and " +
      "explain in the PR body — this is a governance change.\n",
  );
  process.exit(1);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
