#!/usr/bin/env node
// Codemod: remove `.js` / `.jsx` extensions from relative and path-aliased
// imports inside `.ts` / `.tsx` files under `apps/web/src`. External
// package imports (e.g. `@zxing/browser/esm/.../foo.js`) are intentionally
// preserved — only first-party paths are rewritten.
//
// Usage:
//   node scripts/strip-js-extensions.mjs            # dry run summary
//   node scripts/strip-js-extensions.mjs --write    # apply in-place

import { readFileSync, writeFileSync } from "node:fs";
import { argv } from "node:process";
import { execSync } from "node:child_process";

const WRITE = argv.includes("--write");
const ROOT = new URL("../apps/web/src/", import.meta.url).pathname;

// Path prefixes considered "first-party" — safe to strip extensions from.
// Anything else (bare specifiers, `@zxing/...`, `@tanstack/...`, etc.) is
// left untouched so external package subpath imports keep working.
const FIRST_PARTY = [
  ".",
  "@shared/",
  "@finyk/",
  "@fizruk/",
  "@routine/",
  "@nutrition/",
  "@sergeant/",
];

const isFirstParty = (spec) => FIRST_PARTY.some((p) => spec.startsWith(p));

// One pattern per syntactic position to keep the rewriter readable.
const PATTERNS = [
  // `from "X.js"` / `from 'X.js'` (covers `import ... from`, `export ... from`)
  /\bfrom\s+(["'])([^"']+?)\.(jsx?)(\1)/g,
  // Side-effect import: `import "X.js"`
  /\bimport\s+(["'])([^"']+?)\.(jsx?)(\1)/g,
  // Dynamic import: `import("X.js")` (allow whitespace inside parens)
  /\bimport\s*\(\s*(["'])([^"']+?)\.(jsx?)(\1)\s*\)/g,
];

function rewrite(source) {
  let count = 0;
  let next = source;
  for (const pattern of PATTERNS) {
    next = next.replace(pattern, (match, q1, spec, _ext, q2) => {
      if (!isFirstParty(spec)) return match;
      count += 1;
      // Reconstruct with the original surrounding tokens.
      if (match.startsWith("import") && match.includes("(")) {
        return `import(${q1}${spec}${q2})`;
      }
      const keyword = match.startsWith("from") ? "from" : "import";
      return `${keyword} ${q1}${spec}${q2}`;
    });
  }
  return { source: next, count };
}

function listFiles() {
  const out = execSync(
    `find "${ROOT}" -type f \\( -name '*.ts' -o -name '*.tsx' \\)`,
    { encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

const files = listFiles();
let totalFiles = 0;
let totalReplacements = 0;

for (const file of files) {
  const before = readFileSync(file, "utf8");
  const { source: after, count } = rewrite(before);
  if (count === 0) continue;
  totalFiles += 1;
  totalReplacements += count;
  if (WRITE) {
    writeFileSync(file, after);
  }
}

console.log(
  `${WRITE ? "rewrote" : "would rewrite"} ${totalReplacements} import(s) across ${totalFiles} file(s)`,
);
