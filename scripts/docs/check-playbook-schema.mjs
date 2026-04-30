#!/usr/bin/env node
// scripts/docs/check-playbook-schema.mjs
//
// > **Last validated:** 2026-04-30 by @devin-ai. **Next review:** 2026-07-29.
// > **Status:** Active
//
// CI gate that every playbook in `docs/playbooks/` declares its required
// metadata. Without this, playbooks drift into informal recipes — the
// `INDEX.md` generator already requires a `**Trigger:**` line, but freshness
// (`Last validated:`) and lifecycle (`Status:`) are also part of Hard Rule
// #10 (lifecycle markers) and Rule #15 (freshness headers).
//
// Schema:
//   1. H1 line: `# Playbook: <title>`
//   2. Block-quote line: `> **Last validated:** YYYY-MM-DD by @<owner>. **Next review:** YYYY-MM-DD.`
//   3. Block-quote line: `> **Status:** <one of ALLOWED_STATUSES>`
//   4. Trigger line:    `**Trigger:** <text>`
//
// Items 2, 3, 4 must appear before the first `## ` H2 heading. Order between
// (2) and (3) does not matter (some playbooks have them on adjacent lines,
// some don't).
//
// Skipped files (treated as non-playbooks):
//   - docs/playbooks/INDEX.md       (auto-generated lookup)
//   - docs/playbooks/README.md      (overview)
//   - docs/playbooks/_TEMPLATE*.md  (templates start with `_`)
//
// Run:
//   node scripts/docs/check-playbook-schema.mjs        # exit 1 on first violation
//   node scripts/docs/check-playbook-schema.mjs --json # machine-readable output

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const PLAYBOOK_DIR = resolve(REPO_ROOT, "docs", "playbooks");

const ALLOWED_STATUSES = new Set([
  "Active",
  "Draft",
  "Deprecated",
  "Experimental",
]);

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/** Files in docs/playbooks/ that are NOT playbooks and must be skipped. */
export function isSkippableFile(name) {
  if (name === "INDEX.md" || name === "README.md") return true;
  if (name.startsWith("_TEMPLATE")) return true;
  if (name.startsWith("_")) return true; // any leading underscore = scaffold
  return false;
}

/**
 * Validate a single playbook's content. Returns an array of error strings;
 * an empty array means the playbook is well-formed.
 */
export function validatePlaybook(content, opts = {}) {
  const today = opts.today || new Date();
  const errors = [];
  const lines = content.split(/\r?\n/);

  // Find the slice from start-of-file to the first H2. If there is no H2,
  // treat the whole file as the preamble.
  const h2Idx = lines.findIndex((l) => /^## /.test(l));
  const preamble = h2Idx >= 0 ? lines.slice(0, h2Idx) : lines;

  // 1. H1 title
  const h1 = preamble.find((l) => /^# /.test(l));
  if (!h1) {
    errors.push("missing H1 title (`# Playbook: <title>`)");
  } else if (!/^# Playbook: \S/.test(h1)) {
    errors.push(
      `H1 must follow the form '# Playbook: <title>', got '${h1.trim()}'`,
    );
  }

  // 2. Last validated
  const validated = preamble.find((l) => /Last validated:/.test(l));
  if (!validated) {
    errors.push("missing freshness header (`> **Last validated:** …`)");
  } else {
    const m = validated.match(
      /Last validated:\*\*\s+(\d{4}-\d{2}-\d{2})\s+by\s+@([\w-]+)\.\s+\*\*Next review:\*\*\s+(\d{4}-\d{2}-\d{2})/,
    );
    if (!m) {
      errors.push(
        `freshness header malformed; expected '> **Last validated:** YYYY-MM-DD by @owner. **Next review:** YYYY-MM-DD.', got '${validated.trim()}'`,
      );
    } else {
      const [, lastVal, , nextRev] = m;
      const last = Date.parse(lastVal);
      const next = Date.parse(nextRev);
      if (Number.isNaN(last)) {
        errors.push(
          `freshness 'Last validated' is not a valid date: ${lastVal}`,
        );
      }
      if (Number.isNaN(next)) {
        errors.push(`freshness 'Next review' is not a valid date: ${nextRev}`);
      }
      if (!Number.isNaN(last) && !Number.isNaN(next) && next <= last) {
        errors.push(
          `freshness 'Next review' (${nextRev}) must be after 'Last validated' (${lastVal})`,
        );
      }
      if (!Number.isNaN(last) && last > today.getTime()) {
        errors.push(
          `freshness 'Last validated' (${lastVal}) is in the future (today=${today.toISOString().slice(0, 10)})`,
        );
      }
    }
  }

  // 3. Status
  const statusLine = preamble.find((l) => /^>\s*\*\*Status:\*\*/.test(l));
  if (!statusLine) {
    errors.push(
      "missing lifecycle marker (`> **Status:** Active|Draft|Deprecated|Experimental`)",
    );
  } else {
    const m = statusLine.match(/Status:\*\*\s+(\S+)/);
    if (!m) {
      errors.push(`status line malformed: '${statusLine.trim()}'`);
    } else if (!ALLOWED_STATUSES.has(m[1])) {
      errors.push(
        `unknown status '${m[1]}'; allowed: ${[...ALLOWED_STATUSES].join(", ")}`,
      );
    }
  }

  // 4. Trigger
  const triggerLine = preamble.find((l) => /^\*\*Trigger:\*\*/.test(l));
  if (!triggerLine) {
    errors.push(
      "missing `**Trigger:**` line (required by docs/playbooks/INDEX.md generator)",
    );
  } else {
    const body = triggerLine.replace(/^\*\*Trigger:\*\*/, "").trim();
    if (body.length < 10) {
      errors.push(
        `\`**Trigger:**\` is too short (got '${body}', expected at least 10 chars of context)`,
      );
    }
  }

  return errors;
}

/** Walk docs/playbooks/ for .md files that are real playbooks. */
export function collectPlaybooks(dir = PLAYBOOK_DIR) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    if (!name.endsWith(".md")) continue;
    if (isSkippableFile(name)) continue;
    out.push(p);
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = new Set(process.argv.slice(2));
  const jsonMode = args.has("--json");
  const files = collectPlaybooks();

  const results = [];
  let totalErrors = 0;
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const errors = validatePlaybook(content);
    if (errors.length > 0) {
      totalErrors += errors.length;
      results.push({ file: file.replace(REPO_ROOT + "/", ""), errors });
    }
  }

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          ok: totalErrors === 0,
          playbookCount: files.length,
          violations: results,
        },
        null,
        2,
      ),
    );
  } else if (totalErrors === 0) {
    console.log(
      `✅Playbook schema OK — ${files.length} playbook(s) in docs/playbooks/.`,
    );
  } else {
    console.error(
      `❌Playbook schema check failed (${totalErrors} violation(s) across ${results.length} file(s)):\n`,
    );
    for (const { file, errors } of results) {
      console.error(`  ${file}:`);
      for (const e of errors) console.error(`    - ${e}`);
    }
    console.error(
      "\nFix: update the offending playbook(s) so each one has an H1 'Playbook: <title>', a freshness header, a `> **Status:**` line, and a `**Trigger:**` line. See docs/playbooks/_TEMPLATE-decision-tree.md or any well-formed playbook for the exact shape.",
    );
  }

  process.exit(totalErrors === 0 ? 0 : 1);
}

if (basename(process.argv[1] || "") === "check-playbook-schema.mjs") {
  main();
}
