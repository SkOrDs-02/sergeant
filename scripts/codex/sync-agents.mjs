#!/usr/bin/env node
// scripts/codex/sync-agents.mjs
//
// Generates .codex/agents/*.toml from .claude/agents/*.md.
//
// Both harnesses are equal peers (AGENTS.md § Agent harnesses & routing), but a
// role definition duplicated by hand rots: the Codex copies were hand-trimmed
// summaries that silently dropped evidence discipline, boundaries and report
// formats from their Markdown originals. One source, one generator, one drift
// gate (`--check`, wired into `pnpm lint`).

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const SRC_DIR = resolve(REPO_ROOT, ".claude/agents");
const OUT_DIR = resolve(REPO_ROOT, ".codex/agents");

const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
const READ_ONLY_BANNER =
  "READ-ONLY ROLE — you have no file-writing tools. Diagnose and report; never create, edit or delete files.";

function parseFrontMatter(raw, relPath) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) throw new Error(`${relPath}: missing YAML front matter.`);

  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[kv[1]] = value;
  }

  for (const key of ["name", "description"]) {
    if (!meta[key])
      throw new Error(`${relPath}: front matter is missing "${key}".`);
  }

  return { meta, body: raw.slice(match[0].length).trim() };
}

function tomlBasicString(value) {
  const escaped = value
    .split("\\")
    .join("\\\\")
    .split('"')
    .join('\\"')
    .split("\r")
    .join("\\r")
    .split("\n")
    .join("\\n")
    .split("\t")
    .join("\\t");
  return `"${escaped}"`;
}

function tomlMultilineString(value) {
  // Escape backslashes and any `"""` run; a trailing quote would otherwise fuse
  // with the closing delimiter.
  const escaped = value
    .split("\\")
    .join("\\\\")
    .split('"""')
    .join('\\"\\"\\"')
    .replace(/"$/, '\\"');
  return `"""\n${escaped}"""`;
}

function renderAgent({ meta, body }) {
  const tools = (meta.tools ?? "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
  const readOnly =
    tools.length > 0 && !tools.some((tool) => WRITE_TOOLS.includes(tool));
  const instructions = readOnly ? `${READ_ONLY_BANNER}\n\n${body}` : body;

  return [
    `description = ${tomlBasicString(meta.description)}`,
    `developer_instructions = ${tomlMultilineString(`${instructions}\n`)}`,
    `name = ${tomlBasicString(meta.name)}`,
    "",
  ].join("\n");
}

function build() {
  if (!existsSync(SRC_DIR)) {
    throw new Error(`Source directory not found: ${SRC_DIR}`);
  }

  const expected = new Map();
  for (const file of readdirSync(SRC_DIR).sort()) {
    if (!file.endsWith(".md")) continue;
    const relPath = `.claude/agents/${file}`;
    const parsed = parseFrontMatter(
      readFileSync(resolve(SRC_DIR, file), "utf8"),
      relPath,
    );
    if (parsed.meta.name !== basename(file, ".md")) {
      throw new Error(
        `${relPath}: front-matter name "${parsed.meta.name}" does not match the filename.`,
      );
    }
    expected.set(`${parsed.meta.name}.toml`, renderAgent(parsed));
  }
  return expected;
}

const checkOnly = process.argv.includes("--check");
const expected = build();
const onDisk = existsSync(OUT_DIR)
  ? readdirSync(OUT_DIR).filter((file) => file.endsWith(".toml"))
  : [];

const drift = [];
for (const [file, content] of expected) {
  const abs = resolve(OUT_DIR, file);
  const current = existsSync(abs) ? readFileSync(abs, "utf8") : null;
  if (current === content) continue;
  drift.push(
    `${current === null ? "missing" : "stale"}: .codex/agents/${file}`,
  );
  if (!checkOnly) writeFileSync(abs, content, "utf8");
}
for (const file of onDisk) {
  if (expected.has(file)) continue;
  drift.push(`orphan (no .claude/agents source): .codex/agents/${file}`);
}

if (drift.length === 0) {
  console.log(`Codex agents in sync (${expected.size} agents).`);
  process.exit(0);
}

if (checkOnly) {
  console.error("Codex agent definitions are out of sync with .claude/agents:");
  for (const line of drift) console.error(`  - ${line}`);
  console.error(
    "\nRun `pnpm codex:sync-agents` (orphans must be deleted by hand).",
  );
  process.exit(1);
}

console.log(`Regenerated ${expected.size} Codex agents:`);
for (const line of drift) console.log(`  - ${line}`);
