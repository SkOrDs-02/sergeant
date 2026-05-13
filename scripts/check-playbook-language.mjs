#!/usr/bin/env node
// scripts/check-playbook-language.mjs
//
// Lint that internal-facing playbooks and skill descriptions are written in
// Ukrainian (Hard Rule #15: «Internal docs I touched are in Ukrainian»).
//
// Targets:
//   - docs/playbooks/*.md     (skipping INDEX.md, README.md, _TEMPLATE-*.md,
//                              underscore-prefixed, and playbook-catalog.md)
//   - .agents/skills/*/SKILL.md (skipping the locked SKILL files that are
//                                explicitly tagged `lang: en` in frontmatter)
//
// Algorithm:
//   1. Parse optional YAML frontmatter (`---\nkey: value\n---`).
//   2. Strip noise that distorts a language ratio:
//        - frontmatter
//        - fenced code blocks (``` ... ```)
//        - inline code (`...`)
//        - URLs / autolinks
//        - the freshness header line (`> **Last validated:** ...`) — it is
//          mandated by the schema and contains an English handle.
//        - markdown headings markers (#) but NOT the heading text.
//   3. Count Cyrillic letters (Ukrainian alphabet: U+0400–U+04FF + ʼ apostrophe)
//      vs Latin letters (a–z, A–Z) in what remains.
//   4. ratio = cyrillic / max(1, cyrillic + latin).
//      If ratio < 0.4 → file is flagged as "English-dominant".
//
// Opt-out:
//   Frontmatter `lang: en` declares the file is intentionally English. The
//   linter still records the file (so we can audit the allow-list growth)
//   but does not flag it as a violation.
//
// Modes:
//   default        — exit 1 on violations. This is the gate-on mode used by
//                    `pnpm lint` and CI (initiative 0009 PR 1.2c, gate flipped
//                    after PR 1.2b reduced the warn-list to 0).
//   --warn-only    — print violations, but exit 0. Retained for ad-hoc local
//                    debugging when intentionally landing a draft EN file
//                    that will be translated in a follow-up commit.
//   --json         — emit machine-readable JSON instead of human output.
//
// Linked initiative: docs/initiatives/archive/_0009-agent-os-hardening.md (PR 1.2).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PLAYBOOK_DIR = resolve(REPO_ROOT, "docs/playbooks");
const SKILLS_DIR = resolve(REPO_ROOT, ".agents/skills");

/** Ratio threshold below which a file is considered "English-dominant". */
export const MIN_CYRILLIC_RATIO = 0.4;

/** Files inside docs/playbooks/ that are not real playbooks. */
const SKIP_PLAYBOOK_BASENAMES = new Set([
  "INDEX.md",
  "README.md",
  "playbook-catalog.md",
]);

export function isSkippablePlaybook(file) {
  const base = basename(file);
  if (SKIP_PLAYBOOK_BASENAMES.has(base)) return true;
  if (base.startsWith("_")) return true; // _TEMPLATE-*.md and friends
  return false;
}

/** Walk a directory, returning sorted relative file paths matching `predicate`. */
function walkFiles(dir, predicate) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs, predicate));
    } else if (entry.isFile() && predicate(abs)) {
      out.push(abs);
    }
  }
  return out.sort();
}

export function collectPlaybooks(dir = PLAYBOOK_DIR) {
  return walkFiles(dir, (f) => f.endsWith(".md") && !isSkippablePlaybook(f));
}

export function collectSkills(dir = SKILLS_DIR) {
  // Each immediate subdirectory of .agents/skills/ owns a SKILL.md.
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const abs = join(dir, entry.name, "SKILL.md");
    try {
      if (statSync(abs).isFile()) out.push(abs);
    } catch {
      // No SKILL.md in this directory — `pnpm lint:skills` already complains.
    }
  }
  return out.sort();
}

/**
 * Pull a YAML frontmatter block from the head of `source` and return the
 * parsed key→value pairs (string values only — that is all we need).
 * Returns `{ frontmatter, body }`. If the source has no frontmatter, the
 * returned `frontmatter` is an empty object and `body === source`.
 */
export function parseFrontmatter(source) {
  // Frontmatter must start at the very first character (no leading whitespace
  // or BOM allowed in our docs — Prettier normalizes that).
  if (!source.startsWith("---")) return { frontmatter: {}, body: source };
  // Look for a closing `---` on its own line.
  const endMatch = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!endMatch) return { frontmatter: {}, body: source };
  const yamlBody = endMatch[1];
  const body = source.slice(endMatch[0].length);
  const frontmatter = {};
  for (const rawLine of yamlBody.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

/**
 * Strip the parts of a Markdown body that distort a language ratio
 * (code blocks, inline code, URLs, freshness header, heading markers).
 */
export function stripNoise(body) {
  let s = body;
  // Fenced code blocks (``` ... ``` or ~~~).
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/~~~[\s\S]*?~~~/g, " ");
  // Inline code (`x`).
  s = s.replace(/`[^`\n]*`/g, " ");
  // The freshness header line is mandated by the schema and always carries
  // an English handle (`@<owner>`). Drop the entire line.
  s = s.replace(/^>\s*\*\*Last validated:\*\*.*$/gm, " ");
  // Markdown links: keep the link text, drop the URL.
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Bare URLs / autolinks.
  s = s.replace(/<https?:[^>]+>/g, " ");
  s = s.replace(/https?:\/\/\S+/g, " ");
  // Heading markers — keep the heading text, drop the leading hashes.
  s = s.replace(/^#{1,6}\s+/gm, "");
  // Markdown emphasis markers don't contain letters; leave them alone.
  return s;
}

/** Count Cyrillic and Latin letters in `text`. */
export function countAlphabets(text) {
  let cyrillic = 0;
  let latin = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (
      (code >= 0x0400 && code <= 0x04ff) ||
      code === 0x02bc /* MODIFIER LETTER APOSTROPHE — ʼ */
    ) {
      cyrillic += 1;
    } else if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      latin += 1;
    }
  }
  return { cyrillic, latin };
}

/**
 * Analyse a single file. Returns a result object — the caller decides
 * whether to flag it as a violation based on `result.flagged`.
 */
export function analyseFile(absPath, source) {
  const { frontmatter, body } = parseFrontmatter(source);
  const stripped = stripNoise(body);
  const { cyrillic, latin } = countAlphabets(stripped);
  const total = cyrillic + latin;
  const ratio = total === 0 ? 0 : cyrillic / total;
  const langOptOut = (frontmatter.lang || "").toLowerCase() === "en";
  const flagged = !langOptOut && total > 0 && ratio < MIN_CYRILLIC_RATIO;
  return {
    file: relative(REPO_ROOT, absPath),
    cyrillic,
    latin,
    ratio,
    langOptOut,
    flagged,
  };
}

/** Run the lint over playbooks + skills. Returns `{ results, violations }`. */
export function lint({
  playbookDir = PLAYBOOK_DIR,
  skillsDir = SKILLS_DIR,
} = {}) {
  const files = [...collectPlaybooks(playbookDir), ...collectSkills(skillsDir)];
  const results = files.map((abs) =>
    analyseFile(abs, readFileSync(abs, "utf8")),
  );
  const violations = results.filter((r) => r.flagged);
  return { results, violations };
}

function formatRatio(r) {
  return r.toFixed(2);
}

function printHumanReport({ results, violations }, { warnOnly }) {
  const total = results.length;
  const optOut = results.filter((r) => r.langOptOut).length;
  if (violations.length === 0) {
    console.log(
      `OK  Playbook + SKILL language: ${total} file(s) checked, ${optOut} on the \`lang: en\` allow-list, 0 violation(s).`,
    );
    return;
  }
  const headline = warnOnly
    ? `WARN  Playbook + SKILL language: ${violations.length} file(s) below ratio ${MIN_CYRILLIC_RATIO} (warn-only — exit code masked).`
    : `FAIL  Playbook + SKILL language: ${violations.length} file(s) below ratio ${MIN_CYRILLIC_RATIO}.`;
  console.error(headline);
  for (const r of violations) {
    console.error(
      `  ${r.file}: cyrillic=${r.cyrillic} latin=${r.latin} ratio=${formatRatio(r.ratio)}`,
    );
  }
  console.error(
    "\nFix options:\n" +
      "  1. Translate the file to Ukrainian (preferred — Hard Rule #15).\n" +
      "  2. If the file MUST stay English (e.g. external on-call shadowing),\n" +
      "     add `lang: en` to its YAML frontmatter and document the reason\n" +
      "     in the freshness header.\n",
  );
}

function printJson(report) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

export function main(argv = process.argv.slice(2)) {
  const warnOnly = argv.includes("--warn-only");
  const json = argv.includes("--json");
  const { results, violations } = lint();
  if (json) {
    printJson({
      ok: violations.length === 0,
      warnOnly,
      threshold: MIN_CYRILLIC_RATIO,
      results,
      violations,
    });
  } else {
    printHumanReport({ results, violations }, { warnOnly });
  }
  if (violations.length === 0) return 0;
  return warnOnly ? 0 : 1;
}

if (basename(process.argv[1] || "") === "check-playbook-language.mjs") {
  const code = main();
  process.exit(code);
}
