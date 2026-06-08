#!/usr/bin/env node
// scripts/docs/lint-initiative-agent-ready.mjs
//
// CI gate (Initiative 0015, Phase 2 / PR-2.3): every active numbered
// initiative under `docs/90-work/initiatives/` MUST carry an `> **Agent-ready:**`
// line in its quote-block metadata header with one of the three allowed
// values — `yes` / `needs-decision` / `blocked`. This is the agent-dispatch
// classification consumed by `generate-open-work.mjs` to sort and surface
// initiatives in `docs/open-work.md`.
//
// Active = top-level `docs/90-work/initiatives/[0-9]*.md` files. Excluded:
//   - `_`-prefixed files (completed-prefix convention)
//   - anything under `archive/`
//   - sub-series PR plans in directory-form series (not numbered initiatives)
//
// Exit codes (mirrors check-wip-limits.mjs):
//   0 — every active initiative has a valid Agent-ready value
//   1 — at least one initiative is missing it or carries an invalid value
//
// Usage:
//   node scripts/docs/lint-initiative-agent-ready.mjs            # report
//   node scripts/docs/lint-initiative-agent-ready.mjs --json     # JSON

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { extractAgentReady, AGENT_READY_ORDER } from "./generate-open-work.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const INITIATIVES_DIR = resolve(REPO_ROOT, "docs/90-work/initiatives");

const args = new Set(process.argv.slice(2));
const JSON_MODE = args.has("--json");

// Active numbered initiative file: starts with a digit, `.md` extension,
// no leading `_`. Sub-directory series and archive/ are skipped by the
// top-level (non-recursive) scan below.
const RE_ACTIVE_INITIATIVE = /^[0-9][A-Za-z0-9-]*\.md$/;

/** List active numbered initiative files (filenames only), sorted. */
export function listActiveInitiatives(dir = INITIATIVES_DIR) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && RE_ACTIVE_INITIATIVE.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Evaluate each initiative file. Returns
 * `{ file, value, ok }[]` where `value` is the parsed Agent-ready value
 * (or `null`) and `ok` is whether it is one of the allowed values.
 */
export function evaluate(
  files,
  read = (name) => readFileSync(resolve(INITIATIVES_DIR, name), "utf8"),
) {
  return files.map((file) => {
    const value = extractAgentReady(read(file));
    return { file, value, ok: AGENT_READY_ORDER.includes(value) };
  });
}

function main() {
  const files = listActiveInitiatives();
  const rows = evaluate(files);
  const missing = rows.filter((r) => !r.ok);

  if (JSON_MODE) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: missing.length === 0,
          allowed: AGENT_READY_ORDER,
          initiatives: rows,
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(missing.length === 0 ? 0 : 1);
  }

  const lines = [];
  lines.push(
    `Initiative Agent-ready lint — ${rows.length} active initiative${rows.length === 1 ? "" : "s"} (allowed: ${AGENT_READY_ORDER.join(" / ")})`,
  );
  lines.push("");
  for (const row of rows) {
    const mark = row.ok ? "🟢 ok" : "🔴 MISSING";
    lines.push(`  ${mark}  ${row.file.padEnd(48)} ${row.value ?? "(none)"}`);
  }
  lines.push("");

  if (missing.length > 0) {
    lines.push(
      `🔴 FAIL — ${missing.length} initiative${missing.length === 1 ? "" : "s"} missing a valid \`> **Agent-ready:**\` header:`,
    );
    for (const row of missing) {
      lines.push(`   • docs/90-work/initiatives/${row.file}`);
    }
    lines.push(
      "   Add `> **Agent-ready:** yes | needs-decision | blocked` to the header block, then re-run `pnpm docs:gen-open-work`.",
    );
    process.stderr.write(lines.join("\n") + "\n");
    process.exit(1);
  }

  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
}

// Run only when invoked directly, not when imported by tests.
const isMain = process.argv[1] === __filename;
if (isMain) main();
