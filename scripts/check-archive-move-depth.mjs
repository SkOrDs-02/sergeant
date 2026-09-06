#!/usr/bin/env node
// scripts/check-archive-move-depth.mjs
//
// Historical command name kept for CI compatibility. ADR-0081 retired local
// documentation archive trees: completed snapshots belong in Git history and
// inbound references must use immutable permalinks. This gate prevents a new
// docs/**/archive/** tree from being committed.

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");

function* walkDirectories(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry === "node_modules" || entry === ".git") continue;
    yield full;
    yield* walkDirectories(full);
  }
}

export function scan(root = DEFAULT_ROOT) {
  const docsDir = resolve(root, "docs");
  return [...walkDirectories(docsDir)]
    .filter((dir) => dir.split(sep).at(-1)?.toLowerCase() === "archive")
    .map((dir) => relative(root, dir).split(sep).join("/"))
    .sort();
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = rootArg
    ? resolve(rootArg.slice("--root=".length))
    : DEFAULT_ROOT;
  const archives = scan(root);

  if (archives.length > 0) {
    console.error(
      `[check-archive-move-depth] ${archives.length} local documentation archive tree(s) found:`,
    );
    for (const archive of archives) console.error(`  x ${archive}`);
    console.error(
      "Remove completed snapshots from the checkout and replace inbound references with immutable Git permalinks (ADR-0081).",
    );
    process.exit(1);
  }

  console.log(
    "[check-archive-move-depth] OK - docs contain no local archive trees.",
  );
}
