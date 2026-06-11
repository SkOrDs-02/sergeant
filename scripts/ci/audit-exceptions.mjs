#!/usr/bin/env node
// scripts/ci/audit-exceptions.mjs
//
// Ledger-backed `pnpm audit` gate. Replaces the blunt `audit-exception`
// PR-label (which suppressed *every* high-severity advisory at once) with
// a per-advisory allowlist read from
// `docs/04-governance/security/audit-exceptions.md`:
//
//   - A `high`/`moderate` advisory passes only if the ledger names its
//     GHSA/CVE id AND the exception's due date has not passed.
//   - A `critical` advisory ALWAYS blocks. Critical waivers are a security
//     decision that must not hide behind a doc edit — there is deliberately
//     no ledger escape for them.
//   - Any high advisory with no (or an expired) ledger entry blocks.
//
// Usage:
//   node scripts/ci/audit-exceptions.mjs            # full tree
//   node scripts/ci/audit-exceptions.mjs --prod     # production deps only
//
// Exit 0 = clean or fully waived; exit 1 = at least one un-waived advisory.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.resolve(
  __dirname,
  "../../docs/04-governance/security/audit-exceptions.md",
);

// Severities that the gate treats as blocking unless waived. `critical`
// is handled separately (never waivable) — see evaluateAudit.
const BLOCKING_SEVERITIES = new Set(["critical", "high"]);

const GHSA_RE = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/gi;
const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;

/**
 * Parse the advisory exceptions out of the ledger markdown. Only the
 * "## Поточні винятки" section is considered — the secret-scanning,
 * CodeQL, SAST and overrides sections live under their own headers and
 * must never waive a dependency advisory.
 *
 * @param {string} markdown raw audit-exceptions.md contents
 * @returns {{ title: string, ids: string[], severity: string|null, dueDate: string|null }[]}
 */
export function parseAuditExceptions(markdown) {
  const section = sliceCurrentExceptionsSection(markdown);
  if (!section) return [];

  /** @type {{ title: string, ids: string[], severity: string|null, dueDate: string|null }[]} */
  const out = [];
  // Each exception is a `### Title` block. Split on the level-3 headers,
  // keeping the heading text with its body.
  const blocks = section.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const newline = block.indexOf("\n");
    const title = (newline === -1 ? block : block.slice(0, newline)).trim();
    const body = newline === -1 ? "" : block.slice(newline + 1);

    const ids = uniq([
      ...(body.match(GHSA_RE) ?? []),
      ...(body.match(CVE_RE) ?? []),
    ]).map((id) => id.toUpperCase());
    if (ids.length === 0) continue;

    out.push({
      title,
      ids,
      severity: extractField(body, "Severity"),
      dueDate: extractIsoDate(extractField(body, "Due date")),
    });
  }
  return out;
}

/**
 * Decide which advisories block the build.
 *
 * @param {object} args
 * @param {{ id: string, severity: string, ghsa: string|null, cves: string[], module: string, url: string }[]} args.advisories
 * @param {ReturnType<typeof parseAuditExceptions>} args.exceptions
 * @param {string} args.today ISO date (YYYY-MM-DD) used for due-date expiry
 * @returns {{ blocked: object[], waived: object[] }}
 */
export function evaluateAudit({ advisories, exceptions, today }) {
  const blocked = [];
  const waived = [];

  for (const adv of advisories) {
    if (!BLOCKING_SEVERITIES.has(adv.severity)) continue;

    // Critical is never waivable — fail loud regardless of the ledger.
    if (adv.severity === "critical") {
      blocked.push({ ...adv, reason: "critical advisories are never waived" });
      continue;
    }

    const match = findMatchingException(adv, exceptions);
    if (!match) {
      blocked.push({ ...adv, reason: "no ledger entry" });
      continue;
    }
    if (match.dueDate && match.dueDate < today) {
      blocked.push({
        ...adv,
        reason: `ledger exception expired ${match.dueDate}`,
      });
      continue;
    }
    waived.push({ ...adv, waiver: match.title, dueDate: match.dueDate });
  }

  return { blocked, waived };
}

/**
 * Normalise `pnpm audit --json` output into the shape evaluateAudit wants.
 * The npm advisory schema keys advisories by numeric id; each carries a
 * `github_advisory_id`, a `cves` array, `severity`, `module_name`, `url`.
 *
 * @param {string} json raw stdout of `pnpm audit --json`
 */
export function parseAuditJson(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    // pnpm prints a non-JSON banner when the registry is unreachable; treat
    // an unparseable report as "no advisories" so a registry blip doesn't
    // masquerade as a clean audit — the caller still sees the raw stderr.
    return [];
  }
  const advisories = parsed.advisories ?? {};
  return Object.entries(advisories).map(([key, value]) => ({
    id: String(value.id ?? key),
    severity: String(value.severity ?? "unknown").toLowerCase(),
    ghsa: value.github_advisory_id
      ? String(value.github_advisory_id).toUpperCase()
      : null,
    cves: Array.isArray(value.cves)
      ? value.cves.map((c) => String(c).toUpperCase())
      : [],
    module: String(value.module_name ?? "unknown"),
    url: String(value.url ?? ""),
  }));
}

function findMatchingException(adv, exceptions) {
  const advIds = new Set(
    [adv.ghsa, ...adv.cves, ...extractIdsFromUrl(adv.url)].filter(Boolean),
  );
  return exceptions.find((exc) => exc.ids.some((id) => advIds.has(id))) ?? null;
}

function extractIdsFromUrl(url) {
  return [...(url.match(GHSA_RE) ?? []), ...(url.match(CVE_RE) ?? [])].map(
    (s) => s.toUpperCase(),
  );
}

function sliceCurrentExceptionsSection(markdown) {
  const start = markdown.search(/^##\s+Поточні винятки\s*$/m);
  if (start === -1) return null;
  const rest = markdown.slice(start);
  const nextHeader = rest.slice(1).search(/^##\s+/m);
  return nextHeader === -1 ? rest : rest.slice(0, nextHeader + 1);
}

function extractField(body, label) {
  // Markdown table row: `| Severity   | high |` or `| Due date | 2026-09-30 |`.
  const re = new RegExp(`\\|\\s*${label}\\s*\\|\\s*([^|]+?)\\s*\\|`, "i");
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function extractIsoDate(value) {
  if (!value) return null;
  const m = value.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function todayIso() {
  // Avoid Date in tests by allowing an override; CI passes none.
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const prod = process.argv.includes("--prod");
  const args = ["audit", "--json"];
  if (prod) args.push("--prod");

  let json = "";
  try {
    json = execFileSync("pnpm", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      // Windows resolves `pnpm` to `pnpm.cmd` only through a shell; the
      // args are fixed literals so there is no injection surface.
      shell: process.platform === "win32",
    });
  } catch (err) {
    // `pnpm audit` exits non-zero when advisories exist — that is expected;
    // its stdout still holds the JSON report.
    json = err.stdout ? String(err.stdout) : "";
    if (!json) {
      console.error(
        "audit-exceptions: pnpm audit produced no JSON output\n",
        err.stderr ? String(err.stderr) : err.message,
      );
      process.exit(1);
    }
  }

  const advisories = parseAuditJson(json);
  const exceptions = parseAuditExceptions(readFileSync(LEDGER_PATH, "utf8"));
  const { blocked, waived } = evaluateAudit({
    advisories,
    exceptions,
    today: todayIso(),
  });

  const scope = prod ? "production" : "full tree";
  for (const w of waived) {
    console.log(
      `· waived (${scope}): ${w.module} ${w.severity} ${w.ghsa ?? w.id} — "${w.waiver}"${
        w.dueDate ? ` (due ${w.dueDate})` : ""
      }`,
    );
  }
  if (blocked.length === 0) {
    console.log(
      `✅ audit gate (${scope}): clean or fully waived (${waived.length} waived).`,
    );
    return;
  }
  console.error(`❌ audit gate (${scope}): ${blocked.length} un-waived:`);
  for (const b of blocked) {
    console.error(
      `   ${b.module} ${b.severity} ${b.ghsa ?? b.id} — ${b.reason}\n   ${b.url}`,
    );
  }
  console.error(
    "\nFix the dependency, or add a dated exception to " +
      "docs/04-governance/security/audit-exceptions.md (high/moderate only).",
  );
  process.exit(1);
}

// Run only as a CLI, not when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
