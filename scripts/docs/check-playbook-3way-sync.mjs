#!/usr/bin/env node
// scripts/docs/check-playbook-3way-sync.mjs
//
// Ensures every concrete docs/00-start/playbooks/*.md playbook is visible in both:
//   1. generated INDEX.md (trigger lookup);
//   2. playbook-catalog.md (human/agent routing catalog).

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { collectEntries } from "./generate-playbook-index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_ROOT = resolve(__dirname, "../..");

const DEFAULT_PLAYBOOKS_DIR = resolve(DEFAULT_ROOT, "docs/00-start/playbooks");
const DEFAULT_INDEX_PATH = join(DEFAULT_PLAYBOOKS_DIR, "INDEX.md");
const DEFAULT_CATALOG_PATH = join(DEFAULT_PLAYBOOKS_DIR, "playbook-catalog.md");

const LOCAL_PLAYBOOK_LINK_RE = /\]\(\.\/([^)\s#]+\.md)(?:#[^)]+)?\)/g;

export function extractLocalPlaybookLinks(content) {
  return new Set(
    [...content.matchAll(LOCAL_PLAYBOOK_LINK_RE)].map((match) => match[1]),
  );
}

export function checkPlaybook3WaySync({
  playbooksDir = DEFAULT_PLAYBOOKS_DIR,
  indexPath = DEFAULT_INDEX_PATH,
  catalogPath = DEFAULT_CATALOG_PATH,
} = {}) {
  const files = collectEntries(playbooksDir).map((entry) => entry.file);
  const failures = [];

  if (!existsSync(indexPath)) {
    failures.push(`docs/00-start/playbooks/INDEX.md is missing.`);
  }
  if (!existsSync(catalogPath)) {
    failures.push(`docs/00-start/playbooks/playbook-catalog.md is missing.`);
  }

  const indexLinks = existsSync(indexPath)
    ? extractLocalPlaybookLinks(readFileSync(indexPath, "utf8"))
    : new Set();
  const catalogLinks = existsSync(catalogPath)
    ? extractLocalPlaybookLinks(readFileSync(catalogPath, "utf8"))
    : new Set();

  for (const file of files) {
    if (!indexLinks.has(file)) {
      failures.push(`${file}: missing from docs/00-start/playbooks/INDEX.md.`);
    }
    if (!catalogLinks.has(file)) {
      failures.push(
        `${file}: missing from docs/00-start/playbooks/playbook-catalog.md.`,
      );
    }
  }

  for (const linked of [...catalogLinks].sort()) {
    if (!files.includes(linked)) {
      failures.push(
        `${linked}: linked from playbook-catalog.md but is not a concrete indexed playbook.`,
      );
    }
  }

  return {
    checked: files.length,
    failures,
    ok: failures.length === 0,
  };
}

function main() {
  const report = checkPlaybook3WaySync();

  if (report.ok) {
    console.log(
      `Playbook 3-way sync OK - ${report.checked} playbook(s) in INDEX.md and playbook-catalog.md.`,
    );
    process.exit(0);
  }

  console.error("Playbook 3-way sync check FAILED\n");
  for (const failure of report.failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  main();
}
