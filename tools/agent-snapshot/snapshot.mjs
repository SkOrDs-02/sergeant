#!/usr/bin/env node
// tools/agent-snapshot/snapshot.mjs
//
// Dynamic agent snapshot for Sergeant — gathers CI status, budgets, open
// entropy-janitor issues, recent PR-ledger entries, hard-rule drift, active
// initiative deadlines, and AI-marker hints into a single small markdown
// report. Called by agents at the start of a session so they can react to
// the current state of the repo, not just its static policy.
//
// Spec: docs/04-governance/adr/0067-dynamic-agent-snapshot.md
//
// Output: writes to .kilocode/snapshot.md by default (override via argv[2]).
// Cache:  .kilocode/snapshot.cache.json, 15 min TTL, invalidated on `git pull`.
// Graceful: any gh / network / fs failure becomes `[unavailable: <reason>]`.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const REPO_ROOT = process.cwd();
const CACHE_DIR = resolve(REPO_ROOT, ".kilocode");
const CACHE_PATH = resolve(CACHE_DIR, "snapshot.cache.json");
const DEFAULT_OUT = resolve(CACHE_DIR, "snapshot.md");
const TTL_MS = 15 * 60 * 1000;
const MAX_BYTES = 50 * 1024;
const SHELL_TIMEOUT_MS = 8_000;

// ---------- helpers ----------

function sh(cmd, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? SHELL_TIMEOUT_MS;
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: REPO_ROOT,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
      ...opts,
    }).trim();
  } catch (err) {
    if (err.code === "ETIMEDOUT" || err.signal === "SIGTERM") {
      return `__ERR__:timeout(${cmd})`;
    }
    const stderr = (err.stderr || "").toString().trim();
    return stderr
      ? `__ERR__:${stderr.split("\n")[0].slice(0, 200)}`
      : `__ERR__:${err.message}`;
  }
}

function tryJson(cmd, args, opts = {}) {
  const out = sh(cmd, args, opts);
  if (out.startsWith("__ERR__:"))
    return { __unavailable__: out.slice("__ERR__:".length) };
  try {
    return JSON.parse(out);
  } catch {
    return { __unavailable__: `non-JSON from ${cmd}` };
  }
}

function isoNow() {
  return new Date().toISOString();
}

function truncate(str, max = 500) {
  if (typeof str !== "string") return str;
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function bytes(str) {
  return Buffer.byteLength(str, "utf8");
}

function loadCache() {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const stat = statSync(CACHE_PATH);
    if (Date.now() - stat.mtimeMs > TTL_MS) return null;
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function saveCache(snapshot, meta) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({ snapshot, meta, generated_at: isoNow() }, null, 2),
    );
  } catch {
    /* best-effort */
  }
}

// ---------- sections ----------

function sectionRepo() {
  const branch = sh("git", ["branch", "--show-current"]);
  const baseRaw = sh("git", ["rev-parse", "--abbrev-ref", "HEAD@{u}"]);
  const base = baseRaw.startsWith("__ERR__")
    ? "main"
    : baseRaw.replace(/^origin\//, "");
  const baseSha = sh("git", ["rev-parse", "--short", base]);
  const ahead = sh("git", ["rev-list", "--count", `${base}..HEAD`]);
  const porcelain = sh("git", ["status", "--porcelain"]);
  const lines = porcelain ? porcelain.split("\n").filter(Boolean) : [];
  const modified = lines.filter((l) => /^\s*M/.test(l)).length;
  const untracked = lines.filter((l) => /^\?\?/.test(l)).length;
  const worktrees = sh("git", ["worktree", "list", "--porcelain"]);
  const wtCount = worktrees.startsWith("__ERR__")
    ? 0
    : worktrees.split("\n\n").filter(Boolean).length;

  return [
    "## Repo",
    `- branch: \`${branch || "(detached)"}\``,
    `- base: \`${base}\` @ \`${baseSha}\` (${ahead || "0"} commits ahead)`,
    `- active worktrees: ${wtCount}`,
    `- dirty: ${modified} modified, ${untracked} untracked`,
  ].join("\n");
}

function sectionCi() {
  const repoPathRaw = sh("git", ["config", "--get", "remote.origin.url"]);
  const ownerSlash = repoPathRaw.startsWith("__ERR__")
    ? "Skords-01/Sergeant"
    : repoPathRaw
        .replace(/^git@github\.com:/, "")
        .replace(/^https?:\/\/github\.com\//, "")
        .replace(/\.git$/, "");
  const data = tryJson("gh", [
    "api",
    `repos/${ownerSlash}/commits/main/check-runs`,
    "--jq",
    ".check_runs",
  ]);
  if (data.__unavailable__) {
    return [
      "## CI last run on main",
      `- Status: \`[unavailable: ${truncate(data.__unavailable__, 120)}]\``,
    ].join("\n");
  }
  const runs = Array.isArray(data) ? data : [];
  const passed = runs.filter((r) => r.conclusion === "success").length;
  const failed = runs.filter((r) => r.conclusion === "failure").length;
  const skipped = runs.filter(
    (r) => r.conclusion === "skipped" || r.conclusion === "neutral",
  ).length;
  const inProgress = runs.filter(
    (r) => r.status === "in_progress" || r.status === "queued",
  ).length;
  const failRuns = runs
    .filter((r) => r.conclusion === "failure")
    .slice(0, 5)
    .map((r) => `    - ${r.name}`);

  let status;
  if (inProgress > 0) status = `🟡 in progress (${inProgress} pending)`;
  else if (failed > 0) status = `🔴 red (${failed} failed)`;
  else if (passed === 0 && skipped === 0) status = "⚪ no runs";
  else status = "✅ green";

  const lastCompleted = runs
    .filter((r) => r.completed_at)
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))[0];

  return [
    "## CI last run on main",
    `- Status: ${status}`,
    `- Checks: ${passed} passed, ${failed} failed, ${skipped} skipped${inProgress ? `, ${inProgress} pending` : ""}`,
    lastCompleted
      ? `- Last completed: ${lastCompleted.name} at ${lastCompleted.completed_at}`
      : "- Last completed: (none)",
    ...(failRuns.length ? [`- Failures:\n${failRuns.join("\n")}`] : []),
  ].join("\n");
}

function sectionBudgets() {
  const candidates = [
    "apps/web/dist/bundle-stats.json",
    "apps/server/dist/bundle-stats.json",
    "dist/bundle-stats.json",
  ];
  let raw = null;
  let usedPath = null;
  for (const p of candidates) {
    const abs = resolve(REPO_ROOT, p);
    if (existsSync(abs)) {
      try {
        raw = JSON.parse(readFileSync(abs, "utf8"));
        usedPath = p;
        break;
      } catch {
        /* try next */
      }
    }
  }

  const JS_BUDGET = 1.2 * 1024 * 1024;
  const CSS_BUDGET = 36 * 1024;
  let jsText = "`[unavailable: no bundle-stats.json]`";
  let cssText = "`[unavailable: no bundle-stats.json]`";

  if (raw) {
    const jsBytes = Number(raw.jsBrotliBytes ?? raw.jsBundleBytes ?? 0);
    const cssBytes = Number(raw.cssBrotliBytes ?? raw.cssBundleBytes ?? 0);
    if (jsBytes > 0) jsText = formatBudget(jsBytes, JS_BUDGET, "≤ 1.2 MB");
    if (cssBytes > 0) cssText = formatBudget(cssBytes, CSS_BUDGET, "≤ 36 kB");
  }

  const lcpRaw = sh(
    "gh",
    [
      "run",
      "list",
      "--workflow=lighthouse-ci.yml",
      "--limit=1",
      "--json",
      "conclusion,displayTitle",
    ],
    { timeoutMs: 5_000 },
  );
  let lcpLine = "`[gh unavailable]`";
  if (!lcpRaw.startsWith("__ERR__:")) {
    try {
      const arr = JSON.parse(lcpRaw);
      if (Array.isArray(arr) && arr.length > 0) {
        const r = arr[0];
        lcpLine =
          r.conclusion === "success"
            ? "✅ last LHCI run succeeded"
            : `⚠️ ${r.conclusion} — ${truncate(r.displayTitle, 80)}`;
      } else {
        lcpLine = "⚪ no LHCI runs found";
      }
    } catch {
      lcpLine = "`[non-JSON LHCI list]`";
    }
  }

  return [
    "## Budgets (apps/web)",
    `- JS bundle (brotli): ${jsText}${usedPath ? ` — source: \`${usedPath}\`` : ""}`,
    `- CSS bundle: ${cssText}`,
    `- Lighthouse CI: ${lcpLine}`,
  ].join("\n");
}

function formatBudget(actualBytes, budgetBytes, budgetLabel) {
  if (!budgetBytes) return actualBytes;
  const pct = Math.round((actualBytes / budgetBytes) * 100);
  const status = pct >= 100 ? "🔴 OVER" : pct >= 95 ? "⚠️ warn" : "✅";
  return `${formatKb(actualBytes)} / ${budgetLabel} (${pct}%) ${status}`;
}

function formatKb(b) {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} kB`;
  return `${b} B`;
}

function sectionEntropyIssues() {
  const data = tryJson("gh", [
    "issue",
    "list",
    "--label",
    "entropy-janitor/*",
    "--state",
    "open",
    "--limit",
    "20",
    "--json",
    "number,title,labels,createdAt",
  ]);
  if (data.__unavailable__) {
    return [
      "## Open entropy-janitor issues",
      `- \`[gh unavailable: ${truncate(data.__unavailable__, 100)}]\``,
    ].join("\n");
  }
  if (!Array.isArray(data) || data.length === 0) {
    return ["## Open entropy-janitor issues", "- (none)"].join("\n");
  }
  const items = data.map((i) => {
    const label = (i.labels || []).find(
      (l) => l.name && l.name.startsWith("entropy-janitor/"),
    );
    return `- #${i.number}${label ? ` \`${label.name}\`` : ""}: ${truncate(i.title, 120)}`;
  });
  return [
    "## Open entropy-janitor issues",
    `- ${data.length} open`,
    ...items,
  ].join("\n");
}

function sectionPrLedger() {
  const ledgerPath = resolve(
    REPO_ROOT,
    "docs/04-governance/pr-ledger/index.json",
  );
  if (!existsSync(ledgerPath)) {
    return [
      "## Recent PR-ledger entries (last 5)",
      "- `docs/04-governance/pr-ledger/index.json` not found",
    ].join("\n");
  }
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  } catch (err) {
    return [
      "## Recent PR-ledger entries (last 5)",
      `- \`[parse error: ${truncate(err.message, 80)}]\``,
    ].join("\n");
  }
  const prs = Array.isArray(ledger.prs) ? ledger.prs.slice(0, 5) : [];
  if (prs.length === 0) {
    return ["## Recent PR-ledger entries (last 5)", "- (empty ledger)"].join(
      "\n",
    );
  }
  const lines = prs.map(
    (p) => `- #${p.number}: ${truncate(p.title, 120)} — ${p.merged_at}`,
  );
  return ["## Recent PR-ledger entries (last 5)", ...lines].join("\n");
}

function sectionHardRuleDrift() {
  const regPath = resolve(
    REPO_ROOT,
    "docs/04-governance/governance/hard-rules.json",
  );
  const rulesDir = resolve(REPO_ROOT, "docs/04-governance/governance/rules");
  const lines = ["## Hard-rule drift warnings"];
  if (!existsSync(regPath)) {
    lines.push("- `hard-rules.json` not found");
    return lines.join("\n");
  }
  try {
    const reg = JSON.parse(readFileSync(regPath, "utf8"));
    const regCount = Array.isArray(reg.rules) ? reg.rules.length : 0;
    let filesCount = 0;
    if (existsSync(rulesDir)) {
      try {
        filesCount =
          parseInt(
            execFileSync(
              "node",
              [
                "-e",
                `const fs=require('fs');console.log(fs.readdirSync(${JSON.stringify(rulesDir)}).filter(f=>f.endsWith('.md')).length)`,
              ],
              { encoding: "utf8", timeout: 3_000 },
            ).trim(),
            10,
          ) || 0;
      } catch {
        filesCount = 0;
      }
    }
    lines.push(`- registry: ${regCount} rules / ${filesCount} per-rule files`);
    lines.push(
      "- (drift detection runs in `pnpm lint:hard-rules-registry` — not evaluated here)",
    );
  } catch (err) {
    lines.push(`- \`[parse error: ${truncate(err.message, 80)}]\``);
  }
  return lines.join("\n");
}

function sectionInitiativeDeadlines() {
  // Bounded: scan only initiative + adr + playbook trees, with a short per-call timeout.
  const ripgrep = sh(
    "git",
    [
      "grep",
      "--no-color",
      "-lE",
      "TODO\\([0-9]{4}-[a-z0-9-]+\\):\\s*20[0-9]{2}-[0-9]{2}-[0-9]{2}",
      "--",
      "docs/90-work/initiatives",
      "docs/04-governance/adr",
      "docs/00-start/playbooks",
    ],
    { timeoutMs: 6_000 },
  );
  if (ripgrep.startsWith("__ERR__") || !ripgrep) {
    return [
      "## Active initiative deadlines (next 30 days)",
      "- (none matched `TODO(NNNN-…): YYYY-MM-DD` within 30d)",
    ].join("\n");
  }
  const files = ripgrep.split("\n").filter(Boolean).slice(0, 20);
  const nowMs = Date.now();
  const horizon = nowMs + 30 * 24 * 60 * 60 * 1000;
  const upcoming = [];
  for (const f of files) {
    const abs = resolve(REPO_ROOT, f);
    let content;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const re = /TODO\(([0-9]{4}-[a-z0-9-]+)\):\s*20[0-9]{2}-[0-9]{2}-[0-9]{2}/g;
    let m;
    let first = true;
    while ((m = re.exec(content)) !== null) {
      const id = m[1];
      const dateMatch = m[0].match(/(\d{4}-\d{2}-\d{2})$/);
      if (!dateMatch) continue;
      const ts = Date.parse(dateMatch[1]);
      if (!Number.isFinite(ts)) continue;
      if (ts < nowMs || ts > horizon) continue;
      if (first) {
        upcoming.push(`- \`${f}\``);
        first = false;
      }
      upcoming.push(`    - TODO(${id}): ${dateMatch[1]}`);
      if (upcoming.length > 12) break;
    }
    if (upcoming.length > 12) break;
  }
  if (upcoming.length === 0) {
    return [
      "## Active initiative deadlines (next 30 days)",
      "- (none within 30 days)",
    ].join("\n");
  }
  return ["## Active initiative deadlines (next 30 days)", ...upcoming].join(
    "\n",
  );
}

function sectionAgentHints() {
  const lastCommitRaw = sh("git", [
    "log",
    "-1",
    "--format=%H%x09%an%x09%ae%x09%s%x09%aI",
  ]);
  if (lastCommitRaw.startsWith("__ERR__")) {
    return [
      "## Agent hints",
      `- \`[git unavailable: ${truncate(lastCommitRaw, 100)}]\``,
    ].join("\n");
  }
  const [sha, author, email, subject, iso] = lastCommitRaw.split("\t");
  const numstat = sh("git", ["show", "--name-only", "--format=", sha]);
  const files = numstat.startsWith("__ERR__")
    ? []
    : numstat.split("\n").filter(Boolean).slice(0, 50);

  const markerFiles = [];
  for (const f of files) {
    if (!f.match(/\.(ts|tsx|js|jsx|mjs|cjs|md)$/)) continue;
    const abs = resolve(REPO_ROOT, f);
    if (!existsSync(abs)) continue;
    try {
      const c = readFileSync(abs, "utf8");
      if (/AI-(NOTE|CONTEXT|DANGER|LEGACY|PLANNED)/.test(c))
        markerFiles.push(f);
    } catch {
      /* ignore */
    }
  }

  // Legacy expiry scan — only across touched files, capped.
  let legacyExpiring = "";
  for (const f of markerFiles.slice(0, 5)) {
    const abs = resolve(REPO_ROOT, f);
    if (!existsSync(abs)) continue;
    try {
      const c = readFileSync(abs, "utf8");
      const m = c.match(/AI-LEGACY:\s*expires\s*(\d{4}-\d{2}-\d{2})/);
      if (m) {
        const ts = Date.parse(m[1]);
        if (Number.isFinite(ts)) {
          const days = Math.round((ts - Date.now()) / (24 * 60 * 60 * 1000));
          if (days >= 0 && days <= 30) {
            legacyExpiring = `- AI-LEGACY expiring soon: \`${f}\` → ${m[1]} (${days}d)`;
            break;
          }
          if (days < 0)
            legacyExpiring = `- AI-LEGACY EXPIRED: \`${f}\` → ${m[1]} (-${Math.abs(days)}d)`;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Branch → suggested skill heuristic.
  const branch = sh("git", ["branch", "--show-current"]);
  let suggestedSkill = "sergeant-review-and-merge";
  if (/^(feat|fix|chore)\/web(-|\/)/.test(branch))
    suggestedSkill = "sergeant-web-ui";
  else if (/^(feat|fix|chore)\/server(-|\/)/.test(branch))
    suggestedSkill = "sergeant-server-api";
  else if (/^(feat|fix|chore)\/mobile(-|\/)/.test(branch))
    suggestedSkill = "sergeant-mobile-expo";
  else if (/^docs\/agents|skills|adr/.test(branch))
    suggestedSkill = "sergeant-writing-skills";
  else if (/deps/.test(branch))
    suggestedSkill = "sergeant-deploy-and-observability";

  return [
    "## Agent hints",
    `- last commit: \`${(sha || "").slice(0, 7)}\` by \`${author}\` <${email}> at ${iso}`,
    `- last commit subject: ${truncate(subject, 120)}`,
    `- last commit AI markers: ${markerFiles.length} file(s) carry AI-NOTE/CONTEXT/DANGER/LEGACY${
      markerFiles.length
        ? ` — ${markerFiles
            .slice(0, 3)
            .map((f) => `\`${f}\``)
            .join(", ")}`
        : ""
    }`,
    legacyExpiring,
    `- suggested skill for current branch area: \`${suggestedSkill}\``,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- compose ----------

function buildSnapshot() {
  const sections = [
    `# Sergeant Agent Snapshot — ${isoNow()}`,
    "",
    sectionRepo(),
    "",
    sectionCi(),
    "",
    sectionBudgets(),
    "",
    sectionEntropyIssues(),
    "",
    sectionPrLedger(),
    "",
    sectionHardRuleDrift(),
    "",
    sectionInitiativeDeadlines(),
    "",
    sectionAgentHints(),
  ];
  return sections.join("\n");
}

// ---------- main ----------

function detectPull() {
  try {
    const refPath = resolve(REPO_ROOT, ".git/FETCH_HEAD");
    if (!existsSync(refPath)) return false;
    const s = statSync(refPath);
    return Date.now() - s.mtimeMs < 60 * 1000;
  } catch {
    return false;
  }
}

function main() {
  const argv = process.argv.slice(2).filter((a) => a && a !== "--");
  const forceRefresh = argv.includes("--refresh");
  const outArg = argv.find((a) => !a.startsWith("--"));

  if (!forceRefresh && !detectPull()) {
    const cached = loadCache();
    if (cached && typeof cached.snapshot === "string") {
      const outPath = outArg ? resolve(REPO_ROOT, outArg) : DEFAULT_OUT;
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, cached.snapshot, "utf8");
      process.stderr.write(
        `snapshot.mjs: served from cache (≤15 min old) → ${outPath}\n`,
      );
      return;
    }
  }

  const snapshot = buildSnapshot();
  let truncated = snapshot;
  let noteLine = "";
  if (bytes(truncated) > MAX_BYTES) {
    truncated = truncated
      .replace(
        /^## Open entropy-janitor issues[\s\S]*?(?=^## )/gm,
        "## Open entropy-janitor issues\n- (details omitted — snapshot exceeded 50KB)",
      )
      .replace(
        /^## CI last run on main[\s\S]*?(?=^## )/gm,
        "## CI last run on main\n- (details omitted — snapshot exceeded 50KB)",
      );
    if (bytes(truncated) > MAX_BYTES) {
      truncated =
        truncated.slice(0, MAX_BYTES - 64) +
        "\n\n_(snapshot truncated — exceeds 50KB)_";
    }
    noteLine = `snapshot.mjs: trimmed to ≤50KB\n`;
  }

  const outPath = outArg ? resolve(REPO_ROOT, outArg) : DEFAULT_OUT;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, truncated, "utf8");
  saveCache(truncated, {
    bytes: bytes(truncated),
    truncated: truncated !== snapshot,
  });

  process.stderr.write(
    `${noteLine}snapshot.mjs: wrote ${bytes(truncated)} bytes to ${outPath}\n`,
  );
}

main();
