#!/usr/bin/env node
// scripts/lint-pii-handling-drift.mjs
//
// Guard against drift between the canonical redacted-key list in
// `packages/shared/src/lib/pii.ts` (`REDACT_KEY_NAMES`) and the
// machine-readable mirror in `docs/security/pii-handling.md`
// (between `<!-- pii-keys-start -->` and `<!-- pii-keys-end -->`).
//
// Why: a stale doc list misleads engineers — someone adds a new redacted
// key in shared but the doc shows the old list; another dev re-adds an API
// surface without redaction "because it wasn't in the list yet" (STRIDE:
// Information disclosure). See docs/planning/pr-plan-security-obs-2026-05.md S10.
//
// Modes:
//   default → exit 1 on drift (used by `pnpm lint:pii-handling-drift`).
//   --json  → emit machine-readable JSON instead of human output.
//
// The comparison is set-based (order-independent, case-sensitive — the
// source list is the canonical casing).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

export const SOURCE_PATH = "packages/shared/src/lib/pii.ts";
export const DOC_PATH = "docs/security/pii-handling.md";
export const DOC_START = "<!-- pii-keys-start -->";
export const DOC_END = "<!-- pii-keys-end -->";

/**
 * Extract the `REDACT_KEY_NAMES` string-array literal from pii.ts source.
 * @param {string} source
 * @returns {string[]}
 */
export function extractSourceKeys(source) {
  const match = source.match(
    /REDACT_KEY_NAMES:\s*readonly\s+string\[\]\s*=\s*\[([\s\S]*?)\];/,
  );
  if (!match) {
    throw new Error(
      `Could not locate REDACT_KEY_NAMES array literal in ${SOURCE_PATH}.`,
    );
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Extract the backtick-wrapped key tokens from the machine-readable block in
 * pii-handling.md (between DOC_START and DOC_END markers).
 * @param {string} doc
 * @returns {string[]}
 */
export function extractDocKeys(doc) {
  const start = doc.indexOf(DOC_START);
  const end = doc.indexOf(DOC_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `Could not locate the ${DOC_START} … ${DOC_END} block in ${DOC_PATH}.`,
    );
  }
  // Strip nested HTML comments (e.g. the AUTO-CHECKED note) so their
  // backtick-wrapped references (`REDACT_KEY_NAMES`, file paths) are not
  // mistaken for key tokens.
  const block = doc
    .slice(start + DOC_START.length, end)
    .replace(/<!--[\s\S]*?-->/g, "");
  return [...block.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

/**
 * Compare the source list against the doc list (set-based).
 * @param {string[]} sourceKeys
 * @param {string[]} docKeys
 * @returns {{ ok: boolean, missingInDoc: string[], extraInDoc: string[] }}
 */
export function diffKeys(sourceKeys, docKeys) {
  const sourceSet = new Set(sourceKeys);
  const docSet = new Set(docKeys);
  const missingInDoc = sourceKeys.filter((k) => !docSet.has(k));
  const extraInDoc = docKeys.filter((k) => !sourceSet.has(k));
  return {
    ok: missingInDoc.length === 0 && extraInDoc.length === 0,
    missingInDoc: [...new Set(missingInDoc)],
    extraInDoc: [...new Set(extraInDoc)],
  };
}

function main() {
  const json = process.argv.includes("--json");
  const source = readFileSync(resolve(REPO_ROOT, SOURCE_PATH), "utf8");
  const doc = readFileSync(resolve(REPO_ROOT, DOC_PATH), "utf8");

  const sourceKeys = extractSourceKeys(source);
  const docKeys = extractDocKeys(doc);
  const result = diffKeys(sourceKeys, docKeys);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (result.ok) {
    console.log(
      `[lint:pii-handling-drift] OK — ${sourceKeys.length} redacted key(s) in ${SOURCE_PATH} match ${DOC_PATH}.`,
    );
    process.exit(0);
  }

  console.error(
    `[lint:pii-handling-drift] DRIFT between ${SOURCE_PATH} and ${DOC_PATH}:`,
  );
  if (result.missingInDoc.length > 0) {
    console.error(
      `  • In source but missing from doc: ${result.missingInDoc.join(", ")}`,
    );
  }
  if (result.extraInDoc.length > 0) {
    console.error(
      `  • In doc but not in source: ${result.extraInDoc.join(", ")}`,
    );
  }
  console.error(
    `\nUpdate the ${DOC_START} … ${DOC_END} block in ${DOC_PATH} to mirror REDACT_KEY_NAMES.`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
