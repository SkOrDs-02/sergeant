#!/usr/bin/env node
// scripts/check-governance-sync.mjs
//
// CI script that validates governance document consistency:
//
// 1. Hard Rules sync: every "### N." heading in AGENTS.md § Hard rules
//    must have a matching "N. **..." entry in CONTRIBUTING.md § Hard rules.
//
// 2. Status badge coverage: every doc with a "Last validated:" freshness
//    header must also have a "> **Status:** ..." line (Hard Rule #10).
//
// 3. Dangling source refs: inline code refs like `apps/.../foo.ts` or
//    `packages/.../foo.ts` in docs are checked against the filesystem.
//    Glob/placeholder refs (containing `*`, `?`, `<`, `>`, `[`, `]`, `{`, `}`)
//    are skipped — those are templates, not concrete file refs.
//    Aspirational / planning / tracker doc trees describe planned, historical,
//    or target-state file structures whose refs naturally drift as code lands
//    or is decomposed. Their dangling refs are reported as WARNINGS only:
//      - docs/01-product/launch/                          (launch plans)
//      - docs/90-work/planning/                        (sprint plans)
//      - docs/90-work/audits/*-deep-dive/              (deep-dive recommendations)
//      - docs/02-engineering/integrations/*-roadmap.md        (integration roadmaps)
//      - docs/90-work/audits/*-implementation-roadmap.md (audit roadmaps)
//      - docs/90-work/initiatives/                     (multi-phase initiative trackers)
//      - docs/04-governance/security/hardening/              (PR-bound hardening cards)
//      - docs/03-operations/runbooks/                        (operations runbooks; refs may
//                                               describe target scripts)
//      - docs/02-engineering/architecture/diagrams/           (flow diagrams; refs name
//                                               components that may rename)
//      - docs/00-start/playbooks/                       (recipes referencing template
//                                               paths and example structures)
//      - docs/05-design/i18n/                            (i18n migration roadmap; refs
//                                               include planned target catalogs)
//      - docs/02-engineering/notes/spikes/                    (exploratory spike walkthroughs;
//                                               file refs may describe imagined
//                                               module shape pre-refactor)
//    Files in ADRs with Status: proposed or Status: Superseded (case-
//    insensitive) are exempt — future or historical decision records.
//    ADRs with `- **Note:** Historical` / `- **Note:** Історичн…` in the
//    header (first ~30 lines) are also exempt. All other dangling refs are
//    reported as ERRORS (Hard Rule #15 — docs
//    that describe current behaviour must move with code).
//
// Usage:
//   node scripts/check-governance-sync.mjs
//
// Exit code 1 on any failure.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`❌ ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`⚠️  ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Compact rules table parser (post-0009 PR 3.2 canonical AGENTS.md format).
// Mirrors `scripts/check-hard-rules-registry.mjs` so both gates agree on what
// "the AGENTS.md rule list" means.
function parseAgentsTableRules(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (!/^\d+$/.test(cells[0])) continue;
    const id = Number(cells[0]);
    const title = cells[1].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    if (!title) continue;
    out.set(id, title);
  }
  return out;
}

// ── Check 1: Hard Rules sync ─────────────────────────────────────────────────

function checkHardRulesSync() {
  console.log(
    "\n── Check 1: Hard Rules sync (AGENTS.md ↔ CONTRIBUTING.md) ──\n",
  );

  const agentsContent = readFileSync(resolve(ROOT, "AGENTS.md"), "utf-8");
  const contribContent = readFileSync(
    resolve(ROOT, "CONTRIBUTING.md"),
    "utf-8",
  );

  // Extract rule numbers from AGENTS.md. Post-initiative-0009 PR 3.2 the
  // canonical form is the compact rules table:
  //   `| 1 | DB types: coerce ... | \`blocker-invariant\` | [...](./...) |`
  // Fall back to `### N. <title>` headings for backwards compatibility (older
  // fixtures, downstream tooling) — see scripts/check-hard-rules-registry.mjs
  // which keeps the same dual parser.
  const agentsRules = parseAgentsTableRules(agentsContent);
  if (agentsRules.size === 0) {
    const headingRe = /^### (\d+)\.\s+(.+)$/gm;
    let m;
    while ((m = headingRe.exec(agentsContent)) !== null) {
      agentsRules.set(parseInt(m[1], 10), m[2].trim());
    }
  }

  // Extract rule numbers from CONTRIBUTING.md (N. **...**)
  const contribRuleRe = /^(\d+)\.\s+\*\*(.+?)\*\*/gm;
  const contribRules = new Set();
  let match;
  while ((match = contribRuleRe.exec(contribContent)) !== null) {
    contribRules.add(parseInt(match[1], 10));
  }

  let synced = 0;
  for (const [num, title] of agentsRules) {
    if (contribRules.has(num)) {
      synced++;
    } else {
      error(
        `Hard Rule #${num} ("${title}") exists in AGENTS.md but is missing from CONTRIBUTING.md § Hard rules.`,
      );
    }
  }

  if (synced === agentsRules.size && agentsRules.size > 0) {
    ok(`All ${agentsRules.size} Hard Rules are mirrored in CONTRIBUTING.md.`);
  }
}

// ── Check 2: Status badge coverage ───────────────────────────────────────────

function checkStatusBadges() {
  console.log("\n── Check 2: Status badge coverage (freshness → Status:) ──\n");

  const mdFiles = findMdFiles(ROOT);
  let hasFreshness = 0;
  let hasStatus = 0;
  let missing = 0;

  for (const file of mdFiles) {
    // Normalize to forward slashes for consistent path matching
    const relPath = relative(ROOT, file).replace(/\\/g, "/");

    // Skip ADRs — they use their own Status format
    if (
      relPath.startsWith("docs/04-governance/adr/") &&
      !relPath.endsWith("README.md")
    ) {
      continue;
    }
    // Skip templates
    if (relPath.includes("TEMPLATE")) continue;
    // Skip node_modules, .git, etc.
    if (
      relPath.startsWith("node_modules") ||
      relPath.startsWith(".git/") ||
      relPath.startsWith("apps/") ||
      relPath.startsWith("packages/")
    ) {
      continue;
    }

    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n").slice(0, 15);
    const headerBlock = lines.join("\n");

    const hasFreshnessMarker =
      /\*\*Last (?:validated|touched):\*\*/.test(headerBlock) ||
      /Last reviewed:/.test(headerBlock);

    if (!hasFreshnessMarker) continue;
    hasFreshness++;

    const hasStatusBadge = />\s*\*\*Status:\*\*/.test(headerBlock);
    if (hasStatusBadge) {
      hasStatus++;
    } else {
      error(`${relPath}: has freshness marker but no "> **Status:** …" badge.`);
      missing++;
    }
  }

  if (missing === 0 && hasFreshness > 0) {
    ok(`All ${hasFreshness} docs with freshness markers have Status: badges.`);
  } else {
    console.log(
      `   ${hasStatus}/${hasFreshness} docs with freshness have Status badges (${missing} missing).`,
    );
  }
}

// ── Check 3: Dangling source refs ────────────────────────────────────────────

function checkDanglingRefs() {
  console.log("\n── Check 3: Dangling source refs in docs ──\n");

  const mdFiles = findMdFiles(ROOT);
  // Only check docs/ folder and root .md files
  const docsFiles = mdFiles.filter((f) => {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    return (
      rel.startsWith("docs/") ||
      [
        "AGENTS.md",
        "CONTRIBUTING.md",
        "CLAUDE.md",
        "DEVIN.md",
        "README.md",
      ].includes(rel)
    );
  });

  // Regex to find inline code refs like `apps/...` or `packages/...` or `scripts/...`
  const refRe =
    /`((?:apps|packages|scripts)\/[^`\s]+\.(?:ts|tsx|js|jsx|mjs|cjs|sql|json))`/g;

  // Skip refs containing glob/placeholder chars — those are templates,
  // not concrete file refs. Examples: `apps/web/src/**/*.tsx`,
  // `apps/server/src/modules/<module>/types.ts`,
  // `packages/{shared,api-client}/**/*.ts`,
  // `apps/server/src/migrations/NNN_*.sql`.
  const PLACEHOLDER_CHARS = /[*?<>[\]{}]/;

  // Aspirational/roadmap doc trees: dangling refs describe planned/future
  // implementation, not current code. Report as warnings, not errors.
  function isAspirational(relPath) {
    if (relPath.startsWith("docs/01-product/launch/")) return true;
    if (relPath.startsWith("docs/90-work/planning/")) return true;
    // Deep-dive directories under `docs/90-work/audits/*-deep-dive/` (formerly
    // `docs/diagnostics/`, merged 2026-05-05) describe recommendations —
    // refs to suggested-but-not-yet-created files (`scripts/<new>.mjs`,
    // `apps/web/tests/integration/<new>.test.ts`, etc.) are part of the
    // recommendation surface, not Hard Rule #15 violations. Deep-dives
    // graduate into trackers in `docs/90-work/audits/*-implementation-roadmap.md` /
    // `docs/90-work/tech-debt/` once accepted.
    if (/^docs\/90-work\/audits\/[^/]+-deep-dive\//.test(relPath)) return true;
    // `docs/90-work/initiatives/` track multi-phase work; refs may describe
    // pre-decomposition structure (e.g., `agent.ts` before being split),
    // upcoming-phase target files, or historical "before" state. The
    // initiative status badge + PR-link table is the source of truth for
    // shipped state, not inline file refs.
    if (relPath.startsWith("docs/90-work/initiatives/")) return true;
    // `docs/04-governance/security/hardening/` are PR-bound hardening cards — they
    // describe the target file layout for each card. The card's status
    // badge and "PRs landed" section is the truth; inline path refs are
    // a description, not a contract.
    if (relPath.startsWith("docs/04-governance/security/hardening/"))
      return true;
    // `docs/03-operations/runbooks/` describe operations including target scripts that
    // may not be created until the runbook is exercised in incident.
    if (relPath.startsWith("docs/03-operations/runbooks/")) return true;
    // `docs/02-engineering/architecture/diagrams/` document flows by naming components;
    // a component rename should not break the diagram doc until the
    // diagram is regenerated.
    if (relPath.startsWith("docs/02-engineering/architecture/diagrams/"))
      return true;
    // `docs/00-start/playbooks/` are recipes; refs are template/example paths
    // (e.g., `apps/web/src/App.tsx` as an illustrative anchor) and may
    // describe target structures rather than current code.
    if (relPath.startsWith("docs/00-start/playbooks/")) return true;
    // `docs/05-design/i18n/` describes the i18n migration roadmap; refs include
    // planned target catalogs (e.g., `apps/web/src/shared/i18n/en.ts`)
    // that don't exist until the corresponding migration phase lands.
    if (relPath.startsWith("docs/05-design/i18n/")) return true;
    // `docs/00-start/agents/<topic>-roadmap.md` are forward-looking initiative
    // roadmaps describing scripts/files that will be created in upcoming
    // PRs. Treat refs as planned, not current.
    if (/^docs\/00-start\/agents\/[^/]+-roadmap\.md$/.test(relPath))
      return true;
    // `docs/02-engineering/notes/spikes/` are exploratory spike walkthroughs (PR-04
    // bus-factor knowledge transfer). Inline file refs describe the
    // module structure as the spike author imagined / mapped it; if
    // a refactor moved a file, the spike note should not block CI.
    // Once a spike graduates to canonical architecture, the doc moves
    // to `docs/02-engineering/architecture/` (non-aspirational) and refs become
    // contracts. Until then, treat as warnings.
    if (relPath.startsWith("docs/02-engineering/notes/spikes/")) return true;
    // `docs/02-engineering/testing/<date>-tests-pr-plan.md` and
    // `docs/02-engineering/testing/<date>-tests-review.md` are dated test-PR plans and
    // analyses — same shape as `docs/90-work/planning/`: refs describe upcoming
    // test files (`apps/server/src/.../foo.test.ts`,
    // `apps/web/tests/smoke/<flow>.spec.ts`) that the PRs they plan will
    // create. The README + mutation.md in the same directory describe
    // current behaviour and remain non-aspirational.
    if (
      /^docs\/02-engineering\/testing\/\d{4}-\d{2}-\d{2}-tests-(pr-plan|review)\.md$/.test(
        relPath,
      )
    )
      return true;
    if (
      relPath.startsWith("docs/02-engineering/integrations/") &&
      relPath.endsWith("-roadmap.md")
    )
      return true;
    if (
      relPath.startsWith("docs/90-work/audits/") &&
      relPath.endsWith("-implementation-roadmap.md")
    )
      return true;
    // `docs/90-work/audits/<date>-<slug>-pr-plan.md` are PR-by-PR plans attached to
    // a `<date>-<slug>.md` audit. Refs describe target file layouts for PRs
    // that have not landed yet (e.g. `apps/web/src/core/security/AppLock.tsx`
    // before PR-1a). The plan's PR-link / status table is the source of
    // truth for shipped work; concrete refs are part of the roadmap surface.
    if (
      relPath.startsWith("docs/90-work/audits/") &&
      relPath.endsWith("-pr-plan.md")
    )
      return true;
    // `docs/90-work/audits/<date>-<slug>-roast.md` are themed audit reports that
    // identify gaps and recommend remediations. Refs include target file
    // layouts the audit recommends creating (e.g. new ESLint rule paths,
    // new test files, refactor targets) — these become real once follow-up
    // PRs land. Treat as planned, same shape as `*-pr-plan.md`.
    if (
      relPath.startsWith("docs/90-work/audits/") &&
      relPath.endsWith("-roast.md")
    )
      return true;
    // `docs/90-work/audits/<date>-page-audit-*.md` and `*-consolidated-page-audit.md`
    // are dated static-analysis audit reports — same shape as `-roast.md`.
    // Refs describe code state at audit time; renames/decompositions after
    // the audit shouldn't fail CI on historical diagnostic notes.
    if (
      relPath.startsWith("docs/90-work/audits/") &&
      /(?:^|\/)\d{4}-\d{2}-\d{2}-(consolidated-)?page-audit-?/.test(relPath)
    )
      return true;
    // `docs/90-work/audits/README.md` is the audit index — refs may point at
    // historical audit subjects.
    if (relPath === "docs/90-work/audits/README.md") return true;
    // `docs/90-work/audits/archive/` holds superseded/completed audits — they
    // document a point-in-time snapshot (dead code found, links then-broken),
    // so their concrete refs are historical by design and must not gate
    // Rule #15 on current source (e.g. a file the audit flagged as dead and
    // that has since been deleted).
    if (relPath.startsWith("docs/90-work/audits/archive/")) return true;
    // Tracker-shaped surfaces (planning, multi-phase rollout). Same
    // semantics as `docs/90-work/initiatives/` — status badge + PR-link table is
    // the source of truth, inline file refs are descriptive.
    if (relPath.startsWith("docs/90-work/tech-debt/")) return true;
    if (relPath.startsWith("docs/01-product/marketing/")) return true;
    if (relPath.startsWith("docs/03-operations/observability/")) return true;
    if (relPath.startsWith("docs/05-design/design/redesign-v2/")) return true;
    return false;
  }

  let totalRefs = 0;
  let danglingErrors = 0;
  let danglingWarns = 0;
  const danglingByFile = new Map(); // relPath -> { aspirational: bool, refs: [] }

  for (const file of docsFiles) {
    // Normalize to forward slashes for consistent path matching
    const relPath = relative(ROOT, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf-8");

    // Proposed / superseded / header-flagged historical ADRs: inline file
    // refs describe future or legacy layout, not current code contracts.
    if (isAdrExemptFromDanglingRefCheck(content, relPath)) {
      continue;
    }

    // Check if this is the RN migration tracker (target-state refs are OK)
    if (relPath.includes("react-native-migration")) continue;

    const aspirational = isAspirational(relPath);

    let refMatch;
    while ((refMatch = refRe.exec(content)) !== null) {
      const refPath = refMatch[1];
      if (PLACEHOLDER_CHARS.test(refPath)) continue;
      totalRefs++;
      const absRef = resolve(ROOT, refPath);
      if (!existsSync(absRef)) {
        if (aspirational) danglingWarns++;
        else danglingErrors++;
        if (!danglingByFile.has(relPath)) {
          danglingByFile.set(relPath, { aspirational, refs: [] });
        }
        danglingByFile.get(relPath).refs.push(refPath);
      }
    }
  }

  if (danglingErrors === 0 && danglingWarns === 0) {
    ok(
      `All ${totalRefs} concrete source refs in docs resolve to existing files.`,
    );
  } else {
    if (danglingErrors > 0) {
      error(
        `${danglingErrors} of ${totalRefs} concrete source refs in non-aspirational docs point to non-existent files (Hard Rule #15 — update docs alongside code):`,
      );
    }
    if (danglingWarns > 0) {
      warn(
        `${danglingWarns} of ${totalRefs} concrete source refs in aspirational docs (launch/planning/roadmap) point to non-existent files — these are planned, not current:`,
      );
    }
    for (const [doc, { aspirational, refs }] of danglingByFile) {
      for (const ref of refs) {
        if (aspirational) warn(`  ${doc} → ${ref}`);
        else error(`  ${doc} → ${ref}`);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** @param {string} content @param {string} relPath */
export function isAdrExemptFromDanglingRefCheck(content, relPath) {
  if (!relPath.startsWith("docs/04-governance/adr/")) return false;
  if (/Status:\*?\*?\s*proposed/i.test(content)) return true;
  if (/Status:\*?\*?\s*Superseded/i.test(content)) return true;
  const adrHeader = content.split("\n").slice(0, 30).join("\n");
  if (/^-\s+\*\*Note:\*\*\s*(?:[Іі]сторичн|[Hh]istorical)/m.test(adrHeader)) {
    return true;
  }
  return false;
}

function findMdFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.isDirectory()) {
      results.push(...findMdFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

checkHardRulesSync();
checkStatusBadges();
checkDanglingRefs();

console.log("\n── Summary ──\n");
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);

if (errors > 0) {
  console.error("\n💥 Governance sync check FAILED.\n");
  process.exit(1);
} else if (warnings > 0) {
  console.log("\n⚠️  Governance sync check passed with warnings.\n");
} else {
  console.log("\n✅ Governance sync check passed.\n");
}
