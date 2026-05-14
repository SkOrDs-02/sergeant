#!/usr/bin/env node
// scripts/check-archive-move-depth.mjs
//
// Archive docs move one directory deeper. Links that were correct as
// `../initiatives/foo.md` from `docs/audits/foo.md` often need to become
// `../../initiatives/foo.md` after moving to `docs/audits/archive/foo.md`.
// This gate spots that exact depth drift and suggests the one-level fix.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");
const DOCS_DIR = "docs";

const LINK_RE = /!?\[[^\]]*?\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const ARCHIVE_SEGMENT_RE = /(?:^|\/)archive(?:\/|$)/;

function* walkMarkdown(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".git") continue;
      yield* walkMarkdown(full);
    } else if (st.isFile() && extname(full) === ".md") {
      yield full;
    }
  }
}

function stripCodeFences(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, "");
}

function isRelativeDocLink(target) {
  return (
    target.startsWith("../") &&
    !target.startsWith("http://") &&
    !target.startsWith("https://") &&
    !target.startsWith("mailto:") &&
    !target.startsWith("#")
  );
}

function withoutAnchor(target) {
  return target.split("#")[0].split("?")[0];
}

export function findArchiveDepthProblems(file, markdown, root = DEFAULT_ROOT) {
  const problems = [];
  const sourceDir = dirname(file);
  const stripped = stripCodeFences(markdown);
  for (const match of stripped.matchAll(LINK_RE)) {
    const target = match[1];
    if (!target || !isRelativeDocLink(target)) continue;
    const clean = withoutAnchor(decodeURI(target));
    const current = resolve(sourceDir, clean);
    if (existsSync(current)) continue;
    const suggestedAbs = resolve(sourceDir, "..", clean);
    if (!existsSync(suggestedAbs)) continue;
    const before = stripped.slice(0, match.index ?? 0);
    const line = before.split("\n").length;
    const suggested = relative(sourceDir, suggestedAbs).split(sep).join("/");
    problems.push({
      file: relative(root, file).split(sep).join("/"),
      line,
      target,
      suggested,
    });
  }
  return problems;
}

export function scan(root = DEFAULT_ROOT) {
  const docsDir = resolve(root, DOCS_DIR);
  const problems = [];
  for (const file of walkMarkdown(docsDir)) {
    const rel = relative(root, file).split(sep).join("/");
    if (!ARCHIVE_SEGMENT_RE.test(rel)) continue;
    problems.push(
      ...findArchiveDepthProblems(file, readFileSync(file, "utf8"), root),
    );
  }
  return problems;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = rootArg
    ? resolve(rootArg.slice("--root=".length))
    : DEFAULT_ROOT;
  const problems = scan(root);

  if (problems.length > 0) {
    console.error(
      `[check-archive-move-depth] ${problems.length} likely archive link depth problem(s):`,
    );
    for (const p of problems) {
      console.error(
        `  x ${p.file}:${p.line} "${p.target}" should likely be "${p.suggested}"`,
      );
    }
    process.exit(1);
  }

  console.log(
    "[check-archive-move-depth] OK - archive links keep their depth.",
  );
}
