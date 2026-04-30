#!/usr/bin/env node
// scripts/docs/check-adr-graph.mjs
//
// Validate the integrity of the ADR collection in `docs/adr/`:
//
//   1. Every ADR file (NNNN-*.md) has a recognised `Status:` value.
//   2. Every ADR file has a `Supersedes:` field (`—` for none, or a list
//      of `ADR-NNNN` references that must resolve).
//   3. The supersede graph is **bidirectional**: if A says it supersedes
//      B, then B's status must be `superseded by ADR-A`. The reverse
//      direction is also enforced — superseded ADRs must declare which
//      ADR replaced them.
//   4. Every ADR file is listed in `docs/adr/README.md` (the «Поточні
//      ADR» table) under its number.
//   5. No "dangling" ADRs: every file has a numeric prefix and its
//      status is one of accepted / proposed / deprecated / superseded.
//
// Both English and Ukrainian field names are accepted in metadata
// (`Status:` / `Статус:`, `Supersedes:` / `Замінює:`) — ADR-0026 and
// ADR-0027 use the Ukrainian form and would otherwise be rejected.
//
// Usage:
//   node scripts/docs/check-adr-graph.mjs            # CI gate
//   node scripts/docs/check-adr-graph.mjs --json     # machine-readable report
//
// Exits 0 if the graph is valid; 1 if any rule is violated.

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");
const ADR_DIR = resolve(REPO_ROOT, "docs/adr");
const README_PATH = resolve(ADR_DIR, "README.md");

const ADR_FILE_RE = /^(\d{4})-[a-z0-9-]+\.md$/;
const ADR_REF_RE = /\bADR-(\d{4})\b/gi;

const VALID_STATUSES = new Set([
  "accepted",
  "proposed",
  "deprecated",
  "superseded",
]);

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the metadata bullet at the top of an ADR. Returns null if the
 * field is absent. Tolerates leading whitespace, varying dash styles, and
 * either English or Ukrainian field names from `aliases`.
 */
export function extractField(content, aliases) {
  const escaped = aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(
    `^\\s*-\\s+\\*\\*(?:${escaped.join("|")}):\\*\\*\\s*(.+?)\\s*$`,
    "m",
  );
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Parse an ADR's metadata + supersede graph data. Returns:
 *   { number, file, statusRaw, status, supersedeTargets, supersededBy, errors }
 * Errors here are field-level only (missing Status, malformed Supersedes);
 * cross-file consistency is checked in `validateGraph`.
 */
export function parseAdr(file, content) {
  const m = basename(file).match(ADR_FILE_RE);
  if (!m) {
    return {
      file,
      number: null,
      errors: [`filename does not match NNNN-kebab-case-title.md`],
    };
  }
  const number = m[1];

  const statusRaw = extractField(content, ["Status", "Статус"]) ?? null;
  const supersedesRaw =
    extractField(content, ["Supersedes", "Замінює"]) ?? null;

  const errors = [];

  // Normalise status. Strip trailing HTML comments / extra commentary.
  const cleaned = (statusRaw ?? "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim()
    .toLowerCase();
  let status = null;
  let supersededBy = null;
  if (!cleaned) {
    errors.push("missing `Status:` field");
  } else if (cleaned.startsWith("superseded by")) {
    status = "superseded";
    const refs = [...cleaned.matchAll(ADR_REF_RE)];
    if (refs.length !== 1) {
      errors.push(
        `Status says superseded but no single ADR-NNNN reference found in: "${statusRaw}"`,
      );
    } else {
      supersededBy = refs[0][1];
    }
  } else if (VALID_STATUSES.has(cleaned)) {
    status = cleaned;
  } else {
    errors.push(
      `unknown status "${statusRaw}" — expected one of: ${[...VALID_STATUSES].join(", ")} or "superseded by ADR-NNNN"`,
    );
  }

  // Parse supersedes: `—` means "supersedes nothing", otherwise comma /
  // space separated list of ADR-NNNN refs.
  const supersedeTargets = [];
  if (supersedesRaw === null) {
    errors.push("missing `Supersedes:` field");
  } else {
    const cleanedSup = supersedesRaw.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (cleanedSup && cleanedSup !== "—" && cleanedSup !== "-") {
      const matches = [...cleanedSup.matchAll(ADR_REF_RE)];
      if (matches.length === 0) {
        errors.push(
          `Supersedes field is non-empty but contains no ADR-NNNN references: "${supersedesRaw}"`,
        );
      }
      for (const ref of matches) supersedeTargets.push(ref[1]);
    }
  }

  return {
    file,
    number,
    statusRaw,
    status,
    supersedeTargets,
    supersededBy,
    errors,
  };
}

/**
 * Collect all numeric ADR-NNNN entries in the README's table column.
 * Returns a Set of zero-padded 4-digit strings.
 */
export function listIndexedNumbers(readmeContent) {
  const indexed = new Set();
  // Match lines like:
  //   | 0001 | Monetization architecture | proposed | …
  // The leading `|` and the column for the number make matching robust to
  // surrounding columns moving around.
  const re = /^\s*\|\s*(\d{4})\s*\|/gm;
  for (const m of readmeContent.matchAll(re)) {
    indexed.add(m[1]);
  }
  return indexed;
}

/**
 * Validate the cross-file invariants given the parsed ADRs and the README
 * index. Returns an array of human-readable error strings.
 */
export function validateGraph(adrs, readmeIndexed) {
  const errors = [];
  const byNumber = new Map();
  for (const a of adrs) {
    if (a.number) byNumber.set(a.number, a);
  }

  for (const a of adrs) {
    // 1. Per-file errors are bubbled up directly.
    for (const e of a.errors) {
      errors.push(`${basename(a.file)}: ${e}`);
    }
    if (!a.number) continue;

    // 2. README-index check.
    if (!readmeIndexed.has(a.number)) {
      errors.push(
        `${basename(a.file)}: ADR-${a.number} is not listed in docs/adr/README.md`,
      );
    }

    // 3. Supersedes references must resolve to existing ADR files.
    for (const target of a.supersedeTargets) {
      const targetAdr = byNumber.get(target);
      if (!targetAdr) {
        errors.push(
          `${basename(a.file)}: Supersedes ADR-${target} but no such ADR exists`,
        );
        continue;
      }
      if (targetAdr.status !== "superseded") {
        errors.push(
          `${basename(a.file)}: claims to supersede ADR-${target}, but ADR-${target}'s Status is "${targetAdr.statusRaw}" (expected "Superseded by ADR-${a.number}")`,
        );
      } else if (targetAdr.supersededBy !== a.number) {
        errors.push(
          `${basename(a.file)}: claims to supersede ADR-${target}, but ADR-${target}'s Status points to ADR-${targetAdr.supersededBy} (mismatch)`,
        );
      }
    }

    // 4. Reverse direction: if this ADR is superseded, the replacement
    //    must declare it in its Supersedes list.
    if (a.status === "superseded" && a.supersededBy) {
      const target = byNumber.get(a.supersededBy);
      if (!target) {
        errors.push(
          `${basename(a.file)}: Status says superseded by ADR-${a.supersededBy} but no such ADR exists`,
        );
      } else if (!target.supersedeTargets.includes(a.number)) {
        errors.push(
          `${basename(a.file)}: marked as superseded by ADR-${a.supersededBy}, but ADR-${a.supersededBy}'s Supersedes field does not list ADR-${a.number}`,
        );
      }
    }
  }

  return errors;
}

// ── I/O ──────────────────────────────────────────────────────────────────────

/**
 * List candidate ADR files in `dir`. Skips `README.md`, `TEMPLATE.md`, and
 * anything that doesn't match the NNNN-kebab-case naming convention.
 */
export function listAdrFiles(dir) {
  return readdirSync(dir)
    .filter((f) => ADR_FILE_RE.test(f))
    .sort()
    .map((f) => resolve(dir, f));
}

function loadAll() {
  const files = listAdrFiles(ADR_DIR);
  const adrs = files.map((f) => parseAdr(f, readFileSync(f, "utf8")));
  const indexed = listIndexedNumbers(readFileSync(README_PATH, "utf8"));
  return { adrs, indexed, files };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  const { adrs, indexed } = loadAll();
  const errors = validateGraph(adrs, indexed);

  if (args.includes("--json")) {
    process.stdout.write(
      JSON.stringify(
        {
          adrs: adrs.map((a) => ({
            number: a.number,
            file: basename(a.file),
            status: a.status,
            supersedeTargets: a.supersedeTargets,
            supersededBy: a.supersededBy,
          })),
          indexed: [...indexed],
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    process.exit(errors.length > 0 ? 1 : 0);
  }

  if (errors.length > 0) {
    console.error(
      `[check-adr-graph] ${errors.length} problem(s) found in docs/adr/:`,
    );
    for (const e of errors) console.error(`  ✘ ${e}`);
    console.error(
      `\nFix the metadata in the offending ADR files (Status, Supersedes) or update docs/adr/README.md to list missing entries.`,
    );
    process.exit(1);
  }

  console.log(
    `[check-adr-graph] OK — ${adrs.length} ADR(s) checked, graph is consistent.`,
  );
  process.exit(0);
}
