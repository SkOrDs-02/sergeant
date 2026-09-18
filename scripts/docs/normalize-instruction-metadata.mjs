#!/usr/bin/env node

/** Add the runtime-specific classification required by the instruction library. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIRECTORY = resolve(ROOT, "docs/start/instructions");
const RUNTIME_FILES = new Set([
  "billing-payments-launch.md",
  "database-backup-restore.md",
  "database-connection-pooling.md",
  "db-index-audit-template.md",
  "encryption-key-rotation.md",
  "operations-runbook.md",
  "postgres-read-replica.md",
  "security-events.md",
  "sync-client-e2e.md",
]);
const SKIP = new Set(["README.md", "INDEX.md", "playbook-catalog.md"]);

let changed = 0;
for (const name of readdirSync(DIRECTORY)) {
  if (!name.endsWith(".md") || name.startsWith("_") || SKIP.has(name)) continue;
  const path = resolve(DIRECTORY, name);
  const source = readFileSync(path, "utf8");
  if (/^> \*\*Runtime-specific:\*\* (yes|no)$/mu.test(source)) continue;
  const value = RUNTIME_FILES.has(name) ? "yes" : "no";
  const updated = source.replace(
    /(^> \*\*Status:\*\*[^\r\n]*(?:\r?\n))/mu,
    `$1> **Runtime-specific:** ${value}\n`,
  );
  if (updated === source) {
    throw new Error(`${name}: missing Status metadata anchor`);
  }
  writeFileSync(path, updated);
  changed += 1;
}

console.log(`Normalized runtime metadata in ${changed} instruction(s).`);
