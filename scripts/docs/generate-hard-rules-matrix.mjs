#!/usr/bin/env node
// scripts/docs/generate-hard-rules-matrix.mjs
//
// Read the canonical Hard Rules registry at `docs/governance/hard-rules.json`
// and emit `docs/governance/hard-rules-matrix.md` — a machine-readable index
// that maps every rule to its scope and the mechanism that enforces it.
//
// The canonical registry shape is defined in `hard-rules.schema.json` and
// validated structurally by `pnpm lint:hard-rules-registry`. The full prose
// (rationale, examples, anti-patterns) lives in `AGENTS.md § Hard rules` —
// that file is the human contract; this matrix is the machine cross-reference
// answering "which CI job / ESLint rule / test enforces rule N?" in one grep.
//
// Usage:
//   node scripts/docs/generate-hard-rules-matrix.mjs            # write matrix
//   node scripts/docs/generate-hard-rules-matrix.mjs --check    # CI: fail on diff
//   node scripts/docs/generate-hard-rules-matrix.mjs --list     # plain-text list
//
// Exits 1 on `--check` diff or invalid registry.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const REGISTRY_PATH = resolve(REPO_ROOT, "docs/governance/hard-rules.json");
const MATRIX_PATH = resolve(REPO_ROOT, "docs/governance/hard-rules-matrix.md");

// ── Registry loading + validation ────────────────────────────────────────────

/**
 * Load and minimally validate the registry. Mirrors the JSON-Schema invariants
 * the generator depends on; the full schema lives in `hard-rules.schema.json`.
 * Throws on any structural problem so a malformed edit fails before `--check`.
 */
export function loadRegistry(rawJson) {
  const parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
  if (!parsed || typeof parsed !== "object")
    throw new Error("registry: expected an object");
  if (!Array.isArray(parsed.rules))
    throw new Error("registry: `rules` must be an array");
  if (parsed.rules.length === 0)
    throw new Error("registry: at least one rule is required");

  const seen = new Set();
  for (const r of parsed.rules) {
    if (!Number.isInteger(r.id) || r.id < 1)
      throw new Error(
        `registry: every rule needs an integer id ≥ 1 (got ${JSON.stringify(r.id)})`,
      );
    if (seen.has(r.id)) throw new Error(`registry: duplicate rule id ${r.id}`);
    seen.add(r.id);
    if (!r.title || typeof r.title !== "string")
      throw new Error(`registry: rule ${r.id} is missing a non-empty title`);
    if (!Array.isArray(r.scope) || r.scope.length === 0)
      throw new Error(`registry: rule ${r.id} needs a non-empty scope[]`);
    if (!r.severity || typeof r.severity !== "string")
      throw new Error(`registry: rule ${r.id} is missing severity`);
    if (
      typeof r.category !== "string" ||
      ![
        "blocker-invariant",
        "lint-enforced-convention",
        "active-initiative",
      ].includes(r.category)
    )
      throw new Error(
        `registry: rule ${r.id} is missing a valid category (one of blocker-invariant | lint-enforced-convention | active-initiative)`,
      );
    if (!Array.isArray(r.enforced_by) || r.enforced_by.length === 0)
      throw new Error(
        `registry: rule ${r.id} needs at least one enforced_by entry`,
      );
    for (const e of r.enforced_by) {
      if (!e.kind || !e.ref)
        throw new Error(
          `registry: rule ${r.id} has an enforced_by entry missing kind/ref`,
        );
    }
  }
  return parsed;
}

// ── Markdown rendering ───────────────────────────────────────────────────────

const SEVERITY_BADGE = {
  blocker: "🛑 blocker",
  warning: "⚠ warning",
};

const CATEGORY_LABEL = {
  "blocker-invariant": "blocker-invariant",
  "lint-enforced-convention": "lint-enforced-convention",
  "active-initiative": "active-initiative",
};

const KIND_LABEL = {
  ci: "CI",
  "eslint-rule": "ESLint",
  test: "Test",
  hook: "Git hook",
  "branch-protection": "Branch protection",
  codeowners: "CODEOWNERS",
  doc: "Doc",
  convention: "Convention",
  "pr-template": "PR template",
};

function escapePipes(s) {
  return String(s).replace(/\|/g, "\\|");
}

function formatRef(kind, ref) {
  // CI commands and ESLint rule names come through verbatim in backticks; the
  // remaining kinds are mostly free-form prose so escape pipes only.
  if (kind === "ci" || kind === "eslint-rule" || kind === "hook") {
    return `\`${ref}\``;
  }
  return ref;
}

function describeEnforcement(item) {
  const label = KIND_LABEL[item.kind] ?? item.kind;
  return `**${label}** ${formatRef(item.kind, item.ref)}`;
}

function renderEnforcement(rule) {
  return rule.enforced_by
    .map(describeEnforcement)
    .map(escapePipes)
    .join("<br>");
}

function renderScope(rule) {
  return rule.scope
    .map((p) => `\`${p}\``)
    .map(escapePipes)
    .join("<br>");
}

function renderLinks(rule) {
  const items = rule.links ?? [];
  if (items.length === 0) return "—";
  return items
    .map((l) => {
      switch (l.type) {
        case "issue":
        case "pr": {
          const num = l.ref.replace(/^#/, "");
          return `[${l.ref}](https://github.com/Skords-01/Sergeant/issues/${num})`;
        }
        case "agents":
          return `[AGENTS ${l.ref}](../../AGENTS.md#hard-rules-do-not-break)`;
        case "doc":
          return `[\`${l.ref}\`](../../${l.ref})`;
        case "external":
          return `[${l.ref.replace(/^https?:\/\/(www\.)?/, "")}](${l.ref})`;
        default:
          return l.ref;
      }
    })
    .map(escapePipes)
    .join("<br>");
}

/**
 * Slugify a rule heading the way GitHub does, so anchors back into AGENTS.md
 * resolve. AGENTS.md headings look like `### N. <title>` so the slug is
 * `n-<kebabified-title>`.
 */
export function anchorFromTitle(id, title) {
  const slug = title
    .toLowerCase()
    .replace(/[`*'"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${id}-${slug}`;
}

/**
 * Format a markdown string with the repo's Prettier config so the on-disk
 * file matches `pnpm format:check`. Exported for tests.
 */
export async function formatMarkdown(
  content,
  { configPath = MATRIX_PATH } = {},
) {
  const opts = (await prettier.resolveConfig(configPath)) ?? {};
  return prettier.format(content, { ...opts, parser: "markdown" });
}

/**
 * Build the matrix markdown and run it through Prettier. Async wrapper around
 * `renderMatrixRaw` for parity with the on-disk file.
 */
export async function renderMatrix(registry, opts = {}) {
  const raw = renderMatrixRaw(registry, opts);
  return formatMarkdown(raw);
}

/**
 * Build the full matrix markdown without invoking Prettier. Pure (no I/O);
 * exported so tests can assert on structural output without depending on
 * Prettier's table-alignment behaviour.
 */
export function renderMatrixRaw(registry, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  const nextReview = new Date(now);
  nextReview.setUTCDate(nextReview.getUTCDate() + 90);
  const nextReviewISO = nextReview.toISOString().slice(0, 10);

  const lines = [];
  lines.push("# Hard rules — enforcement matrix");
  lines.push("");
  lines.push(
    `> **Last validated:** ${today} by @Skords-01. **Next review:** ${nextReviewISO}.`,
  );
  lines.push(`> **Status:** Active`);
  lines.push("");
  lines.push(
    "<!-- AUTO-GENERATED FILE. Do not edit by hand. Source: `docs/governance/hard-rules.json`. Regenerate via `pnpm hard-rules:generate`. -->",
  );
  lines.push("");
  lines.push(
    `Цей файл — машино-читабельний індекс із **${registry.rules.length}** Hard rules. Повні описи живуть в [\`AGENTS.md § Hard rules\`](../../AGENTS.md#hard-rules-do-not-break) — це джерело правди для людей. Реєстр у [\`hard-rules.json\`](./hard-rules.json) — джерело правди для скриптів. Матриця нижче — їх перетин: одним поглядом видно, **який механізм** ловить порушення кожного правила.`,
  );
  lines.push("");
  lines.push("## Quick links");
  lines.push("");
  lines.push("- Реєстр (JSON): [`hard-rules.json`](./hard-rules.json)");
  lines.push("- Schema: [`hard-rules.schema.json`](./hard-rules.schema.json)");
  lines.push(
    "- Generator: [`scripts/docs/generate-hard-rules-matrix.mjs`](../../scripts/docs/generate-hard-rules-matrix.mjs)",
  );
  lines.push("- Sync gate: `pnpm lint:hard-rules-registry`");
  lines.push("- CLI: `pnpm hard-rules:list` (plain-text dump for code-review)");
  lines.push("");
  lines.push("## Matrix");
  lines.push("");
  lines.push(
    "| # | Rule | Category | Severity | Scope | Enforced by | Links |",
  );
  lines.push(
    "| --- | ---- | -------- | -------- | ----- | ----------- | ----- |",
  );
  for (const rule of registry.rules) {
    lines.push(
      [
        `**${rule.id}**`,
        `[${escapePipes(rule.title)}](../../AGENTS.md#${anchorFromTitle(rule.id, rule.title)})`,
        `\`${CATEGORY_LABEL[rule.category] ?? rule.category}\``,
        SEVERITY_BADGE[rule.severity] ?? rule.severity,
        renderScope(rule),
        renderEnforcement(rule),
        renderLinks(rule),
      ]
        .map((c) => `| ${c} `)
        .join("") + "|",
    );
  }
  lines.push("");
  lines.push("## Severity legend");
  lines.push("");
  lines.push("| Severity | Meaning |");
  lines.push("| -------- | ------- |");
  lines.push(
    "| 🛑 `blocker` | CI / lint / branch protection blocks the merge. The rule is enforced before code can land. |",
  );
  lines.push(
    "| ⚠ `warning` | Lint warns but does not block. Reviewer is expected to triage. |",
  );
  lines.push("");
  lines.push("## Category legend");
  lines.push("");
  lines.push("| Category | Meaning |");
  lines.push("| -------- | ------- |");
  lines.push(
    "| `blocker-invariant` | Ship-stopping correctness or process invariant — DB integrity, deploy safety, branch-protection, hooks. Violation = data loss / outage / silent regression. |",
  );
  lines.push(
    "| `lint-enforced-convention` | Style or process rule with mechanical enforcement (ESLint plugin, commitlint, governance-sync, freshness). Same blocker severity, but classification highlights that the gate is a linter, not a runtime invariant. |",
  );
  lines.push(
    "| `active-initiative` | Rule shipped with an explicit allowlist + deadline (see linked TODO/initiative). Treated as a blocker for new code; existing exceptions are tracked separately. |",
  );
  lines.push("");
  lines.push(
    "Used by initiative `0009-agent-os-hardening` Phase 3.1 (Hard Rules slim-down) — does not change current enforcement.",
  );
  lines.push("");
  lines.push("## How to add a rule");
  lines.push("");
  lines.push(
    "1. Append a new entry to [`hard-rules.json`](./hard-rules.json) (next integer `id`, matching the `### N. …` heading number you'll add to AGENTS.md).",
  );
  lines.push(
    "2. Add the human-readable description in [`AGENTS.md § Hard rules`](../../AGENTS.md#hard-rules-do-not-break) and the same numbered bullet in [`CONTRIBUTING.md § Hard rules`](../../CONTRIBUTING.md). All three move in one PR (Hard Rule #15).",
  );
  lines.push(
    "3. Run `pnpm hard-rules:generate` and commit the regenerated `hard-rules-matrix.md` in the same PR.",
  );
  lines.push(
    "4. CI runs `pnpm hard-rules:check` (matrix freshness) and `pnpm lint:hard-rules-registry` (JSON ↔ AGENTS.md ↔ CONTRIBUTING.md sync).",
  );
  lines.push("");
  lines.push(
    "> See also: [`docs/playbooks/add-hard-rule.md`](../playbooks/add-hard-rule.md).",
  );
  lines.push("");
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function readRegistryFromDisk() {
  const raw = readFileSync(REGISTRY_PATH, "utf8");
  return loadRegistry(raw);
}

function renderPlainList(registry) {
  const lines = [
    `Hard rules — ${registry.rules.length} entries (registry v${registry.version})`,
    "",
  ];
  for (const r of registry.rules) {
    const enf = r.enforced_by
      .map((e) => `${KIND_LABEL[e.kind] ?? e.kind} ${e.ref}`)
      .join("; ");
    lines.push(
      `#${r.id}  [${String(r.severity).toUpperCase()}]  [${r.category}]  ${r.title}`,
    );
    lines.push(`        scope: ${r.scope.join(", ")}`);
    lines.push(`        enforced_by: ${enf}`);
    lines.push("");
  }
  return lines.join("\n");
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  const registry = readRegistryFromDisk();

  if (args.includes("--list")) {
    process.stdout.write(renderPlainList(registry) + "\n");
    process.exit(0);
  }

  const next = await renderMatrix(registry);
  if (args.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(MATRIX_PATH, "utf8");
    } catch {
      // missing file — treated as a diff
    }
    if (current !== next) {
      console.error(
        `${MATRIX_PATH} is out of date. Run \`pnpm hard-rules:generate\` and commit.`,
      );
      process.exit(1);
    }
    console.log(`${MATRIX_PATH} is up to date.`);
    process.exit(0);
  }

  writeFileSync(MATRIX_PATH, next);
  console.log(`Wrote ${MATRIX_PATH} — ${registry.rules.length} rules indexed.`);
}
