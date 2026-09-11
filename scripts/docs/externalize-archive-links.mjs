#!/usr/bin/env node

/** Replace links to local documentation archives with immutable GitHub URLs. */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SHA = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
const BASE = `https://github.com/Skords-01/Sergeant`;
const TOP_LEVEL = [
  ["docs/start", "docs/00-start"],
  ["docs/product", "docs/01-product"],
  ["docs/engineering", "docs/02-engineering"],
  ["docs/operations", "docs/03-operations"],
  ["docs/governance", "docs/04-governance"],
  ["docs/design", "docs/05-design"],
  ["docs/work", "docs/90-work"],
];
const SPEC_ORIGINS = [
  [
    "docs/work/specs/security-hardening",
    "docs/04-governance/security/hardening",
  ],
  ["docs/work/specs/launch", "docs/01-product/launch"],
  ["docs/work/specs/initiatives", "docs/90-work/initiatives"],
  ["docs/work/specs/planning", "docs/90-work/planning"],
  ["docs/work/specs/audits", "docs/90-work/audits"],
  ["docs/work/specs/tech-debt", "docs/90-work/tech-debt"],
  ["docs/work/specs/superpowers", "docs/90-work/superpowers"],
  ["docs/work/specs/beta-launch", "docs/90-work/beta-launch"],
  ["docs/work/specs/archive", "docs/90-work/planning/specs/archive"],
];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function repoPath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function historicalPath(current) {
  for (const [from, to] of SPEC_ORIGINS) {
    if (current === from || current.startsWith(`${from}/`)) {
      return `${to}${current.slice(from.length)}`;
    }
  }
  for (const [from, to] of TOP_LEVEL) {
    if (current === from || current.startsWith(`${from}/`)) {
      return `${to}${current.slice(from.length)}`;
    }
  }
  return current;
}

let changedFiles = 0;
let changedLinks = 0;
for (const file of walk(resolve(ROOT, "docs")).filter((path) =>
  path.endsWith(".md"),
)) {
  if (repoPath(file).includes("/archive/")) continue;
  const source = readFileSync(file, "utf8");
  const updated = source.replace(
    /\]\((?!https?:|mailto:|#)(<?)([^)>\s]+)(>?)([^)]*)\)/gu,
    (match, _open, href, _close, tail) => {
      const [pathPart, ...anchors] = href.split("#");
      let decoded;
      try {
        decoded = decodeURIComponent(pathPart);
      } catch {
        decoded = pathPart;
      }
      const target = resolve(dirname(file), decoded);
      if (!existsSync(target)) return match;
      const current = repoPath(target);
      if (!current.includes("/archive/")) return match;
      const kind = statSync(target).isDirectory() ? "tree" : "blob";
      const anchor = anchors.length > 0 ? `#${anchors.join("#")}` : "";
      changedLinks += 1;
      return `](${BASE}/${kind}/${SHA}/${historicalPath(current)}${anchor}${tail})`;
    },
  );
  if (updated === source) continue;
  writeFileSync(file, updated);
  changedFiles += 1;
}

console.log(
  `Externalized ${changedLinks} archive link(s) in ${changedFiles} file(s).`,
);
