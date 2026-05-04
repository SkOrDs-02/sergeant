#!/usr/bin/env node
// scripts/ci/validate-pr-body.mjs
//
// Validate a PR body against the repo template:
//   (a) all mandatory H2 sections from PULL_REQUEST_TEMPLATE.md are present
//   (b) at least one checkbox is ticked in the "Pre-flight" section
//   (c) at least one checkbox is ticked in "Docs updated alongside code?"
//       (the `N/A — no docs invalidated…` box counts as ticked)
//
// Usage:
//   PR_BODY="$(cat /path/to/body.md)" node scripts/ci/validate-pr-body.mjs
//   node scripts/ci/validate-pr-body.mjs --body-file /path/to/body.md
//
// Exits non-zero with a human-readable diagnostic on failure.
//
// In GitHub Actions, call with:
//   env:
//     PR_BODY: ${{ github.event.pull_request.body }}

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// H2 sections that MUST appear in every PR body. Matches current template
// (`/.github/PULL_REQUEST_TEMPLATE.md`). Keep this list in lock-step with it.
// Realigned with the template after the consolidation in commit `0318b8a6`
// ("docs(docs): consolidate playbooks and contribution flow") which renamed
// the historical `What changed` / `Why` / `How to test` / `Pre-flight` /
// `Docs updated alongside code?` sections into the unified Summary +
// Governing Skill + Playbook + Verification + Docs and Governance + Risk
// and Rollout + Hard Rule #15 schema below.
export const REQUIRED_SECTIONS = [
  "Summary",
  "Governing Skill",
  "Playbook",
  "Verification",
  "Docs and Governance",
  "Risk and Rollout",
  "Hard Rule #15",
];

// Sections where at least one checkbox must be ticked. Each entry is the
// heading text; the validator scans checkboxes until the next H2.
// `Docs and Governance` is the new home of the historical `Docs updated
// alongside code?` checkboxes; ≥1 ticked is enough because the explicit
// `N/A — no docs invalidated…` box counts as a ticked acknowledgement.
export const SECTIONS_REQUIRING_TICK = ["Docs and Governance"];

// Sections where every checkbox MUST be ticked. `Hard Rule #15` is special:
// each of its three boxes is a binary, factually-verifiable commitment
// (read AGENTS.md, internal docs in Ukrainian, no `--no-verify`). Allowing
// authors to tick only one degrades the registry — initiative 0011 phase 1
// closes that gap by requiring all three.
export const SECTIONS_REQUIRING_ALL_TICKED = ["Hard Rule #15"];

// ── Pure helpers (exported for tests) ────────────────────────────────────────

/**
 * Split a markdown body into H2 sections.
 * Returns [{ heading: string, body: string }] for every `## ...` heading.
 * The text before the first H2 is emitted as `{ heading: null, body }`.
 */
export function splitSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  let current = { heading: null, body: [] };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      sections.push({
        heading: current.heading,
        body: current.body.join("\n"),
      });
      current = { heading: m[1].trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  sections.push({ heading: current.heading, body: current.body.join("\n") });
  return sections;
}

/** Count markdown checkboxes ticked/unticked inside a section body. */
export function countCheckboxes(body) {
  let ticked = 0;
  let unticked = 0;
  const re = /^\s*(?:-|\*)\s*\[( |x|X)\]/gm;
  let match;
  while ((match = re.exec(body)) !== null) {
    if (match[1].toLowerCase() === "x") ticked++;
    else unticked++;
  }
  return { ticked, unticked };
}

/**
 * Run validation. Returns { ok: boolean, errors: string[], warnings: string[] }.
 */
export function validate(body) {
  const errors = [];
  const warnings = [];

  if (!body || body.trim().length < 20) {
    errors.push(
      "PR body is empty or suspiciously short (< 20 chars). Fill in the template.",
    );
    return { ok: false, errors, warnings };
  }

  const sections = splitSections(body);
  const headings = new Set(
    sections.filter((s) => s.heading).map((s) => s.heading),
  );

  for (const required of REQUIRED_SECTIONS) {
    if (!headings.has(required)) {
      errors.push(`Missing mandatory section: \`## ${required}\``);
    }
  }

  for (const required of SECTIONS_REQUIRING_TICK) {
    const section = sections.find((s) => s.heading === required);
    if (!section) continue; // already flagged above
    const { ticked } = countCheckboxes(section.body);
    if (ticked === 0) {
      errors.push(
        `Section \`## ${required}\` has no ticked checkboxes. Tick at least one (or the explicit N/A box).`,
      );
    }
  }

  for (const required of SECTIONS_REQUIRING_ALL_TICKED) {
    const section = sections.find((s) => s.heading === required);
    if (!section) continue; // already flagged above
    const { ticked, unticked } = countCheckboxes(section.body);
    if (ticked + unticked === 0) {
      errors.push(
        `Section \`## ${required}\` has no checkboxes. Restore the template boxes and tick all of them.`,
      );
    } else if (unticked > 0) {
      errors.push(
        `Section \`## ${required}\` has ${unticked} unticked checkbox(es); all ${ticked + unticked} must be ticked. ` +
          `Each commitment is binary and factually-verifiable — partial ticking degrades the registry.`,
      );
    }
  }

  // Sanity: body should not be an unedited copy of the template.
  // The template has the prompt "<!-- What changed in one tight paragraph or
  // a short flat list. -->" immediately inside `Summary`. If that comment
  // still shows up AND the section body is otherwise empty, the author
  // forgot to edit it.
  const summary = sections.find((s) => s.heading === "Summary");
  if (summary) {
    const text = summary.body.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (text.length === 0) {
      errors.push(
        "Section `## Summary` is empty. Describe the change in prose (comments alone don't count).",
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function loadBody() {
  const fileIdx = process.argv.indexOf("--body-file");
  if (fileIdx !== -1 && process.argv[fileIdx + 1]) {
    return readFileSync(resolve(process.argv[fileIdx + 1]), "utf8");
  }
  return process.env.PR_BODY || "";
}

/**
 * GitHub's `pull_request` webhook can fire with an empty `body` field on
 * `opened` events — the server processes the webhook faster than it commits
 * the body to storage. When that happens the `PR_BODY` env passed to us is
 * empty, which would falsely fail the validator. Fall back to fetching the
 * body via the REST API, which reads committed state.
 */
async function fetchBodyFromApi() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumber =
    process.env.PR_NUMBER ||
    process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\/merge/)?.[1];
  if (!token || !repo || !prNumber) return null;
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.body || "";
}

async function main() {
  let body = loadBody();

  // Surface what we actually received so CI failures are debuggable
  // (GitHub Actions has occasionally delivered an empty
  // `github.event.pull_request.body` when the webhook fires before the body
  // is persisted; we want that visible in the step log, not a mystery).
  const preview = (body || "").slice(0, 160).replace(/\n/g, "\\n");
  console.log(
    `→ PR body length: ${body ? body.length : 0} chars (preview: "${preview}…")`,
  );

  // Fall back to the REST API when the env-provided body is empty/absent.
  if (!body || body.trim().length < 20) {
    console.log(
      `→ Env-provided body is empty; fetching via REST API as fallback.`,
    );
    const fetched = await fetchBodyFromApi();
    if (fetched) {
      body = fetched;
      console.log(`→ REST API body length: ${body.length} chars.`);
    } else {
      console.log(
        `→ REST API fallback unavailable (no GITHUB_TOKEN / repo / PR number).`,
      );
    }
  }

  const { ok, errors, warnings } = validate(body);

  for (const w of warnings) console.warn(`⚠  ${w}`);
  if (ok) {
    console.log("✅PR body passes template validation.");
    process.exit(0);
  }

  console.error("❌PR body validation failed:\n");
  for (const e of errors) console.error(`  • ${e}`);
  console.error(
    "\nSee `.github/PULL_REQUEST_TEMPLATE.md` for the expected structure.",
  );
  process.exit(1);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((err) => {
    console.error(`❌Unexpected error:`, err);
    process.exit(2);
  });
}
