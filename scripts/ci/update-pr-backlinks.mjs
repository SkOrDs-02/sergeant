#!/usr/bin/env node
// scripts/ci/update-pr-backlinks.mjs
//
// Update `docs/pr-ledger/index.json` and the in-doc PR-BACKLINKS block
// at the end of each canonical doc (ADR / initiative / playbook /
// hard-rule). Driven by the `.github/workflows/pr-backlinks.yml`
// GitHub Action on every merged PR; can also run locally via
// `--pr <NUMBER>` for backfill or `--rebuild-blocks` for block
// regeneration after a manual ledger edit.
//
// Modes:
//   --pr <NUMBER>           — fetch PR metadata via `gh pr view`, upsert
//                             into the ledger, and regenerate blocks in
//                             every touched canonical doc that still
//                             exists. Requires the `gh` CLI on PATH.
//   --rebuild-blocks        — re-render every in-doc block from the
//                             current ledger (no GitHub access needed).
//                             Useful after a ledger edit or schema bump.
//   --check                 — same as `--rebuild-blocks` but writes
//                             nothing; exits 1 on any difference between
//                             the on-disk blocks and the freshly-rendered
//                             ones, or any ledger schema violation.
//
// Phase 5 of Initiative 0014. See ADR-0061 for the storage strategy.

import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const LEDGER_PATH = resolve(REPO_ROOT, "docs/pr-ledger/index.json");
const SCHEMA_VERSION = 1;
const TOP_N_IN_DOC = 5;

const BLOCK_START = "<!-- AUTO-GENERATED: PR-BACKLINKS-START -->";
const BLOCK_END = "<!-- AUTO-GENERATED: PR-BACKLINKS-END -->";

// Marker detection regexes anchor to line boundaries so the literal
// strings can safely appear inside backticks, code fences, or prose
// (e.g. inside ADR-0061 itself, which documents the format). Only a
// marker that sits on its own line — optionally indented — counts.
const RE_BLOCK_START =
  /^[ \t]*<!-- AUTO-GENERATED: PR-BACKLINKS-START -->[ \t]*$/m;
const RE_BLOCK_END = /^[ \t]*<!-- AUTO-GENERATED: PR-BACKLINKS-END -->[ \t]*$/m;

const GITHUB_PR_BASE = "https://github.com/Skords-01/Sergeant/pull";

// ── Canonical doc whitelist ─────────────────────────────────────────────────

/**
 * Path patterns that should receive in-doc PR-backlink blocks. Each entry
 * is { rootDir, recursive, excludes? }. Files matching `excludes`
 * (filename match against basename) are skipped.
 */
const CANONICAL_DOC_ROOTS = [
  {
    rootDir: "docs/adr",
    recursive: false,
    excludes: ["TEMPLATE.md", "README.md"],
  },
  {
    rootDir: "docs/90-work/initiatives",
    recursive: false,
    excludes: ["README.md", "follow-ups.md"],
  },
  {
    rootDir: "docs/00-start/playbooks",
    recursive: false,
    excludes: ["README.md", "INDEX.md"],
    excludePrefix: "_",
  },
  {
    rootDir: "docs/governance/rules",
    recursive: false,
    excludes: ["README.md"],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function relPath(abs) {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function readSafe(abs) {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

function readJSON(abs) {
  try {
    return JSON.parse(readSafe(abs));
  } catch {
    return null;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function listCanonicalDocs() {
  const out = [];
  for (const cfg of CANONICAL_DOC_ROOTS) {
    const rootAbs = resolve(REPO_ROOT, cfg.rootDir);
    let entries;
    try {
      entries = readdirSync(rootAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) {
        if (!cfg.recursive) continue;
        if (ent.name === "archive") continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.endsWith(".md")) continue;
      if (cfg.excludes?.includes(ent.name)) continue;
      if (cfg.excludePrefix && ent.name.startsWith(cfg.excludePrefix)) continue;
      out.push(join(rootAbs, ent.name));
    }
  }
  return out.sort();
}

function isCanonicalDocPath(repoRelPath) {
  for (const cfg of CANONICAL_DOC_ROOTS) {
    const prefix = cfg.rootDir.endsWith("/") ? cfg.rootDir : cfg.rootDir + "/";
    if (!repoRelPath.startsWith(prefix)) continue;
    const remainder = repoRelPath.slice(prefix.length);
    if (remainder.includes("/")) continue; // sub-directories not allowed
    const base = remainder;
    if (cfg.excludes?.includes(base)) continue;
    if (cfg.excludePrefix && base.startsWith(cfg.excludePrefix)) continue;
    if (!base.endsWith(".md")) continue;
    return true;
  }
  return false;
}

// ── Ledger I/O + minimal schema validation ──────────────────────────────────

function loadLedger() {
  const data = readJSON(LEDGER_PATH);
  if (!data) {
    return {
      $schema: "../governance/schemas/pr-ledger.schema.json",
      version: SCHEMA_VERSION,
      generated_at: todayISO(),
      prs: [],
    };
  }
  return data;
}

function validateLedger(ledger) {
  const errors = [];
  if (ledger.version !== SCHEMA_VERSION)
    errors.push(`version: expected ${SCHEMA_VERSION}, got ${ledger.version}`);
  if (typeof ledger.generated_at !== "string")
    errors.push(`generated_at: not a string`);
  if (!Array.isArray(ledger.prs)) {
    errors.push(`prs: not an array`);
    return errors;
  }
  const seen = new Set();
  for (const pr of ledger.prs) {
    if (typeof pr.number !== "number" || pr.number < 1)
      errors.push(`pr ${JSON.stringify(pr.number)}: invalid number`);
    if (seen.has(pr.number)) errors.push(`pr #${pr.number}: duplicate entry`);
    seen.add(pr.number);
    if (!pr.title) errors.push(`pr #${pr.number}: missing title`);
    if (!pr.merged_at) errors.push(`pr #${pr.number}: missing merged_at`);
    if (!pr.author) errors.push(`pr #${pr.number}: missing author`);
    if (!Array.isArray(pr.touchedDocs) || pr.touchedDocs.length === 0)
      errors.push(`pr #${pr.number}: empty touchedDocs`);
  }
  return errors;
}

function writeLedger(ledger) {
  const dir = dirname(LEDGER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

// ── In-doc block rendering ──────────────────────────────────────────────────

/**
 * Render the PR-BACKLINKS block for `docRelPath`, or return `null` when
 * the ledger has no PRs touching this doc. Returning `null` keeps the
 * `applyBlock` caller from synthesizing empty placeholders inside every
 * canonical doc — blocks appear only after a PR actually touches the
 * file, matching the «no PR-noise until merge» principle.
 */
function renderBlock(docRelPath, ledger) {
  const entries = ledger.prs
    .filter((pr) => pr.touchedDocs.includes(docRelPath))
    .sort((a, b) => (b.merged_at || "").localeCompare(a.merged_at || ""))
    .slice(0, TOP_N_IN_DOC);

  if (entries.length === 0) return null;

  const rows = entries
    .map((pr) => {
      const dateOnly = pr.merged_at.slice(0, 10);
      const title = pr.title.replace(/\|/g, "\\|");
      return `| [#${pr.number}](${GITHUB_PR_BASE}/${pr.number}) | ${title} | ${dateOnly} |`;
    })
    .join("\n");

  return [
    BLOCK_START,
    "## Recent PRs",
    "",
    "| PR | Title | Merged |",
    "| --- | --- | --- |",
    rows,
    "",
    `_Auto-derived from \`docs/pr-ledger/index.json\`. Top ${entries.length} most recent PRs touching this file._`,
    BLOCK_END,
  ].join("\n");
}

/**
 * Replace, append, or remove the PR-BACKLINKS block in `docContent`.
 * Idempotent. Returns the new content.
 *
 *   blockText == null and no existing block → no change.
 *   blockText != null and no existing block → append block.
 *   blockText != null and existing block    → replace block.
 *   blockText == null and existing block    → remove block (ledger was
 *     edited to drop the only entries that touched this doc; we leave
 *     the doc clean rather than leaving an orphan block).
 */
export function applyBlock(docContent, blockText) {
  const startMatch = RE_BLOCK_START.exec(docContent);
  // Search for the end marker strictly AFTER the start marker so that
  // back-to-back blocks can't fool the detection.
  let endMatch = null;
  if (startMatch) {
    const after = docContent.slice(startMatch.index + startMatch[0].length);
    const m = RE_BLOCK_END.exec(after);
    if (m) {
      endMatch = {
        index: startMatch.index + startMatch[0].length + m.index,
        length: m[0].length,
      };
    }
  }
  const startIdx = startMatch ? startMatch.index : -1;
  const endIdx = endMatch ? endMatch.index : -1;
  const endMarkerLen = endMatch ? endMatch.length : BLOCK_END.length;
  const hasExistingBlock = startIdx >= 0 && endIdx > startIdx;

  if (!hasExistingBlock && blockText == null) {
    return docContent;
  }

  if (hasExistingBlock && blockText == null) {
    const before = docContent.slice(0, startIdx).replace(/\s+$/, "");
    const after = docContent.slice(endIdx + endMarkerLen).replace(/^\s+/, "");
    return before + (after ? "\n\n" + after : "\n");
  }

  if (hasExistingBlock) {
    const before = docContent.slice(0, startIdx).replace(/\s+$/, "");
    const after = docContent.slice(endIdx + endMarkerLen).replace(/^\s+/, "");
    const tail = after ? "\n\n" + after : "\n";
    return before + "\n\n" + blockText + tail;
  }

  // No block yet — append. Ensure exactly one trailing newline before block.
  const trimmed = docContent.replace(/\s+$/, "");
  return trimmed + "\n\n" + blockText + "\n";
}

// ── Block regen (for --rebuild-blocks and --check) ──────────────────────────

/**
 * Format `content` with the repo Prettier config so the generated block is
 * byte-identical to what the Husky `prettier --write` pre-commit hook produces
 * for `*.md`. Without this, the generator emitted compact GFM tables
 * (`| PR |`) while Prettier reflows them to column-padded tables — any commit
 * touching a backlinked doc would then re-pad the table and break
 * `docs:check-pr-ledger`. Formatting here makes the generator output and the
 * hook output agree (padded). Lazy-import keeps unit tests node_modules-free.
 */
async function formatMarkdown(content, filepath) {
  const { default: prettier } = await import("prettier");
  const opts = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(content, { ...opts, parser: "markdown", filepath });
}

async function rebuildAllBlocks(ledger, { write = true } = {}) {
  const docs = listCanonicalDocs();
  const diffs = [];
  for (const docAbs of docs) {
    const docRel = relPath(docAbs);
    const current = readSafe(docAbs);
    const block = renderBlock(docRel, ledger);
    let next = applyBlock(current, block);
    // Normalise through Prettier so the on-disk result matches the pre-commit
    // hook exactly (padded tables); only when a block is present/changed.
    if (next !== current) next = await formatMarkdown(next, docAbs);
    if (current === next) continue;
    diffs.push({ path: docRel, current, next });
    if (write) writeFileSync(docAbs, next);
  }
  return diffs;
}

// ── PR fetcher (uses `gh` CLI) ──────────────────────────────────────────────

function ghJSON(args) {
  const out = execFileSync("gh", args, { encoding: "utf8", maxBuffer: 8e6 });
  return JSON.parse(out);
}

function fetchPRMetadata(prNumber) {
  // `gh pr view --json` fields documented at
  // https://cli.github.com/manual/gh_pr_view
  const data = ghJSON([
    "pr",
    "view",
    String(prNumber),
    "--json",
    "number,title,mergedAt,author,files",
  ]);
  if (!data.mergedAt) {
    throw new Error(`PR #${prNumber} is not merged (mergedAt is null).`);
  }
  const touchedDocs = (data.files || [])
    .map((f) => f.path)
    .filter((p) => isCanonicalDocPath(p))
    .sort();
  return {
    number: data.number,
    title: data.title,
    merged_at: data.mergedAt,
    author: `@${data.author?.login || "unknown"}`,
    touchedDocs,
  };
}

// ── Ledger upsert ───────────────────────────────────────────────────────────

function upsertPR(ledger, entry) {
  if (entry.touchedDocs.length === 0) return false;
  const idx = ledger.prs.findIndex((p) => p.number === entry.number);
  if (idx >= 0) {
    // Replace existing entry verbatim (fields may change after merge —
    // for example, follow-up amend changes title).
    if (JSON.stringify(ledger.prs[idx]) === JSON.stringify(entry)) {
      return false;
    }
    ledger.prs[idx] = entry;
  } else {
    ledger.prs.push(entry);
  }
  // Sort by merged_at descending so the newest PR is at index 0.
  ledger.prs.sort((a, b) =>
    (b.merged_at || "").localeCompare(a.merged_at || ""),
  );
  ledger.generated_at = todayISO();
  return true;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { mode: null, prNumber: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") out.mode = "check";
    else if (a === "--rebuild-blocks") out.mode = "rebuild-blocks";
    else if (a === "--pr") {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--pr requires a positive integer (got ${v})`);
      }
      out.mode = "pr";
      out.prNumber = n;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) {
    console.error(
      "Usage:\n  --pr <NUMBER>      fetch metadata and update ledger + blocks\n  --rebuild-blocks   regenerate in-doc blocks from current ledger\n  --check            verify ledger ↔ blocks ↔ schema (CI gate)",
    );
    process.exit(2);
  }

  const ledger = loadLedger();

  if (args.mode === "check") {
    const schemaErrors = validateLedger(ledger);
    if (schemaErrors.length > 0) {
      console.error(
        `pr-ledger: ${schemaErrors.length} schema violation${schemaErrors.length === 1 ? "" : "s"}:`,
      );
      for (const err of schemaErrors.slice(0, 20)) console.error(`  - ${err}`);
      process.exit(1);
    }
    const diffs = await rebuildAllBlocks(ledger, { write: false });
    if (diffs.length > 0) {
      console.error(
        `pr-ledger: ${diffs.length} doc${diffs.length === 1 ? "" : "s"} have stale PR-BACKLINKS block${diffs.length === 1 ? "" : "s"}. Run \`pnpm docs:gen-pr-backlinks\` and commit.`,
      );
      for (const d of diffs.slice(0, 10)) console.error(`  - ${d.path}`);
      process.exit(1);
    }
    console.log(
      `pr-ledger: up to date (${ledger.prs.length} PR${ledger.prs.length === 1 ? "" : "s"} indexed, all blocks in sync).`,
    );
    return;
  }

  if (args.mode === "rebuild-blocks") {
    const schemaErrors = validateLedger(ledger);
    if (schemaErrors.length > 0) {
      console.error("pr-ledger: schema violations — refusing to write.");
      for (const err of schemaErrors) console.error(`  - ${err}`);
      process.exit(1);
    }
    const diffs = await rebuildAllBlocks(ledger, { write: true });
    console.log(
      `pr-ledger: ${diffs.length === 0 ? "no blocks needed updating" : `updated ${diffs.length} block${diffs.length === 1 ? "" : "s"}`}.`,
    );
    return;
  }

  if (args.mode === "pr") {
    const entry = fetchPRMetadata(args.prNumber);
    if (entry.touchedDocs.length === 0) {
      console.log(
        `PR #${entry.number} did not touch any canonical doc — ledger unchanged.`,
      );
      return;
    }
    const changed = upsertPR(ledger, entry);
    if (!changed) {
      console.log(
        `PR #${entry.number} already in ledger with same metadata — ledger unchanged.`,
      );
    } else {
      writeLedger(ledger);
      console.log(
        `PR #${entry.number}: upserted with ${entry.touchedDocs.length} touched doc${entry.touchedDocs.length === 1 ? "" : "s"}.`,
      );
    }
    const diffs = await rebuildAllBlocks(ledger, { write: true });
    console.log(
      `Blocks: ${diffs.length === 0 ? "no updates needed" : `regenerated ${diffs.length}`}.`,
    );
    return;
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    await main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
