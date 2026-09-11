#!/usr/bin/env node

/** Build the auditable old-path → final-path matrix for the docs migration. */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT = resolve(
  ROOT,
  "docs/work/specs/data/documentation-inventory.json",
);
const CHECK = process.argv.includes("--check");
const SHA = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
const TEXT_EXTENSIONS =
  /\.(?:md|json|mjs|js|ts|tsx|yml|yaml|toml|hbs|css|html|alloy)$/u;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function repoPath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

const baseline = execFileSync(
  "git",
  ["ls-tree", "-r", "--name-only", "HEAD", "docs"],
  {
    cwd: ROOT,
    encoding: "utf8",
  },
)
  .split(/\r?\n/u)
  .filter(Boolean)
  .sort();
const current = walk(resolve(ROOT, "docs")).map(repoPath).sort();
const currentSet = new Set(current);

function finalPathFor(oldPath) {
  const moves = [
    ["docs/00-start/playbooks", "docs/start/instructions"],
    ["docs/03-operations/runbooks", "docs/start/instructions"],
    ["docs/01-product/model/finyk.md", "docs/product/modules/finyk.md"],
    ["docs/01-product/model/fizruk.md", "docs/product/modules/fizruk.md"],
    ["docs/01-product/model/hub-coach.md", "docs/product/modules/hub-coach.md"],
    ["docs/01-product/model/nutrition.md", "docs/product/modules/nutrition.md"],
    ["docs/01-product/model/routine.md", "docs/product/modules/routine.md"],
    ["docs/01-product/launch", "docs/work/specs/launch"],
    [
      "docs/04-governance/security/hardening",
      "docs/work/specs/security-hardening",
    ],
    ["docs/90-work/planning/specs", "docs/work/specs"],
    ["docs/90-work/initiatives", "docs/work/specs/initiatives"],
    ["docs/90-work/planning", "docs/work/specs/planning"],
    ["docs/90-work/audits", "docs/work/specs/audits"],
    ["docs/90-work/tech-debt", "docs/work/specs/tech-debt"],
    ["docs/90-work/superpowers", "docs/work/specs/superpowers"],
    ["docs/90-work/beta-launch", "docs/work/specs/beta-launch"],
    ["docs/00-start", "docs/start"],
    ["docs/01-product", "docs/product"],
    ["docs/02-engineering", "docs/engineering"],
    ["docs/03-operations", "docs/operations"],
    ["docs/04-governance", "docs/governance"],
    ["docs/05-design", "docs/design"],
    ["docs/90-work", "docs/work"],
  ];
  for (const [from, to] of moves) {
    if (oldPath === from || oldPath.startsWith(`${from}/`)) {
      return `${to}${oldPath.slice(from.length)}`;
    }
  }
  return oldPath;
}

function genreFor(path) {
  if (path.includes("/adr/")) return "adr";
  if (path.startsWith("docs/work/specs/")) return "active-work";
  if (path.startsWith("docs/start/instructions/")) return "instruction";
  if (path.startsWith("docs/product/modules/")) return "product-canon";
  if (
    path.endsWith("README.md") ||
    /^docs\/(?:STATUS|today|open-work)\.md$/u.test(path)
  )
    return "index";
  return "reference";
}

const inbound = new Map();
function addInbound(target, source) {
  if (!target.startsWith("docs/")) return;
  const sources = inbound.get(target) ?? new Set();
  sources.add(source);
  inbound.set(target, sources);
}

for (const sourcePath of current.filter(
  (path) => TEXT_EXTENSIONS.test(path) && resolve(ROOT, path) !== OUTPUT,
)) {
  const source = readFileSync(resolve(ROOT, sourcePath), "utf8");
  const withoutUrls = source.replace(/https?:\/\/\S+/gu, "");
  for (const match of withoutUrls.matchAll(/docs\/[A-Za-z0-9_.@/-]+/gu)) {
    addInbound(match[0].replace(/[.,;:]$/u, ""), sourcePath);
  }
  if (!sourcePath.endsWith(".md")) continue;
  for (const match of source.matchAll(
    /\]\((?!https?:|mailto:|#)<?([^)>\s#]+)(?:#[^)>\s]+)?>?/gu,
  )) {
    let href;
    try {
      href = decodeURIComponent(match[1]);
    } catch {
      href = match[1];
    }
    addInbound(
      repoPath(resolve(dirname(resolve(ROOT, sourcePath)), href)),
      sourcePath,
    );
  }
}

const entries = baseline.map((oldPath) => {
  const proposed = finalPathFor(oldPath);
  const exists = currentSet.has(proposed);
  const removed = !exists || proposed.includes("/archive/");
  const newPath = removed
    ? `https://github.com/SkOrDs-01/Sergeant/blob/${SHA}/${oldPath}`
    : proposed;
  const sources = [...(inbound.get(exists ? proposed : oldPath) ?? [])].sort();
  const mergedReadme =
    oldPath === "docs/start/playbooks/README.md" ||
    oldPath === "docs/operations/runbooks/README.md";
  return {
    old_path: oldPath,
    new_path: newPath,
    action: removed
      ? "remove"
      : mergedReadme
        ? "merge"
        : oldPath === proposed
          ? "keep"
          : "move",
    genre: genreFor(proposed),
    canonical_owner: newPath,
    inbound_count: sources.length,
    inbound_sources: sources,
  };
});

const baselineSet = new Set(baseline);
for (const path of current) {
  if (baselineSet.has(path)) continue;
  if (entries.some((entry) => entry.new_path === path)) continue;
  const sources = [...(inbound.get(path) ?? [])].sort();
  entries.push({
    old_path: null,
    new_path: path,
    action: "keep",
    genre: genreFor(path),
    canonical_owner: path,
    inbound_count: sources.length,
    inbound_sources: sources,
  });
}
entries.sort((a, b) =>
  (a.old_path ?? a.new_path).localeCompare(b.old_path ?? b.new_path),
);

const targets = new Map();
for (const entry of entries.filter(
  (item) => !item.new_path.startsWith("https://"),
)) {
  const paths = targets.get(entry.new_path) ?? [];
  paths.push(entry.old_path);
  targets.set(entry.new_path, paths);
}
const targetCollisions = [...targets.entries()]
  .filter(([target, paths]) => {
    if (paths.length < 2) return false;
    const rows = entries.filter((entry) => entry.new_path === target);
    return !rows.every((entry) => entry.action === "merge");
  })
  .map(([new_path, old_paths]) => ({ new_path, old_paths }));

const output = await format(
  JSON.stringify(
    {
      _generated: true,
      generated_by: "scripts/docs/generate-documentation-inventory.mjs",
      baseline_revision: SHA,
      baseline_files: baseline.length,
      current_files: current.length,
      total_entries: entries.length,
      target_collisions: targetCollisions,
      entries,
    },
    null,
    2,
  ),
  { parser: "json" },
);

if (CHECK) {
  let existing = "";
  try {
    existing = readFileSync(OUTPUT, "utf8");
  } catch {
    // A missing matrix is drift.
  }
  if (existing !== output) {
    console.error(
      `${repoPath(OUTPUT)} is out of date. Run pnpm docs:gen-inventory.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Documentation inventory is current (${entries.length} entries).`,
    );
  }
} else {
  writeFileSync(OUTPUT, output);
  console.log(`Wrote ${repoPath(OUTPUT)} (${entries.length} entries).`);
}
