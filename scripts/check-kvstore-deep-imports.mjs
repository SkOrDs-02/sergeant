#!/usr/bin/env node
// scripts/check-kvstore-deep-imports.mjs
//
// Guard against app code importing kvStore implementation files directly.
// The historical storage codemods are one-time tools; this CI gate keeps the
// app layer on the supported adapters instead of drifting back to deep paths.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");

const SOURCE_EXT_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const IMPORT_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const FORBIDDEN_SPECIFIER_RE =
  /(?:^|\/)(?:kvStore|kv-store)(?:\.(?:[cm]?[jt]sx?)?|\/|$)/;

const SCAN_DIRS = ["apps"];
const ALLOWLIST = new Set(
  [
    "apps/web/src/core/db/kvStoreBoot.ts",
    "apps/web/src/core/db/__tests__/kvStoreBoot.test.ts",
    "apps/web/src/shared/lib/storage/storage.ts",
    "apps/mobile/src/core/db/kvStoreBoot.ts",
    "apps/mobile/src/lib/storage.ts",
  ].map((p) => p.split("/").join(sep)),
);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry.startsWith("."))
        continue;
      yield* walk(full);
    } else if (st.isFile() && SOURCE_EXT_RE.test(full)) {
      yield full;
    }
  }
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function findKvStoreDeepImports(source) {
  const stripped = stripComments(source);
  const hits = [];
  for (const match of stripped.matchAll(IMPORT_RE)) {
    const specifier = match[1] ?? match[2];
    if (!specifier || !FORBIDDEN_SPECIFIER_RE.test(specifier)) continue;
    const before = stripped.slice(0, match.index ?? 0);
    const line = before.split("\n").length;
    hits.push({ line, specifier });
  }
  return hits;
}

export function scan(root = DEFAULT_ROOT) {
  const failures = [];
  for (const dir of SCAN_DIRS) {
    const absDir = resolve(root, dir);
    for (const file of walk(absDir)) {
      const rel = relative(root, file);
      if (ALLOWLIST.has(rel)) continue;
      const hits = findKvStoreDeepImports(readFileSync(file, "utf8"));
      for (const hit of hits) {
        failures.push({
          file: rel.split(sep).join("/"),
          line: hit.line,
          specifier: hit.specifier,
        });
      }
    }
  }
  return failures;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = rootArg
    ? resolve(rootArg.slice("--root=".length))
    : DEFAULT_ROOT;
  const failures = scan(root);

  if (failures.length > 0) {
    console.error(
      `[check-kvstore-deep-imports] ${failures.length} forbidden kvStore deep import(s):`,
    );
    for (const f of failures) {
      console.error(`  x ${f.file}:${f.line} imports "${f.specifier}"`);
    }
    console.error(
      "\nUse the storage adapters / bootstrap modules instead of importing kvStore implementation paths directly.",
    );
    process.exit(1);
  }

  console.log("[check-kvstore-deep-imports] OK - no forbidden app imports.");
}
