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
//      - docs/launch/                          (launch plans)
//      - docs/planning/                        (sprint plans)
//      - docs/audits/*-deep-dive/              (deep-dive recommendations)
//      - docs/integrations/*-roadmap.md        (integration roadmaps)
//      - docs/audits/*-implementation-roadmap.md (audit roadmaps)
//      - docs/initiatives/                     (multi-phase initiative trackers)
//      - docs/security/hardening/              (PR-bound hardening cards)
//      - docs/runbooks/                        (operations runbooks; refs may
//                                               describe target scripts)
//      - docs/architecture/diagrams/           (flow diagrams; refs name
//                                               components that may rename)
//      - docs/playbooks/                       (recipes referencing template
//                                               paths and example structures)
//      - docs/i18n/                            (i18n migration roadmap; refs
//                                               include planned target catalogs)
//      - docs/notes/spikes/                    (exploratory spike walkthroughs;
//                                               file refs may describe imagined
//                                               module shape pre-refactor)
//    Files in ADRs with Status: proposed are exempt (future refs OK).
//    All other dangling refs are reported as ERRORS (Hard Rule #15 — docs
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

  // Extract rule numbers from AGENTS.md (### N. ...)
  const agentsRuleRe = /^### (\d+)\.\s+(.+)$/gm;
  const agentsRules = new Map();
  let match;
  while ((match = agentsRuleRe.exec(agentsContent)) !== null) {
    agentsRules.set(parseInt(match[1], 10), match[2].trim());
  }

  // Extract rule numbers from CONTRIBUTING.md (N. **...**)
  const contribRuleRe = /^(\d+)\.\s+\*\*(.+?)\*\*/gm;
  const contribRules = new Set();
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
    const relPath = relative(ROOT, file);

    // Skip ADRs — they use their own Status format
    if (relPath.startsWith("docs/adr/") && !relPath.endsWith("README.md")) {
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
      /\*\*Last validated:\*\*/.test(headerBlock) ||
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
    const rel = relative(ROOT, f);
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
    if (relPath.startsWith("docs/launch/")) return true;
    if (relPath.startsWith("docs/planning/")) return true;
    // Deep-dive directories under `docs/audits/*-deep-dive/` (formerly
    // `docs/diagnostics/`, merged 2026-05-05) describe recommendations —
    // refs to suggested-but-not-yet-created files (`scripts/<new>.mjs`,
    // `apps/web/tests/integration/<new>.test.ts`, etc.) are part of the
    // recommendation surface, not Hard Rule #15 violations. Deep-dives
    // graduate into trackers in `docs/audits/*-implementation-roadmap.md` /
    // `docs/tech-debt/` once accepted.
    if (/^docs\/audits\/[^/]+-deep-dive\//.test(relPath)) return true;
    // `docs/initiatives/` track multi-phase work; refs may describe
    // pre-decomposition structure (e.g., `agent.ts` before being split),
    // upcoming-phase target files, or historical "before" state. The
    // initiative status badge + PR-link table is the source of truth for
    // shipped state, not inline file refs.
    if (relPath.startsWith("docs/initiatives/")) return true;
    // `docs/security/hardening/` are PR-bound hardening cards — they
    // describe the target file layout for each card. The card's status
    // badge and "PRs landed" section is the truth; inline path refs are
    // a description, not a contract.
    if (relPath.startsWith("docs/security/hardening/")) return true;
    // `docs/runbooks/` describe operations including target scripts that
    // may not be created until the runbook is exercised in incident.
    if (relPath.startsWith("docs/runbooks/")) return true;
    // `docs/architecture/diagrams/` document flows by naming components;
    // a component rename should not break the diagram doc until the
    // diagram is regenerated.
    if (relPath.startsWith("docs/architecture/diagrams/")) return true;
    // `docs/playbooks/` are recipes; refs are template/example paths
    // (e.g., `apps/web/src/App.tsx` as an illustrative anchor) and may
    // describe target structures rather than current code.
    if (relPath.startsWith("docs/playbooks/")) return true;
    // `docs/i18n/` describes the i18n migration roadmap; refs include
    // planned target catalogs (e.g., `apps/web/src/shared/i18n/en.ts`)
    // that don't exist until the corresponding migration phase lands.
    if (relPath.startsWith("docs/i18n/")) return true;
    // `docs/notes/spikes/` are exploratory spike walkthroughs (PR-04
    // bus-factor knowledge transfer). Inline file refs describe the
    // module structure as the spike author imagined / mapped it; if
    // a refactor moved a file, the spike note should not block CI.
    // Once a spike graduates to canonical architecture, the doc moves
    // to `docs/architecture/` (non-aspirational) and refs become
    // contracts. Until then, treat as warnings.
    if (relPath.startsWith("docs/notes/spikes/")) return true;
    // `docs/testing/<date>-tests-pr-plan.md` and
    // `docs/testing/<date>-tests-review.md` are dated test-PR plans and
    // analyses — same shape as `docs/planning/`: refs describe upcoming
    // test files (`apps/server/src/.../foo.test.ts`,
    // `apps/web/tests/smoke/<flow>.spec.ts`) that the PRs they plan will
    // create. The README + mutation.md in the same directory describe
    // current behaviour and remain non-aspirational.
    if (
      /^docs\/testing\/\d{4}-\d{2}-\d{2}-tests-(pr-plan|review)\.md$/.test(
        relPath,
      )
    )
      return true;
    if (
      relPath.startsWith("docs/integrations/") &&
      relPath.endsWith("-roadmap.md")
    )
      return true;
    if (
      relPath.startsWith("docs/audits/") &&
      relPath.endsWith("-implementation-roadmap.md")
    )
      return true;
    // `docs/audits/<date>-<slug>-pr-plan.md` are PR-by-PR plans attached to
    // a `<date>-<slug>.md` audit. Refs describe target file layouts for PRs
    // that have not landed yet (e.g. `apps/web/src/core/security/AppLock.tsx`
    // before PR-1a). The plan's PR-link / status table is the source of
    // truth for shipped work; concrete refs are part of the roadmap surface.
    if (relPath.startsWith("docs/audits/") && relPath.endsWith("-pr-plan.md"))
      return true;
    return false;
  }

  let totalRefs = 0;
  let danglingErrors = 0;
  let danglingWarns = 0;
  const danglingByFile = new Map(); // relPath -> { aspirational: bool, refs: [] }

  for (const file of docsFiles) {
    const relPath = relative(ROOT, file);
    const content = readFileSync(file, "utf-8");

    // Check if this is a "proposed" ADR (future refs are OK)
    if (
      relPath.startsWith("docs/adr/") &&
      /Status:\*?\*?\s*proposed/i.test(content)
    ) {
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
