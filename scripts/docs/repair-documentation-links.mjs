#!/usr/bin/env node

/** Repair relative Markdown links after documentation directory moves. */
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
const CHECK = process.argv.includes("--check");
const PATH_MOVES = [
  ["docs/start/instructions", "docs/start/instructions"],
  ["docs/start/instructions", "docs/start/instructions"],
  ["docs/product/modules/finyk.md", "docs/product/modules/finyk.md"],
  ["docs/product/modules/fizruk.md", "docs/product/modules/fizruk.md"],
  ["docs/product/modules/hub-coach.md", "docs/product/modules/hub-coach.md"],
  ["docs/product/modules/nutrition.md", "docs/product/modules/nutrition.md"],
  ["docs/product/modules/routine.md", "docs/product/modules/routine.md"],
  ["docs/work/specs/launch", "docs/work/specs/launch"],
  ["docs/work/specs/security-hardening", "docs/work/specs/security-hardening"],
  ["docs/work/specs/initiatives", "docs/work/specs/initiatives"],
  ["docs/work/specs/planning", "docs/work/specs/planning"],
  ["docs/work/specs/audits", "docs/work/specs/audits"],
  ["docs/work/specs/tech-debt", "docs/work/specs/tech-debt"],
  ["docs/work/specs/superpowers", "docs/work/specs/superpowers"],
  ["docs/work/specs/beta-launch", "docs/work/specs/beta-launch"],
];

function walk(directory, includeDirectories = false) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (includeDirectories) output.push(path);
      output.push(...walk(path, includeDirectories));
    } else {
      output.push(path);
    }
  }
  return output;
}

const tracked = execFileSync("git", ["ls-files"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((path) => resolve(ROOT, path));
const docsFiles = walk(resolve(ROOT, "docs"));
const markdown = [
  ...tracked.filter((path) => path.endsWith(".md")),
  ...walk(resolve(ROOT, "docs")).filter((path) => path.endsWith(".md")),
];
const files = [...new Set([...tracked, ...docsFiles])].filter(existsSync);
const directories = [
  ...new Set(
    files.flatMap((path) => {
      const values = [];
      let current = dirname(path);
      while (current.startsWith(ROOT) && current !== ROOT) {
        values.push(current);
        current = dirname(current);
      }
      return values;
    }),
  ),
];

function repoPath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function movedPath(path) {
  let next = path;
  for (const [from, to] of PATH_MOVES) {
    if (next === from || next.startsWith(`${from}/`)) {
      next = `${to}${next.slice(from.length)}`;
    }
  }
  return next;
}

function suffixScore(raw, candidate) {
  const wanted = movedPath(raw.replaceAll("\\", "/"))
    .split("/")
    .filter((part) => part && part !== "." && part !== ".." && part !== "docs");
  const actual = repoPath(candidate).split("/");
  let score = 0;
  while (
    score < wanted.length &&
    score < actual.length &&
    wanted.at(-1 - score) === actual.at(-1 - score)
  ) {
    score += 1;
  }
  return score;
}

function bestCandidate(raw, pool) {
  const name = raw.replaceAll("\\", "/").replace(/\/$/u, "").split("/").at(-1);
  const candidates = pool.filter(
    (path) => path.replaceAll("\\", "/").split("/").at(-1) === name,
  );
  const ranked = candidates
    .map((path) => ({ path, score: suffixScore(raw, path) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0 || ranked[0].score === 0) return null;
  if (ranked[1]?.score === ranked[0].score) return null;
  return ranked[0].path;
}

function destinationFor(source, raw) {
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const direct = resolve(dirname(source), decoded);
  if (existsSync(direct)) return null;

  const directRepo = repoPath(direct);
  const mapped = resolve(ROOT, movedPath(directRepo));
  if (existsSync(mapped)) return mapped;

  const wantsDirectory =
    raw.endsWith("/") || !raw.split("/").at(-1)?.includes(".");
  return bestCandidate(decoded, wantsDirectory ? directories : files);
}

function writeWithRetry(path, source) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      writeFileSync(path, source);
      return true;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  console.warn(`Skipped locked file ${repoPath(path)}: ${lastError.code}`);
  return false;
}

let changedFiles = 0;
let changedLinks = 0;
for (const file of markdown) {
  if (!existsSync(file) || !statSync(file).isFile()) continue;
  const source = readFileSync(file, "utf8");
  const updated = source.replace(
    /\]\((?!https?:|mailto:|#)(<?)([^)>\s]+)(>?)([^)]*)\)/gu,
    (match, open, href, close, tail) => {
      const [pathPart, ...anchorParts] = href.split("#");
      const target = destinationFor(file, pathPart);
      if (!target) return match;
      let next = relative(dirname(file), target).replaceAll("\\", "/");
      if (!next.startsWith(".")) next = `./${next}`;
      const anchor = anchorParts.length > 0 ? `#${anchorParts.join("#")}` : "";
      changedLinks += 1;
      return `](${open}${next}${anchor}${close}${tail})`;
    },
  );
  if (updated === source) continue;
  changedFiles += 1;
  if (!CHECK && !writeWithRetry(file, updated)) changedFiles -= 1;
}

console.log(
  `${CHECK ? "Would repair" : "Repaired"} ${changedLinks} link(s) in ${changedFiles} Markdown file(s).`,
);
if (CHECK && changedLinks > 0) process.exitCode = 1;
